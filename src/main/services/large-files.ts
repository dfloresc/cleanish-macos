import { readdir, lstat } from 'fs/promises'
import path from 'node:path'
import type { LargeFile } from '../../shared/types'
import { HOME, PACKAGE_EXTENSION, assertDeletable } from './safety'
import { listFolder } from './explorer'
import { mapLimit } from './size'
import { checkAborted, type IsAborted } from './scan-control'

export const LARGE_FILE_LIMIT = 2000

// Shallow by default: the current folder's own files. The recursive mode walks
// the subtree with bounded concurrency, skipping links and package contents.
export async function scanLargeFiles(
  thresholdBytes: number,
  onProgress?: (current: string) => void,
  isAborted?: IsAborted,
  directory = HOME,
  recursive = false
): Promise<LargeFile[]> {
  if (!recursive) {
    const listing = await listFolder(directory, onProgress, isAborted)
    return listing.entries.filter((e) => !e.isDir && e.readable && e.size >= thresholdBytes).map((e) => ({
      path: e.path, size: e.size, modifiedAt: e.modifiedAt, protected: e.protected
    }))
  }
  const results: LargeFile[] = []
  let pending = [directory]
  let lastProgress = 0
  while (pending.length) {
    checkAborted(isAborted)
    const batch = pending.splice(0, 64)
    const discovered = await mapLimit(batch, async (dir): Promise<string[]> => {
      checkAborted(isAborted)
      const now = Date.now()
      if (now - lastProgress >= 100) { lastProgress = now; onProgress?.(path.relative(directory, dir) || path.basename(dir)) }
      let entries
      try { entries = await readdir(dir, { withFileTypes: true }) } catch { return [] }
      const subdirectories: string[] = []
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!/\.app$/i.test(entry.name) && !PACKAGE_EXTENSION.test(entry.name)) subdirectories.push(full)
          continue
        }
        if (!entry.isFile()) continue
        try {
          const st = await lstat(full)
          if (st.isFile() && st.size >= thresholdBytes) {
            results.push({ path: full, size: st.size, modifiedAt: st.mtimeMs, protected: !(await assertDeletable(full)).ok })
          }
        } catch { /* unreadable entry */ }
      }
      return subdirectories
    }, 8)
    pending = pending.concat(discovered.flat())
  }
  checkAborted(isAborted)
  return results.sort((a, b) => b.size - a.size).slice(0, LARGE_FILE_LIMIT)
}
