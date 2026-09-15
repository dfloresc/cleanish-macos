import { readdir } from 'fs/promises'
import path from 'node:path'
import os from 'node:os'
import type { FdaStatus } from '../../shared/types'

const HOME = os.homedir()

const PROBE_PATHS = [
  path.join(HOME, 'Library/Mail'),
  path.join(HOME, 'Library/Messages'),
  path.join(HOME, 'Library/Safari')
]

export async function checkFullDiskAccess(): Promise<FdaStatus> {
  let checkedPath: string | null = null
  for (const probe of PROBE_PATHS) {
    try {
      await readdir(probe)
      checkedPath = probe
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EPERM' || code === 'EACCES') {
        return { granted: false, checkedPath: probe }
      }
      // ENOENT -> try next probe
    }
  }
  return { granted: checkedPath !== null, checkedPath }
}
