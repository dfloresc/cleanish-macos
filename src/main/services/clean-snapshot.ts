import { lstat, readdir, realpath } from 'fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { statStamp } from './size'
import { assertDeletable, checkDeletablePath, isWithin, PACKAGE_EXTENSION, TRASH } from './safety'

// Metadata only, and only for explicitly selected cleanup targets. A directory's
// own mtime does not change when an existing nested file is modified.
export async function snapshotTarget(target: string): Promise<{ digest: string; size: number }> {
  const hash = createHash('sha256')
  let size = 0
  const pending = [{ path: target, inBundle: /\.app$/i.test(target) }]
  const inTrash = isWithin(target, TRASH)
  while (pending.length) {
    const item = pending.pop()!
    const current = item.path
    const stat = await lstat(current)
    hash.update(JSON.stringify([current, statStamp(stat), stat.mode]))
    if (current !== target && !item.inBundle && !inTrash) {
      const safety = checkDeletablePath(current)
      if (!safety.ok) throw new Error('folder contains protected data')
      if (/\.app$/i.test(current)) {
        if (!(await assertDeletable(current)).ok) throw new Error('folder contains a protected application')
        item.inBundle = true
      } else if (PACKAGE_EXTENSION.test(current)) {
        // A media library inside a selected folder is removed with it; its contents are not inspected individually.
        item.inBundle = true
      }
    }
    if (stat.isSymbolicLink()) {
      // Removing a selected parent removes its links, never their targets.
      // Root links and linked ancestors are rejected by assertDeletable.
      continue
    }
    if (stat.isFile()) { size += stat.size; continue }
    if (!stat.isDirectory()) throw new Error('folder contains a special file')
    if (await realpath(current) !== current) throw new Error('linked directory')
    const entries = (await readdir(current)).sort()
    if (statStamp(await lstat(current)) !== statStamp(stat)) throw new Error('folder changed during preview')
    for (let i = entries.length - 1; i >= 0; i--) pending.push({ path: path.join(current, entries[i]), inBundle: item.inBundle })
  }
  return { digest: hash.digest('hex'), size }
}
