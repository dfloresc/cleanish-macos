import { readdir, readFile, rm, lstat } from 'fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import { parse as parsePlist, parseBinary, type PlistValue } from 'plist'
import type { AppInfo } from '../../shared/types'
import { dirSize, entryExists, mapLimit, statStamp } from './size'
import { checkAborted, type IsAborted } from './scan-control'

import { isProtectedBundleId, assertDeletable } from './safety'
import { onCacheInvalidated, overlaps, trimCache } from './cache'

const execFileAsync = promisify(execFile)

const APP_ROOTS = ['/Applications', path.join(os.homedir(), 'Applications'), '/System/Applications']

interface RawApp {
  path: string
  name: string
  isSystem: boolean
}

async function findAppBundles(isAborted?: IsAborted): Promise<RawApp[]> {
  const found: RawApp[] = []
  const pending = APP_ROOTS.map((root) => ({ path: root, depth: 0, isSystem: root === '/System/Applications' }))
  while (pending.length) {
    checkAborted(isAborted)
    const dir = pending.pop()!
    let entries
    try { entries = await readdir(dir.path, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue
      const full = path.join(dir.path, entry.name)
      if (/\.app$/i.test(entry.name)) {
        found.push({ path: full, name: entry.name.slice(0, -4), isSystem: dir.isSystem })
      } else if (dir.depth < 3) {
        pending.push({ path: full, depth: dir.depth + 1, isSystem: dir.isSystem })
      }
    }
  }
  return found
}

interface PlistInfo {
  bundleId: string | null
  name: string | null
  version: string | null
  iconFile: string | null
}

async function readPlist(appPath: string): Promise<PlistInfo> {
  const info: PlistInfo = { bundleId: null, name: null, version: null, iconFile: null }
  try {
    const raw = await readFile(path.join(appPath, 'Contents/Info.plist'))
    let parsedValue: PlistValue
    if (raw.subarray(0, 6).toString('latin1') === 'bplist') {
      parsedValue = parseBinary(raw)
    } else {
      parsedValue = parsePlist(raw.toString('utf8'))
    }
    const parsed = (parsedValue ?? {}) as Record<string, unknown>
    if (typeof parsed.CFBundleIdentifier === 'string') info.bundleId = parsed.CFBundleIdentifier
    if (typeof parsed.CFBundleDisplayName === 'string') info.name = parsed.CFBundleDisplayName
    else if (typeof parsed.CFBundleName === 'string') info.name = parsed.CFBundleName
    if (typeof parsed.CFBundleShortVersionString === 'string') info.version = parsed.CFBundleShortVersionString
    if (typeof parsed.CFBundleIconFile === 'string') info.iconFile = parsed.CFBundleIconFile
  } catch {
    /* unreadable plist */
  }
  return info
}

export async function runningAppPaths(): Promise<Set<string>> {
  const running = new Set<string>()
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'comm='], { timeout: 5000 })
    for (const line of stdout.split('\n')) {
      const idx = line.indexOf('.app/')
      if (idx === -1) continue
      running.add(line.slice(0, idx + 4))
    }
  } catch {
    /* ignore */
  }
  return running
}

export interface RunningApps {
  paths: Set<string>
  bundleIds: Set<string>
  names: Set<string>
}

// Identifiers of running apps, used to leave their caches and logs alone.
export async function runningApps(): Promise<RunningApps> {
  const paths = await runningAppPaths()
  const bundleIds = new Set<string>()
  const names = new Set<string>()
  await mapLimit([...paths], async (appPath) => {
    const info = await readPlist(appPath)
    if (info.bundleId) bundleIds.add(info.bundleId.toLowerCase())
    names.add((info.name ?? path.basename(appPath, '.app')).toLowerCase())
    names.add(path.basename(appPath, '.app').toLowerCase())
  }, 8)
  return { paths, bundleIds, names }
}

let iconCounter = 0

async function appIcon(appPath: string, iconFile: string | null): Promise<string | null> {
  const resDir = path.join(appPath, 'Contents/Resources')
  const base = iconFile ?? 'AppIcon'
  const candidates = [
    path.join(resDir, base.toLowerCase().endsWith('.icns') ? base : `${base}.icns`),
    path.join(resDir, 'AppIcon.icns'),
    path.join(resDir, 'app.icns')
  ]
  for (const icns of candidates) {
    if (!(await entryExists(icns))) continue
    const tmp = path.join(os.tmpdir(), `cmm-icon-${process.pid}-${iconCounter++}.png`)
    try {
      await execFileAsync('sips', ['-s', 'format', 'png', '-z', '64', '64', icns, '--out', tmp], {
        timeout: 8000
      })
      const buf = await readFile(tmp)
      return `data:image/png;base64,${buf.toString('base64')}`
    } catch {
      continue
    } finally {
      await rm(tmp, { force: true }).catch(() => undefined)
    }
  }
  try {
    const icon = await app.getFileIcon(appPath, { size: 'normal' })
    if (icon.isEmpty()) return null
    return icon.toDataURL()
  } catch {
    return null
  }
}

export async function scanApplications(
  onProgress?: (current: string, done: number, total: number) => void,
  isAborted?: IsAborted,
  metadataOnly = false
): Promise<AppInfo[]> {
  const bundles = await findAppBundles(isAborted)
  const running = await runningAppPaths()
  let done = 0

  // A few apps at a time: icon conversion and size measurement are independent per bundle.
  const results = await mapLimit(bundles, async (bundle): Promise<AppInfo | null> => {
    checkAborted(isAborted)
    done++
    onProgress?.(bundle.name, done, bundles.length)

    if (!(await entryExists(path.join(bundle.path, 'Contents/Info.plist')))) return null

    const info = await readPlist(bundle.path)

    const [sizeResult, icon] = await Promise.all([
      metadataOnly ? Promise.resolve({ size: 0 }) : dirSize(bundle.path, isAborted),
      metadataOnly ? Promise.resolve(null) : cachedIcon(bundle.path, info.iconFile)
    ])

    const deletionCheck = await assertDeletable(bundle.path)
    return {
      id: bundle.path,
      name: info.name ?? bundle.name,
      bundleId: info.bundleId,
      version: info.version,
      path: bundle.path,
      appSize: sizeResult.size,
      isSystem: bundle.isSystem || isProtectedBundleId(info.bundleId),
      uninstallBlockedReason: deletionCheck.ok ? undefined : deletionCheck.reason,
      isRunning: running.has(bundle.path),
      icon
    }
  }, metadataOnly ? 8 : 4)

  return results.filter((app): app is AppInfo => app !== null).sort((a, b) => b.appSize - a.appSize)
}

const iconCache = new Map<string, { stamp: string; icon: string | null }>()
onCacheInvalidated((paths) => {
  for (const key of iconCache.keys()) if (!paths || paths.some((p) => overlaps(p, key))) iconCache.delete(key)
})
async function cachedIcon(appPath: string, iconFile: string | null): Promise<string | null> {
  const stamp = statStamp(await lstat(path.join(appPath, 'Contents/Info.plist')))
  const cached = iconCache.get(appPath)
  if (cached?.stamp === stamp) return cached.icon
  const icon = await appIcon(appPath, iconFile)
  iconCache.set(appPath, { stamp, icon })
  trimCache(iconCache, 500)
  return icon
}
