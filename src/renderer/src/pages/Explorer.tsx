import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  House,
  Folder,
  File as FileIcon,
  ChevronRight,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import type { FolderEntry } from '../../../shared/types'
import { ScanError } from '../components/ScanError'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Toast } from '../components/Toast'
import { PreviewModal } from '../components/PreviewModal'
import { SelectionBar } from '../components/SelectionBar'
import { SortSelect, FilterChip, SearchBox } from '../components/controls'
import { useClean } from '../hooks/useClean'
import { useScan } from '../hooks/useScan'
import { formatBytes, formatDate } from '../lib/format'

type ExplorerSort = 'size' | 'name' | 'modified'
type ExplorerFilter = 'all' | 'folders' | 'files'

const HOME = window.api.home

// Protected roots, system data and unreadable entries stay visible but cannot be selected.
const isDeletable = (entry: FolderEntry): boolean => entry.readable && !entry.protected

export function Explorer({ initialPath }: { initialPath: string | null }): React.ReactNode {
  const { t } = useTranslation()
  const [currentPath, setCurrentPath] = useState(initialPath ?? HOME)
  const [history, setHistory] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ExplorerSort>('size')
  const [filter, setFilter] = useState<ExplorerFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const breadcrumbRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const breadcrumbs = breadcrumbRef.current
    if (breadcrumbs) breadcrumbs.scrollLeft = breadcrumbs.scrollWidth
  }, [currentPath])

  const { data: listing, scanning, progress, error, rescan, reload } = useScan(
    (options) => window.api.listFolder(currentPath, { ...options, measureSizes: true }),
    currentPath,
    (progress) => progress.folder
  )

  const afterClean = useCallback((): void => {
    setSelected(new Set())
    reload()
  }, [reload])
  const { requestClean, confirmClean, cancelClean, previewState, busy, toast, dismissToast } = useClean(afterClean)

  const navigate = (target: string): void => {
    if (target === currentPath) return
    setHistory((h) => [...h, currentPath])
    setCurrentPath(target)
    setSearch('')
    setFilter('all')
    setSelected(new Set())
  }

  const goBack = (): void => {
    const previous = history[history.length - 1]
    if (!previous) return
    setCurrentPath(previous)
    setSearch('')
    setFilter('all')
    setSelected(new Set())
    setHistory(history.slice(0, -1))
  }

  const refresh = (): void => {
    setSelected(new Set())
    rescan()
  }

  const crumbs = useMemo(() => {
    const rel = currentPath === HOME ? '' : currentPath.slice(HOME.length + 1)
    const parts = rel === '' ? [] : rel.split('/')
    const acc: { label: string; path: string }[] = [{ label: '~', path: HOME }]
    let p = HOME
    for (const part of parts) {
      p = `${p}/${part}`
      acc.push({ label: part, path: p })
    }
    return acc
  }, [currentPath])

  const filtered = useMemo(() => {
    if (!listing) return []
    const q = search.trim().toLowerCase()
    const list = listing.entries.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false
      if (filter === 'folders') return e.isDir
      if (filter === 'files') return !e.isDir
      return true
    })
    const comparators: Record<ExplorerSort, (a: FolderEntry, b: FolderEntry) => number> = {
      size: (a, b) => b.size - a.size,
      name: (a, b) => a.name.localeCompare(b.name),
      modified: (a, b) => b.modifiedAt - a.modifiedAt
    }
    return [...list].sort(comparators[sort])
  }, [listing, search, sort, filter])

  const maxBar = filtered.reduce((max, entry) => Math.max(max, entry.size), 1)

  // Only what is visible can be deleted: search and filters narrow the selection too.
  const selectable = filtered.filter(isDeletable)
  const selectedEntries = selectable.filter((entry) => selected.has(entry.path))
  const allSelected = selectable.length > 0 && selectedEntries.length === selectable.length
  const selectedSize = selectedEntries.reduce((sum, entry) => sum + entry.size, 0)

  const toggle = (p: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else next.add(p)
      return next
    })
  }

  const deleteSelected = (): void => {
    void requestClean({
      targets: selectedEntries.map((entry) => ({ path: entry.path })),
      label: 'explorer',
      action: 'trash'
    })
  }

  return (
    <div className="fade-up">
      <ScanError error={error} onRetry={rescan} />
      <PageHeader title={t('explorer.title')} subtitle={t('explorer.subtitle')}>
        <button className="btn btn-ghost" onClick={refresh} disabled={scanning}>
          {scanning ? <Spinner size={14} /> : <RefreshCw size={14} />}
          {scanning ? t('common.scanning') : t('common.refresh')}
        </button>
      </PageHeader>

      <div className="flex items-center gap-2.5 flex-wrap mb-4">
        <button
          className="btn btn-ghost text-xs py-1.5 px-3"
          onClick={goBack}
          disabled={history.length === 0}
        >
          <ArrowLeft size={13} />
          {t('explorer.back')}
        </button>

        <div ref={breadcrumbRef} title={currentPath} className="flex items-center gap-1 min-w-0 flex-1 max-w-xl overflow-x-auto py-1">
          {crumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight size={12} className="text-zinc-600" />}
              <button
                className={`text-xs px-2 py-1 rounded-md cursor-pointer transition-colors flex items-center gap-1.5 ${
                  i === crumbs.length - 1
                    ? 'bg-panel-3 text-zinc-100 font-semibold'
                    : 'text-zinc-400 hover:text-sky-300'
                }`}
                onClick={() => navigate(crumb.path)}
              >
                {i === 0 && <House size={11} />}
                <span className="max-w-36 truncate">{crumb.label}</span>
              </button>
            </span>
          ))}
        </div>

        <SearchBox value={search} onChange={setSearch} placeholder={t('explorer.search')} />
        <SortSelect<ExplorerSort>
          label={t('controls.sort')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'size', label: t('controls.sortSize') },
            { value: 'name', label: t('controls.sortName') },
            { value: 'modified', label: t('controls.sortModified') }
          ]}
        />
        <div className="flex items-center gap-1.5">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            {t('explorer.all')}
          </FilterChip>
          <FilterChip active={filter === 'folders'} onClick={() => setFilter('folders')}>
            {t('explorer.folders')}
          </FilterChip>
          <FilterChip active={filter === 'files'} onClick={() => setFilter('files')}>
            {t('explorer.files')}
          </FilterChip>
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-4">{t('explorer.lazyNote')}</p>

      {scanning && (
        <div className="card p-5 mb-5">
          <ProgressBar
            percent={progress?.percent}
            label={
              progress?.current
                ? `${t('progress.explorer')} ${progress.current}`
                : t('progress.explorer')
            }
          />
        </div>
      )}

      {listing && listing.path === currentPath && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <p className="text-xs text-zinc-500">
                {filtered.length} {t('controls.results')}
              </p>
              {selectable.length > 0 && (
                <button
                  className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  onClick={() => setSelected(allSelected ? new Set() : new Set(selectable.map((entry) => entry.path)))}
                >
                  {allSelected ? t('common.deselectAll') : t('common.selectAll')}
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              {t('explorer.folderSize')}:{' '}
              <span className="font-bold text-gradient text-sm">{listing.sizeState !== 'complete' ? '≥ ' : ''}{formatBytes(listing.size)}</span>
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState text={search || filter !== 'all' ? t('apps.noResults') : t('explorer.empty')} />
          ) : (
            <>
              <div className="card overflow-hidden mb-5">
                <div className="max-h-[560px] overflow-y-auto divide-y divide-line">
                  {filtered.map((entry) => {
                    const deletable = isDeletable(entry)
                    const checked = deletable && selected.has(entry.path)
                    return (
                      <div
                        key={entry.path}
                        className={`flex items-center gap-3 pl-4 transition-colors ${
                          checked ? 'bg-sky-500/5' : entry.isDir ? 'hover:bg-panel-2/60' : 'hover:bg-panel-2/40'
                        }`}
                      >
                        {/* Kept outside the row button so toggling never navigates. */}
                        <span className="flex" title={deletable ? undefined : t(entry.readable ? 'common.protected' : 'common.unreadable')}>
                          <input
                            type="checkbox"
                            className="checkbox"
                            aria-label={entry.path}
                            disabled={!deletable}
                            checked={checked}
                            onChange={() => toggle(entry.path)}
                          />
                        </span>
                        <div
                          className={`flex-1 min-w-0 flex items-center gap-3 pr-4 py-2.5 ${entry.isDir ? 'cursor-pointer' : ''}`}
                          role={entry.isDir ? 'button' : undefined}
                          tabIndex={entry.isDir && entry.readable ? 0 : undefined}
                          onKeyDown={(event) => { if (entry.isDir && entry.readable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); navigate(entry.path) } }}
                          onClick={() => entry.isDir && entry.readable && navigate(entry.path)}
                        >
                          {entry.isDir ? (
                            <Folder size={17} className="text-sky-400 shrink-0" />
                          ) : (
                            <FileIcon size={17} className="text-zinc-500 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${entry.name.startsWith('.') ? 'text-zinc-400' : ''}`}>{entry.name}</p>
                            <div className="h-1 rounded-full bg-panel-2 overflow-hidden mt-1 max-w-72">
                              <div
                                className={`h-full rounded-full ${entry.isDir ? 'bg-gradient-to-r from-sky-500/80 to-indigo-500/80' : 'bg-zinc-600'}`}
                                style={{ width: `${maxBar > 0 ? (entry.size / maxBar) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs text-zinc-500 shrink-0 w-24 text-right">
                            {entry.modifiedAt > 0 ? formatDate(entry.modifiedAt) : '—'}
                          </span>
                          <span className="text-sm font-semibold shrink-0 w-24 text-right tabular-nums">
                            {!entry.readable ? t('common.unreadable') : entry.sizeState === 'unknown' ? t(scanning ? 'explorer.calculating' : 'explorer.pending') : (entry.sizeState === 'partial' ? '≥ ' : '') + formatBytes(entry.size)}
                          </span>
                          {entry.isDir ? (
                            <ChevronRight size={15} className="text-zinc-500 shrink-0" />
                          ) : (
                            <ExternalLink
                              size={14}
                              className="text-zinc-600 hover:text-zinc-300 shrink-0 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation()
                                window.api.showInFolder(entry.path)
                              }}
                            />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <SelectionBar
                count={selectedEntries.length}
                size={selectedSize}
                busy={busy}
                onClean={deleteSelected}
                label={t('explorer.deleteSelected')}
              />
            </>
          )}
        </>
      )}

      {!scanning && !error && !listing && <EmptyState text={t('explorer.empty')} />}

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
