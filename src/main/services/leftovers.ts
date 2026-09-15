import { readdir } from 'fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { AppInfo, LeftoverGroup } from '../../shared/types'
import { pathSize } from './size'
import { isProtectedBundleId, assertDeletable } from './safety'
import { checkAborted, type IsAborted } from './scan-control'

const LIB = path.join(os.homedir(), 'Library')

interface LeftoverScanDir {
  dir: string
  kind: 'bundle' | 'bundlePrefix' | 'name' | 'groupContains' | 'savedState'
}

const SCAN_DIRS: LeftoverScanDir[] = [
  { dir: path.join(LIB, 'Caches'), kind: 'bundlePrefix' },
  { dir: path.join(LIB, 'Preferences'), kind: 'bundlePrefix' },
  { dir: path.join(LIB, 'Application Support'), kind: 'name' },
  { dir: path.join(LIB, 'Containers'), kind: 'bundle' },
  { dir: path.join(LIB, 'Group Containers'), kind: 'groupContains' },
  { dir: path.join(LIB, 'Saved Application State'), kind: 'savedState' },
  { dir: path.join(LIB, 'HTTPStorages'), kind: 'bundlePrefix' },
  { dir: path.join(LIB, 'Logs'), kind: 'name' },
  { dir: path.join(LIB, 'WebKit'), kind: 'bundlePrefix' }
]

const KNOWN_SYSTEM_NAMES = new Set(
  [
    'addressbook',
    'assistant',
    'biome',
    'callservices',
    'cloudkit',
    'com.apple',
    'coreduetd',
    'dictionaryservices',
    'identityservices',
    'icloud',
    'imagent',
    'itunes',
    'keychainaccess',
    'knowledge',
    'mail',
    'messages',
    'metadata',
    'mobile documents',
    'photos',
    'reminders',
    'safari',
    'siriknowledged',
    'suggestd',
    'syncservices',
    'usernotifications',
    'voicecontrol',
    'widgets'
  ].map((s) => s.toLowerCase())
)

function looksLikeBundleId(name: string): boolean {
  return /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9_-]+)+$/i.test(name)
}

export async function scanLeftovers(
  installedApps: AppInfo[],
  onProgress?: (current: string, done: number, total: number) => void,
  isAborted?: IsAborted
): Promise<LeftoverGroup[]> {
  const bundleIds = new Set<string>()
  const names = new Set<string>()
  // Vendor folders such as "Google", "Microsoft" or "JetBrains" hold data of installed
  // apps whose names differ from the folder. They are matched by the vendor segment of
  // the bundle identifier and by the first word of the app name.
  const vendors = new Set<string>()
  for (const appInfo of installedApps) {
    if (appInfo.bundleId) {
      bundleIds.add(appInfo.bundleId.toLowerCase())
      const segments = appInfo.bundleId.toLowerCase().split('.')
      if (segments.length >= 3) vendors.add(segments[1])
    }
    names.add(appInfo.name.toLowerCase())
    vendors.add(appInfo.name.toLowerCase().split(/\s+/)[0])
  }

  const belongsToInstalled = (candidate: string): boolean => {
    const lower = candidate.toLowerCase()
    if (bundleIds.has(lower)) return true
    const parts = lower.split('.')
    for (let i = parts.length - 1; i >= 2; i--) {
      if (bundleIds.has(parts.slice(0, i).join('.'))) return true
    }
    return false
  }

  interface Found {
    key: string
    name: string
    bundleId: string | null
    paths: string[]
  }
  const found = new Map<string, Found>()

  let dirDone = 0
  for (const spec of SCAN_DIRS) {
    dirDone++
    onProgress?.(path.basename(spec.dir), dirDone, SCAN_DIRS.length)

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

      let candidateId: string | null = null
      let isNameBased = false

      switch (spec.kind) {
        case 'bundle':
          candidateId = entry.name
          break
        case 'bundlePrefix': {
          candidateId = entry.name
          if (candidateId.endsWith('.plist')) candidateId = candidateId.slice(0, -'.plist'.length)
          break
        }
        case 'savedState':
          if (entry.name.endsWith('.savedState')) candidateId = entry.name.slice(0, -'.savedState'.length)
          break
        case 'groupContains': {
          const lower = entry.name.toLowerCase()
          let ownedByInstalled = false
          for (const bid of bundleIds) {
            if (lower.includes(bid)) {
              ownedByInstalled = true
              break
            }
          }
          if (ownedByInstalled) continue
          // "group.com.vendor.app" or "TEAMID.com.vendor.app". A team-prefixed short
          // name ("UBF8T346G9.Office") cannot be attributed and is left alone.
          const stripped = entry.name.replace(/^(group\.|[A-Z0-9]{10}\.)/i, '')
          if (!looksLikeBundleId(stripped) || vendors.has(stripped.split('.')[1]?.toLowerCase() ?? '')) continue
          candidateId = stripped
          break
        }
        case 'name':
          isNameBased = true
          break
      }

      if (isNameBased) {
        const lower = entry.name.toLowerCase()
        if (names.has(lower) || vendors.has(lower)) continue
        if (KNOWN_SYSTEM_NAMES.has(lower) || isProtectedBundleId(entry.name)) continue
        if (belongsToInstalled(entry.name)) continue
        const key = `name:${lower}`
        const existing = found.get(key)
        if (existing) existing.paths.push(full)
        else found.set(key, { key, name: entry.name, bundleId: null, paths: [full] })
        continue
      }

      if (!candidateId) continue
      if (isProtectedBundleId(candidateId)) continue
      if (belongsToInstalled(candidateId)) continue

      const base = candidateId.split('.').pop() ?? candidateId
      if (KNOWN_SYSTEM_NAMES.has(base.toLowerCase())) continue
      if (spec.kind !== 'name' && !looksLikeBundleId(candidateId)) continue

      const key = `bundle:${candidateId.toLowerCase()}`
      const existing = found.get(key)
      if (existing) existing.paths.push(full)
      else found.set(key, { key, name: base, bundleId: candidateId, paths: [full] })
    }
  }

  const groups: LeftoverGroup[] = []
  for (const f of found.values()) {
    let size = 0
    for (const p of f.paths) {
      checkAborted(isAborted)
      const res = await pathSize(p, isAborted)
      size += res.size
    }
    groups.push({
      id: f.key,
      name: f.name,
      bundleId: f.bundleId,
      paths: f.paths.sort(),
      size,
      // A possible leftover needs explicit review, but uncertainty about its
      // owner alone must not make ordinary third-party data undeletable.
      protected: !(await Promise.all(f.paths.map(assertDeletable))).every((check) => check.ok)
    })
  }

  groups.sort((a, b) => b.size - a.size)
  return groups
}
