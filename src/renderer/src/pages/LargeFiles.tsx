import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, RefreshCw, ArrowLeft, House, Folder, FolderSearch } from 'lucide-react'
import type { FolderEntry, LargeFile } from '../../../shared/types'
import { ScanError } from '../components/ScanError'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Toast } from '../components/Toast'
import { PreviewModal } from '../components/PreviewModal'
import { SelectionBar } from '../components/SelectionBar'
import { SortSelect, SearchBox, FilterChip } from '../components/controls'
import { useClean } from '../hooks/useClean'
import { useScan } from '../hooks/useScan'
import { useApp } from '../context/AppContext'
import { formatBytes, formatDate, baseName, parentDir, shortPath } from '../lib/format'

type LargeSort = 'size' | 'modified' | 'name'
const DEEP_LIMIT = 2000

interface Result {
  folders: FolderEntry[]
  files: LargeFile[]
}

export function LargeFiles(): React.ReactNode {
  const { t } = useTranslation()
  const { settings } = useApp()
  const [threshold, setThreshold] = useState(String(settings.largeFileThresholdMB))
  const [applied, setApplied] = useState(settings.largeFileThresholdMB)
  const [deep, setDeep] = useState(false)
  const [currentPath, setCurrentPath] = useState(window.api.home)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LargeSort>('size')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    setThreshold(String(settings.largeFileThresholdMB))
    setApplied(settings.largeFileThresholdMB)
  }, [settings.largeFileThresholdMB])

  // Shallow mode lists once and filters locally. Deep mode asks the main process
  // to walk the subtree with the applied threshold, so it re-runs when that changes.
  const { data, scanning, progress, error, rescan, reload } = useScan<Result>(
    async (options) => {
      const listing = await window.api.listFolder(currentPath, options)
      if (!listing) return null
      const folders = listing.entries.filter((entry) => entry.isDir)
      if (!deep) {
        return { folders, files: listing.entries.filter((entry) => !entry.isDir && entry.readable).map((entry) => ({
          path: entry.path, size: entry.size, modifiedAt: entry.modifiedAt, protected: entry.protected
        })) }
      }
      const files = await window.api.scanLargeFiles(applied, currentPath, { ...options, recursive: true })
      return files ? { folders, files } : null
    },
    `${currentPath}|${deep ? applied : ''}`
  )

  const files = useMemo(() => (data?.files ?? []).filter((file) => file.size >= applied * 1024 * 1024), [data, applied])
  // Visible folders first; dotfolders are usually tooling caches.
  const folders = useMemo(() => [...(data?.folders ?? [])].sort((a, b) => Number(a.name.startsWith('.')) - Number(b.name.startsWith('.')) || a.name.localeCompare(b.name)), [data])
  const navigate = (directory: string): void => {
    setCurrentPath(directory)
    setSearch('')
    setSelected(new Set())
  }

  useEffect(() => {
    setSelected(new Set())
  }, [files])

  const { requestClean, confirmClean, cancelClean, previewState, busy, toast, dismissToast } = useClean(reload)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = files.filter((f) => !q || f.path.toLowerCase().includes(q))
    const comparators: Record<LargeSort, (a: LargeFile, b: LargeFile) => number> = {
      size: (a, b) => b.size - a.size,
      modified: (a, b) => b.modifiedAt - a.modifiedAt,
      name: (a, b) => baseName(a.path).localeCompare(baseName(b.path))
    }
    return [...list].sort(comparators[sort])
  }, [files, search, sort])

  const toggle = (p: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const selectable = filtered.filter((f) => !f.protected)
  const allSelected = selectable.length > 0 && selectable.every((f) => selected.has(f.path))
  const selectedFiles = selectable.filter((f) => selected.has(f.path))
  const selectedSize = selectedFiles.reduce((s, f) => s + f.size, 0)

  const cleanSelected = (): void => {
    void requestClean({
      targets: selectedFiles.map((f) => ({ path: f.path, size: f.size })),
      label: 'large-files',
      action: 'trash'
    })
  }

  const applyThreshold = (): void => {
    const value = Math.min(10240, Math.max(50, Number(threshold) || 500))
    setThreshold(String(value))
    setApplied(value)
  }

  return (
    <div className="fade-up">
      <ScanError error={error} onRetry={rescan} />
      <PageHeader title={t('large.title')} subtitle={t('large.subtitle')}>
        <button className="btn btn-ghost" onClick={rescan} disabled={scanning}>
          {scanning ? <Spinner size={14} /> : <RefreshCw size={14} />}
          {t('common.refresh')}
        </button>
      </PageHeader>

      <div className="flex gap-2 items-center mb-4 min-w-0">
        <button className="btn btn-ghost text-xs py-1.5 px-3" disabled={currentPath === window.api.home} onClick={() => navigate(parentDir(currentPath))}>
          <ArrowLeft size={13} />{t('explorer.back')}
        </button>
        <button className="btn btn-ghost text-xs py-1.5 px-3" aria-label={t('large.home')} disabled={currentPath === window.api.home} onClick={() => navigate(window.api.home)}>
          <House size={13} />
        </button>
        <span className="font-mono text-xs text-zinc-300 truncate px-2.5 py-1.5 rounded-md bg-panel-2 border border-line" title={currentPath}>
          {shortPath(currentPath, window.api.home)}
        </span>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap mb-4">
        <label className="text-xs text-zinc-400 flex items-center gap-2">
          {t('large.threshold')}
          <input
            type="number"
            min={50}
            max={10240}
            className="input w-24 py-1.5 text-xs"
            value={threshold}
            aria-label={t('large.threshold')}
            onChange={(e) => setThreshold(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applyThreshold() }}
          />
        </label>
        <button className="btn btn-ghost text-xs py-1.5" onClick={applyThreshold} disabled={scanning || Number(threshold) === applied}>
          {t('large.apply')}
        </button>
        <FilterChip active={deep} onClick={() => setDeep((value) => !value)}>
          <span className="flex items-center gap-1.5"><FolderSearch size={12} />{t('large.deep')}</span>
        </FilterChip>
        <div className="flex-1" />
        <SearchBox value={search} onChange={setSearch} placeholder={t('explorer.search')} />
        <SortSelect<LargeSort>
          label={t('controls.sort')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'size', label: t('controls.sortSize') },
            { value: 'modified', label: t('controls.sortModified') },
            { value: 'name', label: t('controls.sortName') }
          ]}
        />
      </div>
      <p className="text-xs text-zinc-500 mb-4">{deep ? t('large.deepNote', { limit: DEEP_LIMIT }) : t('large.scopeNote')}</p>

      {scanning && (
        <div className="card p-5 mb-5">
          <ProgressBar
            label={
              progress?.current
                ? `${t('progress.largeFiles')} ${progress.current}`
                : t('progress.largeFiles')
            }
          />
        </div>
      )}

      {!scanning && folders.length > 0 && (
        <details className="mb-5 group" open={!deep}>
          <summary className="text-xs text-zinc-500 cursor-pointer select-none mb-2 list-none flex items-center gap-1.5">
            <Folder size={12} className="text-sky-400" />
            {t('large.subfolders')} ({folders.length})
          </summary>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {folders.map((folder) => (
              <button
                key={folder.path}
                className="px-2.5 py-1 rounded-md text-xs border border-line bg-panel-2 text-zinc-300 hover:border-sky-500/40 hover:text-sky-300 transition-colors cursor-pointer max-w-56 truncate disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!folder.readable}
                title={folder.path}
                onClick={() => navigate(folder.path)}
              >
                {folder.name}
              </button>
            ))}
          </div>
        </details>
      )}

      {!scanning && !error && data && filtered.length === 0 && <EmptyState text={t('large.empty')} />}

      {!scanning && filtered.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-zinc-500">
              {filtered.length} {t('large.count')}
            </p>
            <button
              className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(selectable.map((f) => f.path)))
              }
            >
              {allSelected ? t('common.deselectAll') : t('common.selectAll')}
            </button>
          </div>

          <div className="card overflow-hidden mb-5">
            <div className="max-h-[480px] overflow-y-auto divide-y divide-line">
              {filtered.map((file) => (
                <div key={file.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-panel-2/40">
                  <input
                    type="checkbox"
                    className="checkbox"
                    aria-label={file.path}
                    disabled={file.protected}
                    checked={!file.protected && selected.has(file.path)}
                    onChange={() => toggle(file.path)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{baseName(file.path)} {file.protected && <span className="text-xs text-zinc-500">· {t('common.protected')}</span>}</p>
                    <button
                      className="text-[11px] text-zinc-500 font-mono truncate block max-w-full hover:text-sky-300 cursor-pointer text-left"
                      onClick={() => window.api.showInFolder(file.path)}
                      title={file.path}
                    >
                      {shortPath(parentDir(file.path), window.api.home)}
                    </button>
                  </div>
                  <span className="text-xs text-zinc-500 shrink-0 w-24 text-right">
                    {formatDate(file.modifiedAt)}
                  </span>
                  <span className="text-sm font-semibold shrink-0 w-24 text-right tabular-nums">{formatBytes(file.size)}</span>
                  <FolderOpen
                    size={14}
                    className="text-zinc-600 hover:text-zinc-300 shrink-0 cursor-pointer"
                    onClick={() => window.api.showInFolder(file.path)}
                  />
                </div>
              ))}
            </div>
          </div>

          <SelectionBar count={selectedFiles.length} size={selectedSize} busy={busy} onClean={cleanSelected} />
        </>
      )}

      {!scanning && !error && !data && <EmptyState text={t('common.empty')} />}

      {previewState && (
        <PreviewModal
          request={previewState.request}
          preview={previewState.preview}
          busy={busy}
          onConfirm={() => void confirmClean()}
          onCancel={cancelClean}
          onPermanentChange={(permanent) => void requestClean({ ...previewState.request, permanent })}
        />
      )}
      <Toast msg={toast} onClose={dismissToast} />
    </div>
  )
}
