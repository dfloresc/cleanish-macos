export type ArtifactCategory =
  | 'cache'
  | 'preferences'
  | 'logs'
  | 'appSupport'
  | 'container'
  | 'groupContainer'
  | 'savedState'
  | 'httpStorage'
  | 'webkit'

export interface AppInfo {
  id: string
  name: string
  bundleId: string | null
  version: string | null
  path: string
  appSize: number
  isSystem: boolean
  isRunning: boolean
  uninstallBlockedReason?: string
  icon: string | null
}

export interface AppArtifact {
  category: ArtifactCategory
  path: string
  size: number
  protected: boolean
  // Only regenerable artifacts are offered by Smart Scan.
  cleanable: boolean
}

export interface AppAnalysis {
  app: AppInfo
  artifacts: AppArtifact[]
  totalJunkSize: number
  totalDataSize: number
}

export type SystemJunkCategory = 'trash' | 'logs' | 'caches' | 'dev'

export interface JunkGroup {
  id: string
  category: SystemJunkCategory
  name: string
  paths: string[]
  size: number
  isDev: boolean
  note?: string
}

export interface LeftoverGroup {
  id: string
  name: string
  bundleId: string | null
  paths: string[]
  size: number
  protected: boolean
}

export interface LargeFile {
  path: string
  size: number
  modifiedAt: number
  protected: boolean
}

export type SizeState = 'unknown' | 'partial' | 'complete'

export interface FolderEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  modifiedAt: number
  sizeState: SizeState
  protected: boolean
  readable: boolean
}

export interface FolderListing {
  path: string
  size: number
  entries: FolderEntry[]
  sizeState: SizeState
  errors: number
}

export interface ScanOptions {
  requestId: string
  refresh?: boolean
  measureSizes?: boolean
  recursive?: boolean
}

export interface DiskInfo {
  total: number
  free: number
  used: number
}

export interface CleanTarget {
  path: string
  size?: number
  reason?: string
  method?: 'trash' | 'permanent'
}

export interface BlockedTarget {
  path: string
  reason: string
}

export interface CleanPreview {
  id: string
  targets: CleanTarget[]
  totalSize: number
  blocked: BlockedTarget[]
  warnings: string[]
}

export interface CleanResultItem {
  path: string
  size: number
  method: 'trash' | 'permanent'
}

export interface CleanResult {
  succeeded: CleanResultItem[]
  failed: BlockedTarget[]
  freedBytes: number
  trashedBytes: number
}

export interface ScanProgress {
  requestId: string
  phase: string
  current?: string
  percent?: number
  folder?: FolderListing
}

export interface SmartScanResult {
  disk: DiskInfo
  apps: AppAnalysis[]
  junk: JunkGroup[]
  leftovers: LeftoverGroup[]
}

export interface OpLogEntry {
  ts: number
  action: 'trash' | 'permanent' | 'uninstall'
  label: string
  paths: string[]
  freedBytes: number
}

export interface AppSettings {
  language: 'es' | 'en' | 'system'
  allowPermanentDelete: boolean
  largeFileThresholdMB: number
}

export interface FdaStatus {
  granted: boolean
  checkedPath: string | null
}
