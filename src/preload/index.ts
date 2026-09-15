import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppAnalysis,
  AppSettings,
  CleanPreview,
  CleanResult,
  CleanTarget,
  DiskInfo,
  FdaStatus,
  FolderListing,
  JunkGroup,
  LargeFile,
  LeftoverGroup,
  OpLogEntry,
  ScanProgress,
  ScanOptions,
  SmartScanResult
} from '../shared/types'

export interface ExecuteOpts {
  permanent: boolean
  label: string
  action: 'trash' | 'permanent' | 'uninstall'
}

const home = process.argv.find((arg) => arg.startsWith('--cleanish-home='))?.slice('--cleanish-home='.length) ?? ''

const api = {
  home,
  diskInfo: (): Promise<DiskInfo> => ipcRenderer.invoke('disk:info'),
  checkFda: (): Promise<FdaStatus> => ipcRenderer.invoke('permissions:fda'),
  scanApps: (options: ScanOptions): Promise<AppAnalysis[] | null> => ipcRenderer.invoke('scan:apps', options),
  scanJunk: (includeDev: boolean, options: ScanOptions): Promise<JunkGroup[] | null> => ipcRenderer.invoke('scan:junk', includeDev, options),
  scanLeftovers: (options: ScanOptions): Promise<LeftoverGroup[] | null> => ipcRenderer.invoke('scan:leftovers', options),
  scanLargeFiles: (thresholdMB: number, directory: string, options: ScanOptions): Promise<LargeFile[] | null> =>
    ipcRenderer.invoke('scan:large-files', thresholdMB, directory, options),
  listFolder: (folderPath: string, options: ScanOptions): Promise<FolderListing | null> => ipcRenderer.invoke('scan:folder', folderPath, options),
  smartScan: (options: ScanOptions): Promise<SmartScanResult | null> => ipcRenderer.invoke('scan:smart', options),
  cancelScan: (requestId: string): Promise<void> => ipcRenderer.invoke('scan:cancel', requestId),
  cleanPreview: (targets: CleanTarget[], permanent = false): Promise<CleanPreview> => ipcRenderer.invoke('clean:preview', targets, permanent),
  cleanExecute: (previewId: string, opts: ExecuteOpts): Promise<CleanResult> =>
    ipcRenderer.invoke('clean:execute', previewId, opts),
  quitApp: (appPath: string): Promise<boolean> => ipcRenderer.invoke('app:quit', appPath),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', settings),
  opLog: (): Promise<OpLogEntry[]> => ipcRenderer.invoke('oplog:list'),
  showInFolder: (p: string): Promise<void> => ipcRenderer.invoke('shell:show', p),
  openFdaSettings: (): Promise<void> => ipcRenderer.invoke('shell:openFda'),
  onScanProgress: (callback: (progress: ScanProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('scan:progress', listener)
    return () => {
      ipcRenderer.removeListener('scan:progress', listener)
    }
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
