import { readdir } from 'fs/promises'
import path from 'node:path'
import type { JunkGroup } from '../../shared/types'
import { pathSize } from './size'
import { HOME, TRASH, assertDeletable } from './safety'
import { runningApps, type RunningApps } from './scanner'
import { checkAborted, type IsAborted } from './scan-control'

const LIB = path.join(HOME, 'Library')
const DEV_CACHES = [
  { id: 'dev-npm', name: 'npm', path: path.join(HOME, '.npm/_cacache') },
  { id: 'dev-yarn', name: 'Yarn', path: path.join(LIB, 'Caches/Yarn') },
  { id: 'dev-pip', name: 'pip', path: path.join(LIB, 'Caches/pip') },
  { id: 'dev-homebrew', name: 'Homebrew', path: path.join(LIB, 'Caches/Homebrew') },
  { id: 'dev-xcode', name: 'Xcode DerivedData', path: path.join(LIB, 'Developer/Xcode/DerivedData') },
  { id: 'dev-cocoapods', name: 'CocoaPods', path: path.join(LIB, 'Caches/CocoaPods') },
  { id: 'dev-gradle', name: 'Gradle', path: path.join(HOME, '.gradle/caches') }
]
const devPaths = new Set(DEV_CACHES.map((def) => def.path))

// Caches and logs are named after a bundle identifier or after the app.
export function belongsToRunningApp(entryName: string, running: RunningApps): boolean {
  const lower = entryName.toLowerCase().replace(/\.(plist|log)$/, '')
  if (running.names.has(lower)) return true
  const parts = lower.split('.')
  for (let i = parts.length; i >= 2; i--) {
    if (running.bundleIds.has(parts.slice(0, i).join('.'))) return true
  }
  return false
}

export async function scanSystemJunk(
  includeDev: boolean,
  onProgress?: (current: string, done: number, total: number) => void,
  isAborted?: IsAborted,
  running?: RunningApps
): Promise<JunkGroup[]> {
  const specs = [
    { id: 'trash', name: 'trash', path: TRASH, category: 'trash' as const, isDev: false },
    { id: 'logs', name: 'logs', path: path.join(LIB, 'Logs'), category: 'logs' as const, isDev: false },
    { id: 'caches', name: 'caches', path: path.join(LIB, 'Caches'), category: 'caches' as const, isDev: false },
    ...(includeDev ? DEV_CACHES.map((def) => ({ ...def, category: 'dev' as const, isDev: true })) : [])
  ]
  const active = running ?? (await runningApps())
  const groups: JunkGroup[] = []
  for (const [index, spec] of specs.entries()) {
    checkAborted(isAborted)
    onProgress?.(spec.name, index, specs.length)
    let entries
    try { entries = await readdir(spec.path, { withFileTypes: true }) } catch { continue }
    const paths: string[] = []
    let size = 0
    let skippedRunning = 0
    for (const entry of entries) {
      checkAborted(isAborted)
      if (entry.isSymbolicLink()) continue
      const full = path.join(spec.path, entry.name)
      if (spec.category === 'caches' && devPaths.has(full)) continue
      // Apps in use may hold these files open; they are offered once the app quits.
      if ((spec.category === 'caches' || spec.category === 'logs') && belongsToRunningApp(entry.name, active)) { skippedRunning++; continue }
      if (!(await assertDeletable(full)).ok) continue
      const result = await pathSize(full, isAborted)
      if (result.errors) continue
      paths.push(full)
      size += result.size
    }
    if (paths.length) groups.push({
      id: spec.id, name: spec.name, category: spec.category, isDev: spec.isDev, paths, size,
      note: spec.category === 'trash' ? 'trashNote' : skippedRunning ? 'runningNote' : undefined
    })
  }
  return groups.sort((a, b) => b.size - a.size)
}
