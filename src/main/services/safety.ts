import { lstat, realpath, readFile } from 'fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parse, parseBinary } from 'plist'

export const HOME = os.homedir()
export const TRASH = path.join(HOME, '.Trash')

export interface SafetyCheck {
  ok: boolean
  reason?: string
}

export function isProtectedBundleId(bundleId: string | null | undefined): boolean {
  if (!bundleId) return false
  // These are separately installed Apple products, not components of macOS.
  if (/^com\.apple\.(iwork\.(pages|numbers|keynote)|dt\.xcode|garageband10|imovieapp|logic10|finalcut|motionapp|compressor|mainstage3|configurator|testflight)(\.|$)/i.test(bundleId)) return false
  return /^(com\.apple|apple|com\.icloud|com\.mobilenotes)(\.|$)/i.test(bundleId)
}

export const PACKAGE_EXTENSION = /\.(photoslibrary|musiclibrary|tvlibrary|aplibrary|fcpbundle|imovielibrary|logicx|band|sparsebundle)$/i

export function isWithin(target: string, root: string): boolean {
  return target === root || target.startsWith(root + path.sep)
}

// Protect system locations and shared Library roots, not ordinary user folders
// or every application's data. The preview checks the contents of selected trees.
export function createSafetyPolicy(home: string, appRoots = ['/Applications', path.join(home, 'Applications')]) {
  const library = path.join(home, 'Library')
  const trash = path.join(home, '.Trash')
  const userRoots = ['Desktop', 'Documents', 'Downloads', 'Movies', 'Music', 'Pictures', 'Public'].map((p) => path.join(home, p))
  const artifactRoots = ['Caches', 'Logs', 'Preferences', 'Saved Application State', 'Application Support', 'Containers', 'Group Containers', 'HTTPStorages', 'WebKit'].map((p) => path.join(library, p))
  const devRoots = ['.npm/_cacache', '.gradle/caches', 'Library/Developer/Xcode/DerivedData'].map((p) => path.join(home, p))
  const roots = [...userRoots, ...artifactRoots, ...devRoots, ...appRoots, trash]
  const secrets = ['.ssh', '.gnupg', '.aws', '.kube'].map((p) => path.join(home, p))
  // Owners inside the artifact roots that hold macOS or account data rather than
  // an application's regenerable files (device backups, crash reports, accounts…).
  const systemData = new Set(['apple', 'addressbook', 'clouddocs', 'cloudkit', 'dock', 'knowledge', 'syncservices', 'identityservices', 'callhistorydb', 'callhistorytransactions', 'com.apple.tcc', 'icloud', '.globalpreferences.plist', '.globalpreferences_m.plist',
    'mobilesync', 'crashreporter', 'fileprovider', 'app store', 'accounts', 'facetime', 'siri', 'wallet', 'passes', 'spotlight', 'quick look', 'notes', 'photos', 'safari', 'mail', 'messages', 'reminders', 'keychainaccess', 'byhost'])

  function checkPath(p: string): SafetyCheck {
    if (typeof p !== 'string' || !path.isAbsolute(p) || p.includes('\0')) return { ok: false, reason: 'invalid path' }
    const abs = path.resolve(p)
    if (abs === home || abs === '/' || abs === library || roots.includes(abs) || abs === path.join(home, '.config')) return { ok: false, reason: 'protected root' }
    if (!isWithin(abs, home) && !appRoots.some((root) => isWithin(abs, root))) return { ok: false, reason: 'protected location' }
    if (secrets.some((root) => isWithin(abs, root)) || /\.(keychain-db|keychain)$/i.test(abs)) {
      return { ok: false, reason: 'protected data' }
    }
    const appParts = abs.split(path.sep)
    if (appParts.slice(0, -1).some((part) => /\.app$/i.test(part))) return { ok: false, reason: 'application contents' }
    // Media libraries and other packages are opaque: their files are managed by the owning app.
    if (appParts.slice(0, -1).some((part) => PACKAGE_EXTENSION.test(part))) return { ok: false, reason: 'package contents' }
    if (appRoots.some((root) => isWithin(abs, root)) && !/\.app$/i.test(abs)) return { ok: false, reason: 'application directory' }
    if (isWithin(abs, library) && !artifactRoots.some((root) => isWithin(abs, root)) && !devRoots.some((root) => isWithin(abs, root))) {
      return { ok: false, reason: 'application data' }
    }
    const artifactRoot = artifactRoots.find((root) => isWithin(abs, root))
    if (artifactRoot) {
      // Check the owner, not filenames inside a third-party container. Apps often
      // have com.apple.* preference files and framework links in their own data.
      const owner = path.relative(artifactRoot, abs).split(path.sep)[0]
      const identifier = owner.replace(/^(group\.|[A-Z0-9]{10}\.)/i, '')
      if (isProtectedBundleId(identifier) || systemData.has(owner.toLowerCase())) return { ok: false, reason: 'protected system data' }
      if (artifactRoot === path.join(library, 'Preferences') && !/\.plist$/i.test(owner)) return { ok: false, reason: 'shared preferences' }
    }
    return { ok: true }
  }

  async function assertDeletable(p: string): Promise<SafetyCheck> {
    const policy = checkPath(p)
    if (!policy.ok) return policy
    const abs = path.resolve(p)
    try {
      const st = await lstat(abs)
      if (st.isSymbolicLink()) return { ok: false, reason: 'symlinks are never deleted' }
      if (!st.isDirectory() && !st.isFile()) return { ok: false, reason: 'special file' }
      // Reject any linked ancestor, including links that still point into an allowed root.
      if (await realpath(abs) !== abs) return { ok: false, reason: 'linked ancestor' }
      if (/\.app$/i.test(abs)) {
        if (!st.isDirectory()) return { ok: false, reason: 'invalid application' }
        if (process.execPath.startsWith(abs + path.sep)) return { ok: false, reason: 'current application' }
        let id: unknown
        try {
          const infoPath = path.join(abs, 'Contents/Info.plist')
          if (await realpath(infoPath) !== infoPath) return { ok: false, reason: 'linked application metadata' }
          const raw = await readFile(infoPath)
          const info = (raw.subarray(0, 6).toString() === 'bplist' ? parseBinary(raw) : parse(raw.toString())) as Record<string, unknown>
          id = info?.CFBundleIdentifier
        } catch {
          // Missing/nonstandard metadata does not make a user-installed app a
          // system app. System locations were already rejected above.
        }
        if (typeof id === 'string' && (isProtectedBundleId(id) || id === 'com.cleanish.app')) {
          return { ok: false, reason: 'protected application' }
        }
      }
      return { ok: true }
    } catch {
      return { ok: false, reason: 'unreadable or missing path' }
    }
  }

  return { checkPath, assertDeletable }
}

const policy = createSafetyPolicy(HOME)
export const assertDeletable = policy.assertDeletable
export const checkDeletablePath = policy.checkPath
