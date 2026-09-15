import path from 'node:path'

let generation = 0
const listeners = new Set<(paths?: string[]) => void>()

export function cacheGeneration(): number {
  return generation
}

export function onCacheInvalidated(listener: (paths?: string[]) => void): void {
  listeners.add(listener)
}

export function invalidateCaches(paths?: string[]): void {
  generation++
  for (const listener of listeners) listener(paths?.map((p) => path.resolve(p)))
}

export function overlaps(a: string, b: string): boolean {
  return a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep)
}

export function trimCache<K, V>(cache: Map<K, V>, limit = 1000): void {
  while (cache.size > limit) cache.delete(cache.keys().next().value as K)
}
