import { readdir, lstat } from 'fs/promises'
import path from 'node:path'
import type { Stats } from 'node:fs'
import { checkAborted, type IsAborted } from './scan-control'
import { cacheGeneration, onCacheInvalidated, overlaps, trimCache } from './cache'

export interface SizeResult {
  size: number
  files: number
  errors: number
}

const cache = new Map<string, { stamp: string; result: SizeResult }>()
onCacheInvalidated((paths) => {
  for (const key of cache.keys()) {
    if (!paths || paths.some((p) => overlaps(p, key))) cache.delete(key)
  }
})

export function statStamp(st: { dev: number; ino: number; mtimeMs: number; ctimeMs: number; size: number }): string {
  return `${st.dev}:${st.ino}:${st.mtimeMs}:${st.ctimeMs}:${st.size}`
}

// At most eight filesystem requests; no Promise for every file in an entire tree.
export async function mapLimit<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 8): Promise<R[]> {
  let index = 0
  const results = new Array<R>(items.length)
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++
      results[current] = await fn(items[current])
    }
  })
  const settled = await Promise.allSettled(workers)
  const rejected = settled.find((r) => r.status === 'rejected')
  if (rejected?.status === 'rejected') throw rejected.reason
  return results
}

export async function pathSize(target: string, isAborted?: IsAborted): Promise<SizeResult> {
  checkAborted(isAborted)
  const abs = path.resolve(target)
  let st
  try {
    st = await lstat(abs)
  } catch {
    return { size: 0, files: 0, errors: 1 }
  }
  if (st.isSymbolicLink()) return { size: 0, files: 0, errors: 0 }
  if (!st.isDirectory()) return { size: st.isFile() ? st.size : 0, files: st.isFile() ? 1 : 0, errors: 0 }
  const generation = cacheGeneration()
  // Retain directory totals, not a global index of individual files. Totals
  // measured for an ancestor can then be reused when entering its descendants.
  async function measure(dir: string, stat: Stats): Promise<SizeResult> {
    checkAborted(isAborted)
    const stamp = statStamp(stat)
    const cached = cache.get(dir)
    if (cached?.stamp === stamp) return { ...cached.result }
    const result: SizeResult = { size: 0, files: 0, errors: 0 }
    let entries
    try {
      if (!(await lstat(dir)).isDirectory()) return result
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return { size: 0, files: 0, errors: 1 }
    }
    const children = await mapLimit(entries, async (entry) => {
      checkAborted(isAborted)
      if (entry.isSymbolicLink()) return null
      const full = path.join(dir, entry.name)
      try {
        const child = await lstat(full)
        if (child.isFile()) { result.size += child.size; result.files++ }
        return child.isDirectory() ? { path: full, stat: child } : null
      } catch { result.errors++; return null }
    })
    for (const child of children) {
      if (!child) continue
      const subtotal = await measure(child.path, child.stat)
      result.size += subtotal.size
      result.files += subtotal.files
      result.errors += subtotal.errors
    }
    checkAborted(isAborted)
    try {
      if (statStamp(await lstat(dir)) !== stamp) result.errors++
    } catch { result.errors++ }
    if (!result.errors && generation === cacheGeneration()) {
      cache.set(dir, { stamp, result: { ...result } })
      trimCache(cache, 10000)
    }
    return result
  }
  return measure(abs, st)
}

// Fast initial display; pathSize validates the stamp when measuring the row.
export function cachedSize(target: string): SizeResult | undefined {
  const result = cache.get(path.resolve(target))?.result
  return result ? { ...result } : undefined
}

export const dirSize = pathSize

export async function entryExists(p: string): Promise<boolean> {
  try {
    return !(await lstat(p)).isSymbolicLink()
  } catch {
    return false
  }
}
