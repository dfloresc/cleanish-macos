import { BrowserWindow, ipcMain, shell } from 'electron'
import { statfs } from 'fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AppSettings, CleanTarget, DiskInfo, ScanProgress, ScanOptions, SmartScanResult } from '../shared/types'
import { scanApplications, runningAppPaths } from './services/scanner'
import { analyzeApps } from './services/analyzer'
import { scanSystemJunk } from './services/system-junk'
import { scanLeftovers } from './services/leftovers'
import { scanLargeFiles } from './services/large-files'
import { listFolder, measureFolder, assertBrowsable } from './services/explorer'
import { checkFullDiskAccess } from './services/permissions'
import { previewClean, executeClean, type ExecuteOptions } from './services/cleaner'
import { loadSettings, saveSettings } from './services/settings'
import { readOpLog } from './services/oplog'
import { beginScan, finishScan, checkAborted, abortCurrentScan, ScanAbortedError, type IsAborted } from './services/scan-control'

import { invalidateCaches } from './services/cache'
import { assertDeletable, isWithin } from './services/safety'
import { pathSize } from './services/size'

const execFileAsync = promisify(execFile)

const lastProgress = new Map<string, { time: number; phase: string }>()

function sendProgress(win: BrowserWindow | null, progress: Omit<ScanProgress, 'requestId'>, options: ScanOptions, isAborted: IsAborted): void {
  const previous = lastProgress.get(options.requestId)
  const now = Date.now()
  if (previous?.phase === progress.phase && now - previous.time < 80 && progress.percent !== 100 && !progress.folder) return
  if (win && !win.isDestroyed() && !isAborted()) {
    lastProgress.set(options.requestId, { time: now, phase: progress.phase })
    win.webContents.send('scan:progress', { ...progress, requestId: options.requestId })
  }
}

function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

type ScanFn<T> = (isAborted: IsAborted) => Promise<T>

async function runScan<T>(event: Electron.IpcMainInvokeEvent, options: ScanOptions, fn: ScanFn<T>): Promise<T | null> {
  if (!options || typeof options.requestId !== 'string') throw new Error('missing scan id')
  const controller = beginScan(event.sender.id, options.requestId)
  const isAborted: IsAborted = () => controller.aborted || event.sender.isDestroyed()
  try {
    const result = await fn(isAborted)
    checkAborted(isAborted)
    return result
  } catch (err) {
    if (err instanceof ScanAbortedError) return null
    throw err
  } finally {
    finishScan(event.sender.id, controller)
    lastProgress.delete(options.requestId)
  }
}

