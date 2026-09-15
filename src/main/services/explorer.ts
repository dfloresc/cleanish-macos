import { readdir, lstat, realpath } from 'fs/promises'
import path from 'node:path'
import type { FolderEntry, FolderListing } from '../../shared/types'
import { cachedSize, mapLimit, pathSize, statStamp } from './size'
import { HOME, assertDeletable, isWithin } from './safety'
import { checkAborted, type IsAborted } from './scan-control'
import { cacheGeneration, onCacheInvalidated, overlaps, trimCache } from './cache'

const cache = new Map<string, { stamp: string; listing: FolderListing }>()
onCacheInvalidated((paths) => {
  for (const key of cache.keys()) {
    if (!paths || paths.some((p) => overlaps(p, key))) cache.delete(key)
  }
})

export async function assertBrowsable(p: string): Promise<string> {
  if (typeof p !== 'string' || !path.isAbsolute(p) || p.includes('\0')) throw new Error('invalid path')
  const abs = path.resolve(p)
  if (!isWithin(abs, HOME)) throw new Error('path outside home')
  if (await realpath(abs) !== abs) throw new Error('linked directory')
  if (!(await lstat(abs)).isDirectory()) throw new Error('not a directory')
  return abs
}

// Only combines listings already in memory; it never walks the filesystem.
function materialize(listing: FolderListing): FolderListing {
  const entries = listing.entries.map((entry): FolderEntry => {
    if (!entry.isDir) return { ...entry }
    const measured = cachedSize(entry.path)
    if (measured) return { ...entry, size: measured.size, sizeState: 'complete' }
    const child = cache.get(entry.path)
    if (!child) return { ...entry, size: 0, sizeState: 'unknown' }
    const known = materialize(child.listing)
    return { ...entry, size: known.size, sizeState: known.sizeState }
  })
  entries.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))
  return {
    ...listing,
    entries,
    size: entries.reduce((sum, entry) => sum + entry.size, 0),
    sizeState: listing.errors === 0 && entries.every((e) => e.sizeState === 'complete') ? 'complete' : 'partial'
  }
}

export async function listFolder(
  target: string,
  onProgress?: (current: string) => void,
  isAborted?: IsAborted
): Promise<FolderListing> {
  checkAborted(isAborted)
  const abs = await assertBrowsable(target)
  const stamp = statStamp(await lstat(abs))
  const cached = cache.get(abs)
  if (cached?.stamp === stamp) return materialize(cached.listing)
  const generation = cacheGeneration()
  // Reading a folder never reads any of its subdirectories.
  const dirents = await readdir(abs, { withFileTypes: true })
  let errors = 0
  const entries = await mapLimit(dirents, async (dirent): Promise<FolderEntry | null> => {
    checkAborted(isAborted)
    if (dirent.isSymbolicLink()) return null
    const full = path.join(abs, dirent.name)
    onProgress?.(dirent.name)
    try {
      const st = await lstat(full)
      if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory())) return null
      const protection = await assertDeletable(full)
      return {
        name: dirent.name, path: full, isDir: st.isDirectory(),
        size: st.isFile() ? st.size : 0,
        sizeState: st.isFile() ? 'complete' : 'unknown',
        modifiedAt: st.mtimeMs, protected: !protection.ok, readable: true
      }
    } catch {
      errors++
      return { name: dirent.name, path: full, isDir: dirent.isDirectory(), size: 0, sizeState: 'unknown', modifiedAt: 0, protected: true, readable: false }
    }
  })
  checkAborted(isAborted)
  const listing: FolderListing = { path: abs, size: 0, entries: entries.filter((e): e is FolderEntry => e !== null), errors, sizeState: 'partial' }
  if (generation === cacheGeneration()) {
    cache.set(abs, { stamp, listing })
    trimCache(cache, 500)
  }
  return materialize(listing)
}

// List immediately, then measure only the entries of this folder. Each directory
// total needs its descendants, but navigation reuses those cached totals and
// cancels the remaining work for the previous folder.
export async function measureFolder(
  target: string,
  onUpdate?: (listing: FolderListing, current: string, done: number, total: number) => void,
  isAborted?: IsAborted
): Promise<FolderListing> {
  const listing = await listFolder(target, undefined, isAborted)
  const directories = listing.entries.filter((entry) => entry.isDir && entry.readable)
  let done = 0
  let lastUpdate = Date.now()
  const snapshot = (): FolderListing => ({
    ...listing,
    entries: listing.entries.map((entry) => ({ ...entry })).sort((a, b) => b.size - a.size || a.name.localeCompare(b.name)),
    size: listing.entries.reduce((sum, entry) => sum + entry.size, 0),
    sizeState: listing.errors === 0 && listing.entries.every((entry) => entry.sizeState === 'complete') ? 'complete' : 'partial'
  })
  onUpdate?.(snapshot(), '', 0, directories.length)
  await mapLimit(directories, async (entry) => {
    checkAborted(isAborted)
    const result = await pathSize(entry.path, isAborted)
    checkAborted(isAborted)
    entry.size = result.size
    entry.sizeState = result.errors ? 'partial' : 'complete'
    listing.errors += result.errors
    done++
    if (done === directories.length || Date.now() - lastUpdate >= 80) {
      lastUpdate = Date.now()
      onUpdate?.(snapshot(), entry.name, done, directories.length)
    }
  }, 2)
  checkAborted(isAborted)
  return snapshot()
}
