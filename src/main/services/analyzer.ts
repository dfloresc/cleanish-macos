import { readdir } from 'fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { AppAnalysis, AppArtifact, AppInfo, ArtifactCategory } from '../../shared/types'
import { pathSize } from './size'
import { assertDeletable } from './safety'
import { checkAborted, type IsAborted } from './scan-control'

const LIB = path.join(os.homedir(), 'Library')

type MatchMode = 'bundle' | 'bundlePrefix' | 'name' | 'groupContains' | 'savedState'

interface DirSpec {
  dir: string
  category: ArtifactCategory
  match: MatchMode
}

export const LIBRARY_SPECS: DirSpec[] = [
  { dir: path.join(LIB, 'Caches'), category: 'cache', match: 'bundlePrefix' },
  { dir: path.join(LIB, 'Preferences'), category: 'preferences', match: 'bundlePrefix' },
  { dir: path.join(LIB, 'Application Support'), category: 'appSupport', match: 'name' },
  { dir: path.join(LIB, 'Containers'), category: 'container', match: 'bundle' },
  { dir: path.join(LIB, 'Group Containers'), category: 'groupContainer', match: 'groupContains' },
  { dir: path.join(LIB, 'Saved Application State'), category: 'savedState', match: 'savedState' },
  { dir: path.join(LIB, 'HTTPStorages'), category: 'httpStorage', match: 'bundlePrefix' },
  { dir: path.join(LIB, 'Logs'), category: 'logs', match: 'name' },
  { dir: path.join(LIB, 'WebKit'), category: 'webkit', match: 'bundlePrefix' }
]

export async function analyzeApps(
  apps: AppInfo[],
  onProgress?: (current: string, done: number, total: number) => void,
  isAborted?: IsAborted
): Promise<AppAnalysis[]> {
  const byBundle = new Map<string, AppInfo>()
  const byName = new Map<string, AppInfo>()
  for (const appInfo of apps) {
    if (appInfo.bundleId) byBundle.set(appInfo.bundleId.toLowerCase(), appInfo)
    byName.set(appInfo.name.toLowerCase(), appInfo)
  }

  const artifactsByApp = new Map<string, AppArtifact[]>()
  const push = (appId: string, artifact: AppArtifact): void => {
    const list = artifactsByApp.get(appId)
    if (list) list.push(artifact)
    else artifactsByApp.set(appId, [artifact])
  }

  const matchBundleId = (candidate: string): AppInfo | undefined => {
    const lower = candidate.toLowerCase()
    const exact = byBundle.get(lower)
    if (exact) return exact
    const parts = lower.split('.')
    for (let i = parts.length - 1; i >= 2; i--) {
      const prefix = parts.slice(0, i).join('.')
      const hit = byBundle.get(prefix)
      if (hit) return hit
    }
    return undefined
  }

  let dirDone = 0
  for (const spec of LIBRARY_SPECS) {
    dirDone++
    onProgress?.(path.basename(spec.dir), dirDone, LIBRARY_SPECS.length)

    let entries
    try {
      entries = await readdir(spec.dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      checkAborted(isAborted)
      if (entry.isSymbolicLink()) continue
      const full = path.join(spec.dir, entry.name)
      let owner: AppInfo | undefined

      switch (spec.match) {
        case 'bundle':
          owner = byBundle.get(entry.name.toLowerCase())
          break
        case 'bundlePrefix': {
          let candidate = entry.name
          if (spec.category === 'preferences' && candidate.endsWith('.plist')) {
            candidate = candidate.slice(0, -'.plist'.length)
          }
          owner = matchBundleId(candidate)
          break
        }
        case 'savedState':
          if (entry.name.endsWith('.savedState')) {
            owner = byBundle.get(entry.name.slice(0, -'.savedState'.length).toLowerCase())
          }
          break
        case 'groupContains': {
          const lower = entry.name.toLowerCase()
          for (const [bid, appInfo] of byBundle) {
            if (lower === bid || lower.endsWith('.' + bid)) {
              owner = appInfo
              break
            }
          }
          break
        }
        case 'name':
          owner = byName.get(entry.name.toLowerCase())
          break
      }

      if (!owner) continue

      const sizeRes = await pathSize(full, isAborted)
      const protectedPath = owner.isSystem || !(await assertDeletable(full)).ok
      push(owner.id, { category: spec.category, path: full, size: sizeRes.size, protected: protectedPath,
        cleanable: !protectedPath && !owner.isRunning && ['cache', 'logs', 'savedState'].includes(spec.category) })
    }
  }

  return apps.map((appInfo) => {
    const artifacts = artifactsByApp.get(appInfo.id) ?? []
    artifacts.sort((a, b) => b.size - a.size)
    return {
      app: appInfo,
      artifacts,
      totalJunkSize: artifacts.filter((a) => a.cleanable).reduce((sum, a) => sum + a.size, 0),
      totalDataSize: artifacts.reduce((sum, a) => sum + a.size, 0)
    }
  })
}