export function registerIpc(): void {
  ipcMain.handle('disk:info', async (): Promise<DiskInfo> => {
    const stats = await statfs('/')
    const total = stats.blocks * stats.bsize
    const free = stats.bavail * stats.bsize
    return { total, free, used: total - free }
  })

  ipcMain.handle('permissions:fda', () => checkFullDiskAccess())

  ipcMain.handle('scan:cancel', (event, requestId: string) => {
    abortCurrentScan(event.sender.id, requestId)
  })

  ipcMain.handle('scan:apps', async (event, options: ScanOptions) => {
    return runScan(event, options, async (isAborted) => {
      if (options.refresh) invalidateCaches()
      const win = senderWindow(event)
      sendProgress(win, { phase: 'apps', percent: 0 }, options, isAborted)
      const apps = await scanApplications(
        (current, done, total) => {
          sendProgress(win, { phase: 'apps', current, percent: Math.round((done / total) * 60) }, options, isAborted)
        },
        isAborted
      )
      sendProgress(win, { phase: 'analyze', percent: 60 }, options, isAborted)
      const analyses = await analyzeApps(
        apps,
        (_current, done, total) => {
          sendProgress(win, { phase: 'analyze', percent: 60 + Math.round((done / total) * 40) }, options, isAborted)
        },
        isAborted
      )
      sendProgress(win, { phase: 'done', percent: 100 }, options, isAborted)
      return analyses
    })
  })

  ipcMain.handle('scan:junk', async (event, includeDev: boolean, options: ScanOptions) => {
    return runScan(event, options, async (isAborted) => {
      if (options.refresh) invalidateCaches()
      const win = senderWindow(event)
      sendProgress(win, { phase: 'junk', percent: 0 }, options, isAborted)
      const groups = await scanSystemJunk(
        includeDev !== false,
        (current, done, total) => {
          sendProgress(win, { phase: 'junk', current, percent: Math.round((done / total) * 100) }, options, isAborted)
        },
        isAborted
      )
      sendProgress(win, { phase: 'done', percent: 100 }, options, isAborted)
      return groups
    })
  })

  ipcMain.handle('scan:leftovers', async (event, options: ScanOptions) => {
    return runScan(event, options, async (isAborted) => {
      if (options.refresh) invalidateCaches()
      const win = senderWindow(event)
      sendProgress(win, { phase: 'apps', percent: 0 }, options, isAborted)
      const apps = await scanApplications(undefined, isAborted, true)
      sendProgress(win, { phase: 'leftovers', percent: 30 }, options, isAborted)
      const leftovers = await scanLeftovers(
        apps,
        (current, done, total) => {
          sendProgress(win, { phase: 'leftovers', current, percent: 30 + Math.round((done / total) * 70) }, options, isAborted)
        },
        isAborted
      )
      sendProgress(win, { phase: 'done', percent: 100 }, options, isAborted)
      return leftovers
    })
  })

  ipcMain.handle('scan:large-files', async (event, thresholdMB: number, folderPath: string, options: ScanOptions) => {
    return runScan(event, options, async (isAborted) => {
      const directory = await assertBrowsable(folderPath)
      if (options.refresh) invalidateCaches([directory])
      const win = senderWindow(event)
      sendProgress(win, { phase: 'largeFiles', percent: 0 }, options, isAborted)
      const threshold = Math.max(Number(thresholdMB) || 500, 1) * 1024 * 1024
      const files = await scanLargeFiles(
        threshold,
        (current) => {
          sendProgress(win, { phase: 'largeFiles', current }, options, isAborted)
        },
        isAborted,
        directory,
        options.recursive === true
      )
      sendProgress(win, { phase: 'done', percent: 100 }, options, isAborted)
      return files
    })
  })

  ipcMain.handle('scan:folder', async (event, folderPath: string, options: ScanOptions) => {
    return runScan(event, options, async (isAborted) => {
      const directory = await assertBrowsable(folderPath)
      if (options.refresh) invalidateCaches([directory])
      const win = senderWindow(event)
      sendProgress(win, { phase: 'explorer', percent: 0 }, options, isAborted)
      if (options.measureSizes) {
        return measureFolder(directory, (folder, current, done, total) => {
          sendProgress(win, { phase: 'explorer', current, folder, percent: total ? Math.round(done / total * 100) : 100 }, options, isAborted)
        }, isAborted)
      }
      const listing = await listFolder(
        directory,
        (current) => {
          sendProgress(win, { phase: 'explorer', current }, options, isAborted)
        },
        isAborted
      )
      sendProgress(win, { phase: 'done', percent: 100 }, options, isAborted)
      return listing
    })
  })

  ipcMain.handle('scan:smart', async (event, options: ScanOptions) => {
    return runScan(event, options, async (isAborted): Promise<SmartScanResult> => {
      if (options.refresh) invalidateCaches()
      const win = senderWindow(event)

      sendProgress(win, { phase: 'apps', percent: 0 }, options, isAborted)
      const apps = await scanApplications(
        (current, done, total) => {
          sendProgress(win, { phase: 'apps', current, percent: Math.round((done / total) * 35) }, options, isAborted)
        },
        isAborted
      )

      sendProgress(win, { phase: 'analyze', percent: 35 }, options, isAborted)
      const analyses = await analyzeApps(
        apps,
        (_current, done, total) => {
          sendProgress(win, { phase: 'analyze', percent: 35 + Math.round((done / total) * 20) }, options, isAborted)
        },
        isAborted
      )

      sendProgress(win, { phase: 'junk', percent: 55 }, options, isAborted)
      const junk = await scanSystemJunk(
        true,
        (_current, done, total) => {
          sendProgress(win, { phase: 'junk', percent: 55 + Math.round((done / total) * 20) }, options, isAborted)
        },
        isAborted
      )

      sendProgress(win, { phase: 'leftovers', percent: 75 }, options, isAborted)
      const leftovers = await scanLeftovers(
        apps,
        (_current, done, total) => {
          sendProgress(win, { phase: 'leftovers', percent: 75 + Math.round((done / total) * 20) }, options, isAborted)
        },
        isAborted
      )

      const claimed = analyses.flatMap((a) => a.artifacts.filter((art) => art.cleanable).map((art) => art.path))
      for (const group of [...junk, ...leftovers]) {
        if ('protected' in group && group.protected) continue
        group.paths = group.paths.filter((p) => !claimed.some((owner) => isWithin(p, owner) || isWithin(owner, p)))
        group.size = 0
        for (const p of group.paths) {
          group.size += (await pathSize(p, isAborted)).size
          claimed.push(p)
        }
      }
      const stats = await statfs('/')
      const total = stats.blocks * stats.bsize
      const free = stats.bavail * stats.bsize
      const disk: DiskInfo = { total, free, used: total - free }

      sendProgress(win, { phase: 'done', percent: 100 }, options, isAborted)
      return { disk, apps: analyses, junk: junk.filter((g) => g.paths.length), leftovers: leftovers.filter((g) => g.paths.length) }
    })
  })

  // The permanent-deletion setting is read from disk on every call and never taken from the renderer.
  ipcMain.handle('clean:preview', async (_event, targets: CleanTarget[], permanent: boolean) => {
    const { allowPermanentDelete } = await loadSettings()
    return previewClean(targets ?? [], { permanent: allowPermanentDelete && permanent === true, allowPermanent: allowPermanentDelete })
  })

  ipcMain.handle('clean:execute', async (_event, previewId: string, opts: Partial<ExecuteOptions>) => {
    const { allowPermanentDelete } = await loadSettings()
    const safeOpts: ExecuteOptions = {
      allowPermanent: allowPermanentDelete,
      permanent: allowPermanentDelete && opts?.permanent === true,
      label: typeof opts?.label === 'string' ? opts.label.slice(0, 200) : 'clean',
      action: opts?.action === 'uninstall' || opts?.action === 'permanent' ? opts.action : 'trash'
    }
    return executeClean(previewId, safeOpts)
  })

  ipcMain.handle('app:quit', async (_event, appPath: string) => {
    if (typeof appPath !== 'string' || !/\.app$/i.test(appPath) || !(await assertDeletable(appPath)).ok) return false
    try {
      if (!(await runningAppPaths()).has(appPath)) return true
      await execFileAsync('osascript', ['-e', 'on run argv\n tell application (item 1 of argv) to quit\nend run', appPath], { timeout: 15000 })
      for (let attempt = 0; attempt < 10; attempt++) {
        if (!(await runningAppPaths()).has(appPath)) { invalidateCaches(); return true }
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      return false
    } catch {
      return false
    }
  })

  ipcMain.handle('settings:get', (): Promise<AppSettings> => loadSettings())

  ipcMain.handle('settings:set', async (_event, settings: Partial<AppSettings>) => saveSettings(settings))

  ipcMain.handle('oplog:list', () => readOpLog(200))

  ipcMain.handle('shell:show', async (_event, p: string) => {
    if (typeof p === 'string' && p.length > 0) shell.showItemInFolder(p)
  })

  ipcMain.handle('shell:openFda', async () => {
    await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
  })
}
