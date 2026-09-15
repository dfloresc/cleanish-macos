import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChartPie, ChevronDown, ChevronRight, EyeOff, Folder, FolderTree, Lock, RefreshCw, Ruler } from 'lucide-react'
import type { FolderEntry, FolderListing, ScanProgress } from '../../../shared/types'
import { ProgressBar } from './ProgressBar'
import { Spinner } from './Spinner'
import { formatBytes, formatShare } from '../lib/format'

// Categorical slots validated for the dark card surface; the tail folds into "Other".
const SEGMENT_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']
const OTHER_COLOR = '#3a3a48'
const TOP_FOLDERS = 8
const ROW_GRID = 'grid grid-cols-[13rem_minmax(0,1fr)_2.75rem_5.5rem_0.875rem] items-center gap-4'

interface Segment {
  key: string
  label: string
  size: number
  color: string
}

interface HomeFoldersProps {
  listing: FolderListing | null
  scanning: boolean
  measuring: boolean
  progress: ScanProgress | null
  onMeasure: () => void
  onRefresh: () => void
  onOpen: (path: string) => void
}

function Skeleton({ className }: { className: string }): React.ReactNode {
  return <span className={`block rounded progress-indeterminate ${className}`} />
}

export function HomeFolders({ listing, scanning, measuring, progress, onMeasure, onRefresh, onOpen }: HomeFoldersProps): React.ReactNode {
  const { t } = useTranslation()
  const [previous, setPrevious] = useState<FolderListing | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [showHidden, setShowHidden] = useState(false)

  // A rescan clears the listing; keep the last one on screen instead of flashing a skeleton.
  useEffect(() => {
    if (listing) setPrevious(listing)
  }, [listing])
  const current = listing ?? (scanning ? previous : null)

  const folders = (current?.entries ?? []).filter((entry) => entry.isDir)
  const visible = folders.filter((folder) => !folder.name.startsWith('.'))
  const hidden = folders.filter((folder) => folder.name.startsWith('.'))
  const isPending = (folder: FolderEntry): boolean => folder.readable && folder.sizeState === 'unknown'
  const hasSizes = folders.some((folder) => folder.sizeState !== 'unknown')
  const measured = folders.length > 0 && !folders.some(isPending)
  const total = current?.size ?? 0
  const hiddenSize = hidden.reduce((sum, folder) => sum + folder.size, 0)
  const hiddenPending = hidden.some(isPending)
  const maxSize = Math.max(hiddenSize, ...visible.map((folder) => folder.size))
  const shown = showAll ? visible : visible.slice(0, TOP_FOLDERS)
  const hiddenLabel = t('dashboard.hiddenFolders', { count: hidden.length })

  const segments: Segment[] = []
  if (measured && total > 0) {
    const candidates = [
      ...visible.map((folder) => ({ key: folder.path, label: folder.name, size: folder.size })),
      ...(hidden.length > 0 ? [{ key: 'hidden', label: hiddenLabel, size: hiddenSize }] : [])
    ].filter((candidate) => candidate.size > 0).sort((a, b) => b.size - a.size)
    candidates.slice(0, SEGMENT_COLORS.length).forEach((candidate, i) => segments.push({ ...candidate, color: SEGMENT_COLORS[i] }))
    const rest = total - segments.reduce((sum, segment) => sum + segment.size, 0)
    if (rest > 0) segments.push({ key: 'other', label: t('dashboard.other'), size: rest, color: OTHER_COLOR })
  }

  const renderSize = (folder: FolderEntry): React.ReactNode => {
    if (!folder.readable) return <span className="text-xs text-zinc-500">{t('common.unreadable')}</span>
    if (folder.sizeState === 'unknown') {
      return measuring
        ? <><Skeleton className="h-3 w-14 ml-auto" /><span className="sr-only">{t('explorer.calculating')}</span></>
        : <span className="text-xs text-zinc-600">{t('explorer.pending')}</span>
    }
    return (
      <span key={folder.sizeState} className="fade-up inline-block text-[13px] font-semibold text-zinc-100 tabular-nums">
        {(folder.sizeState === 'partial' ? '≥ ' : '') + formatBytes(folder.size)}
      </span>
    )
  }

  const renderBar = (size: number, pending: boolean, tone: string): React.ReactNode => (
    <span className="block h-1.5 rounded-full bg-panel-2 overflow-hidden">
      {pending && measuring ? (
        <span className="block h-full w-full progress-indeterminate" />
      ) : (
        <span
          className={`block h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ${tone}`}
          style={{ width: `${maxSize > 0 ? (size / maxSize) * 100 : 0}%` }}
        />
      )}
    </span>
  )

  const renderRow = (folder: FolderEntry): React.ReactNode => (
    <button
      key={folder.path}
      type="button"
      title={folder.path}
      disabled={!folder.readable}
      onClick={() => onOpen(folder.path)}
      className={`${ROW_GRID} group w-full px-3 py-2 rounded-lg text-left cursor-pointer hover:bg-panel-2/70 transition-colors disabled:cursor-default disabled:hover:bg-transparent`}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        {folder.readable
          ? <Folder size={15} className="text-sky-400/80 shrink-0" />
          : <Lock size={14} className="text-zinc-600 shrink-0" />}
        <span className={`text-[13px] font-medium truncate transition-colors ${folder.readable ? 'text-zinc-200 group-hover:text-sky-300' : 'text-zinc-500'}`}>
          {folder.name}
        </span>
      </span>
      {renderBar(folder.size, isPending(folder), 'from-sky-500/80 to-indigo-500/80')}
      <span className="text-xs text-zinc-500 text-right tabular-nums">{measured ? formatShare(folder.size, total) : ''}</span>
      <span className="flex justify-end">{renderSize(folder)}</span>
      <ChevronRight size={14} className="text-zinc-600 opacity-0 group-hover:opacity-100 group-disabled:hidden transition-opacity" />
    </button>
  )

  const renderTile = (folder: FolderEntry): React.ReactNode => (
    <button
      key={folder.path}
      type="button"
      title={folder.path}
      disabled={!folder.readable}
      onClick={() => onOpen(folder.path)}
      className="group flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-panel-2/50 border border-line text-left cursor-pointer hover:border-sky-500/40 hover:bg-panel-2 transition-colors disabled:cursor-default disabled:opacity-60 disabled:hover:border-line"
    >
      {folder.readable
        ? <Folder size={15} className="text-sky-400/80 shrink-0" />
        : <Lock size={14} className="text-zinc-600 shrink-0" />}
      <span className="text-[13px] font-medium text-zinc-300 truncate group-hover:text-sky-300 group-disabled:text-zinc-500 transition-colors">
        {folder.name}
      </span>
    </button>
  )

  const tiles = !hasSizes && !measuring

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-panel-3 border border-line flex items-center justify-center shrink-0">
            <FolderTree size={18} className="text-zinc-300" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t('dashboard.homeFolders')}</p>
            {current && (
              <p className="text-xs text-zinc-500 truncate">
                {t('dashboard.folderCount', { count: visible.length })}
                {hidden.length > 0 && ` · ${t('dashboard.hiddenCount', { count: hidden.length })}`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {current && hasSizes && (
            <div className="text-right">
              <p className="text-lg font-bold leading-tight text-gradient">
                {current.sizeState !== 'complete' ? '≥ ' : ''}{formatBytes(total)}
              </p>
              <p className="text-[10px] text-zinc-500">{t('dashboard.total')}</p>
            </div>
          )}
          <button className="btn btn-ghost text-xs py-1.5" onClick={onRefresh} disabled={scanning}>
            {scanning ? <Spinner size={13} /> : <RefreshCw size={13} />}
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {!measured && !scanning && folders.length > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-sky-500/20 bg-gradient-to-r from-sky-500/10 via-indigo-500/5 to-transparent p-4 mb-5 fade-up">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/20 shrink-0">
            <ChartPie size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t('dashboard.measureTitle')}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{t('dashboard.measureNote')}</p>
          </div>
          <button className="btn btn-primary text-xs py-2 shrink-0" onClick={onMeasure}>
            <Ruler size={13} />
            {t('dashboard.measure')}
          </button>
        </div>
      )}

      {measuring && (
        <div className="rounded-xl border border-line bg-panel-2/40 p-4 mb-5">
          <div className="flex items-center justify-between gap-3 text-xs mb-2.5">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-sky-400 shrink-0"><Spinner size={13} /></span>
              <span className="font-medium text-zinc-300 shrink-0">{t('dashboard.calculating')}</span>
              {progress?.current && <span className="text-zinc-500 truncate">{progress.current}</span>}
            </span>
            {progress?.percent !== undefined && <span className="text-zinc-400 tabular-nums shrink-0">{progress.percent}%</span>}
          </div>
          <ProgressBar percent={progress?.percent} />
        </div>
      )}

      {segments.length > 0 && (
        <div className="mb-5 fade-up">
          <div className="flex h-3 gap-[2px] rounded overflow-hidden" role="img" aria-label={t('dashboard.breakdown')}>
            {segments.map((segment) => (
              <div
                key={segment.key}
                className="h-full min-w-1"
                style={{ flex: `${segment.size} 1 0`, background: segment.color }}
                title={`${segment.label} · ${formatBytes(segment.size)} · ${formatShare(segment.size, total)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
            {segments.map((segment) => (
              <span key={segment.key} className="flex items-center gap-1.5 text-xs min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: segment.color }} />
                <span className="text-zinc-300 truncate max-w-44">{segment.label}</span>
                <span className="text-zinc-500 tabular-nums">{formatShare(segment.size, total)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {!current && scanning && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}
        </div>
      )}

      {tiles && visible.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2">{visible.map(renderTile)}</div>
      )}

      {!tiles && visible.length > 0 && (
        <div className="-mx-3">
          {shown.map(renderRow)}
          {visible.length > TOP_FOLDERS && (
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 mt-1 text-xs text-zinc-400 hover:text-sky-300 cursor-pointer transition-colors"
              onClick={() => setShowAll((value) => !value)}
            >
              <ChevronDown size={13} className={`transition-transform ${showAll ? 'rotate-180' : ''}`} />
              {showAll ? t('dashboard.showLess') : t('dashboard.showAll', { count: visible.length })}
            </button>
          )}
        </div>
      )}

      {hidden.length > 0 && (
        <div className={tiles ? 'mt-4' : '-mx-3 mt-2'}>
          {!tiles && <div className="mx-3 mb-2 border-t border-line" />}
          <button
            type="button"
            aria-expanded={showHidden}
            onClick={() => setShowHidden((value) => !value)}
            className={tiles
              ? 'flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors'
              : `${ROW_GRID} w-full px-3 py-2 rounded-lg text-left cursor-pointer hover:bg-panel-2/70 transition-colors`}
          >
            {tiles ? (
              <>
                <EyeOff size={13} />
                {hiddenLabel}
                <ChevronDown size={13} className={`transition-transform ${showHidden ? 'rotate-180' : ''}`} />
              </>
            ) : (
              <>
                <span className="flex items-center gap-2.5 min-w-0">
                  <EyeOff size={15} className="text-zinc-500 shrink-0" />
                  <span className="text-[13px] font-medium text-zinc-400 truncate">{hiddenLabel}</span>
                </span>
                {renderBar(hiddenSize, hiddenPending, 'from-zinc-500/70 to-zinc-400/70')}
                <span className="text-xs text-zinc-500 text-right tabular-nums">{measured ? formatShare(hiddenSize, total) : ''}</span>
                <span className="flex justify-end">
                  {hiddenPending && measuring
                    ? <Skeleton className="h-3 w-14 ml-auto" />
                    : hidden.some((folder) => folder.sizeState !== 'unknown')
                      ? <span className="text-[13px] font-semibold text-zinc-300 tabular-nums">{(hiddenPending || hidden.some((folder) => folder.sizeState === 'partial') ? '≥ ' : '') + formatBytes(hiddenSize)}</span>
                      : <span className="text-xs text-zinc-600">{t('explorer.pending')}</span>}
                </span>
                <ChevronDown size={14} className={`text-zinc-500 transition-transform ${showHidden ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
          {showHidden && (
            <div className={tiles
              ? 'grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2 mt-3 max-h-72 overflow-y-auto'
              : 'mt-1 max-h-80 overflow-y-auto rounded-xl bg-panel-2/30'}
            >
              {hidden.map(tiles ? renderTile : renderRow)}
            </div>
          )}
        </div>
      )}

      {hasSizes && !measuring && current?.sizeState !== 'complete' && (
        <p className="text-[11px] text-zinc-600 mt-4">{t('dashboard.partialNote')}</p>
      )}
      {!scanning && current && folders.length === 0 && <p className="text-xs text-zinc-600">{t('common.empty')}</p>}
    </div>
  )
}
