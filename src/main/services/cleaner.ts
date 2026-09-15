import { shell } from 'electron'
import { lstat, readdir, realpath, rm } from 'fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type { BlockedTarget, CleanPreview, CleanResult, CleanTarget } from '../../shared/types'
import { assertDeletable, isWithin, TRASH } from './safety'
import { statStamp } from './size'
import { snapshotTarget } from './clean-snapshot'
import { appendOpLog } from './oplog'
import { invalidateCaches, trimCache } from './cache'

const execFileAsync = promisify(execFile)
interface ApprovedTarget { path: string; size: number; stamp: string; digest: string; permanent: boolean }
const previews = new Map<string, { expires: number; targets: ApprovedTarget[] }>()
let cleaning = false
const PERMANENT_DISABLED = 'permanent deletion disabled'

export interface PreviewOptions {
  // The user chose to skip the Trash for this selection.
  permanent?: boolean
  // The "Allow permanent deletion" setting. Without it nothing is removed permanently,
  // including items that are already in the Trash.
  allowPermanent?: boolean
}

export async function previewClean(targets: CleanTarget[], { permanent = false, allowPermanent = false }: PreviewOptions = {}): Promise<CleanPreview> {
  if (!Array.isArray(targets) || targets.length > 10000) throw new Error('invalid targets')
  const blocked: BlockedTarget[] = []
  const expanded = new Set<string>()
  for (const target of targets) {
    const p = target?.path
    if (typeof p !== 'string' || !path.isAbsolute(p) || p.includes('\0')) {
      blocked.push({ path: typeof p === 'string' ? p : '', reason: 'invalid path' })
      continue
    }
    const abs = path.resolve(p)
    if (abs === TRASH) {
      if (!allowPermanent) { blocked.push({ path: TRASH, reason: PERMANENT_DISABLED }); continue }
      try {
        if (await realpath(TRASH) !== TRASH || !(await lstat(TRASH)).isDirectory()) throw new Error('invalid trash')
        for (const name of await readdir(TRASH)) expanded.add(path.join(TRASH, name))
      } catch {
        blocked.push({ path: TRASH, reason: 'unreadable trash' })
      }
    } else expanded.add(abs)
  }

  const approved: ApprovedTarget[] = []
  // Parents precede children. Overlapping selections must not run twice or inflate totals.
  for (const p of [...expanded].sort((a, b) => a.length - b.length || a.localeCompare(b))) {
    if (approved.some((parent) => isWithin(p, parent.path))) continue
    // Items already in the Trash can only be removed permanently.
    const inTrash = isWithin(p, TRASH)
    if (inTrash && !allowPermanent) { blocked.push({ path: p, reason: PERMANENT_DISABLED }); continue }
    const check = await assertDeletable(p)
    if (!check.ok) { blocked.push({ path: p, reason: check.reason ?? 'blocked' }); continue }
    try {
      const before = statStamp(await lstat(p))
      const snapshot = await snapshotTarget(p)
      if (statStamp(await lstat(p)) !== before) { blocked.push({ path: p, reason: 'path changed' }); continue }
      approved.push({ path: p, size: snapshot.size, stamp: before, digest: snapshot.digest, permanent: (permanent && allowPermanent) || inTrash })
    } catch (error) {
      blocked.push({ path: p, reason: error instanceof Error ? error.message : 'unreadable or missing path' })
    }
  }
  const id = randomUUID()
  const now = Date.now()
  for (const [key, value] of previews) if (value.expires < now) previews.delete(key)
  previews.set(id, { targets: approved, expires: now + 10 * 60 * 1000 })
  trimCache(previews, 20)
  return {
    id, targets: approved.map(({ path: p, size, permanent: permanentTarget }) => ({ path: p, size, method: permanentTarget ? 'permanent' : 'trash' })),
    totalSize: approved.reduce((sum, t) => sum + t.size, 0), blocked,
    warnings: [
      ...(approved.some((t) => isWithin(t.path, TRASH)) ? ['trashPermanent'] : []),
      ...(blocked.some((b) => b.reason === PERMANENT_DISABLED) ? ['trashNeedsPermanent'] : [])
    ]
  }
}

export interface ExecuteOptions {
  // Re-read from the settings when executing, so an older preview cannot outlive the setting.
  allowPermanent: boolean
  permanent: boolean
  label: string
  action: 'trash' | 'permanent' | 'uninstall'
}

export async function executeClean(previewId: string, opts: ExecuteOptions): Promise<CleanResult> {
  if (cleaning) throw new Error('cleanup already running')
  const preview = previews.get(previewId)
  if (!preview || preview.expires < Date.now()) throw new Error('preview expired; review the selection again')
  previews.delete(previewId)
  cleaning = true
  const result: CleanResult = { succeeded: [], failed: [], freedBytes: 0, trashedBytes: 0 }
  try {
    for (const target of preview.targets) {
      const { path: abs, size, stamp, digest, permanent } = target
      try {
        const check = await assertDeletable(abs)
        if (!check.ok) throw new Error(check.reason)
        if (statStamp(await lstat(abs)) !== stamp) throw new Error('path changed since preview')
        if (permanent && !opts.allowPermanent) throw new Error(PERMANENT_DISABLED)
        if (permanent && !isWithin(abs, TRASH) && !opts.permanent) throw new Error('permanent deletion not requested')
        if (/\.app$/i.test(abs)) {
          const { stdout } = await execFileAsync('ps', ['-axo', 'comm='], { timeout: 5000 })
          if (stdout.split('\n').some((line) => line.startsWith(abs + '/'))) throw new Error('application is running')
        }
        if ((await snapshotTarget(abs)).digest !== digest) throw new Error('contents changed since preview')
        // Final check immediately before mutation; don't resolve links into a different target.
        if (!(await assertDeletable(abs)).ok || statStamp(await lstat(abs)) !== stamp) throw new Error('path changed since preview')
        if (permanent) await rm(abs, { recursive: true, force: false })
        else await shell.trashItem(abs)
        result.succeeded.push({ path: abs, size, method: permanent ? 'permanent' : 'trash' })
        if (permanent) result.freedBytes += size
        else result.trashedBytes += size
      } catch (err) {
        result.failed.push({ path: abs, reason: err instanceof Error ? err.message : String(err) })
      } finally {
        // Also invalidate on partial rm failures, which may already have changed the tree.
        invalidateCaches([abs, TRASH])
      }
    }
    if (result.succeeded.length) {
      await appendOpLog({
        ts: Date.now(), label: opts.label,
        action: opts.action === 'uninstall' ? 'uninstall' : result.succeeded.every((t) => t.method === 'permanent') ? 'permanent' : 'trash',
        paths: result.succeeded.map((t) => t.path), freedBytes: result.freedBytes
      })
    }
    return result
  } finally {
    cleaning = false
  }
}
