import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, FolderOpen, RefreshCw } from 'lucide-react'
import { ScanError } from '../components/ScanError'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Toast } from '../components/Toast'
import { PreviewModal } from '../components/PreviewModal'
import { SelectionBar } from '../components/SelectionBar'
import { SortSelect, SearchBox } from '../components/controls'
import { useClean } from '../hooks/useClean'
import { useScan } from '../hooks/useScan'
import { formatBytes } from '../lib/format'

type LeftSort = 'size' | 'name'

export function Leftovers(): React.ReactNode {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LeftSort>('size')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openPaths, setOpenPaths] = useState<string | null>(null)

  const { data: groups, scanning, progress, error, rescan, reload } = useScan((options) => window.api.scanLeftovers(options))

  const { requestClean, confirmClean, cancelClean, previewState, busy, toast, dismissToast } = useClean(reload)

  useEffect(() => { setSelected(new Set()) }, [groups])

  const filtered = useMemo(() => {
    if (!groups) return []
    const q = search.trim().toLowerCase()
    const list = groups.filter(
      (g) =>
        !q ||
        g.name.toLowerCase().includes(q) ||
        (g.bundleId ?? '').toLowerCase().includes(q) ||
        g.paths.some((p) => p.toLowerCase().includes(q))
    )
    return [...list].sort((a, b) => (sort === 'size' ? b.size - a.size : a.name.localeCompare(b.name)))
  }, [groups, search, sort])

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedGroups = filtered.filter((g) => !g.protected && selected.has(g.id))
  const selectable = filtered.filter((g) => !g.protected)
  const allSelected = selectable.length > 0 && selectable.every((g) => selected.has(g.id))
  const selectedSize = selectedGroups.reduce((s, g) => s + g.size, 0)

  const cleanSelected = (): void => {
    void requestClean({
      targets: selectedGroups.flatMap((g) => g.paths.map((p) => ({ path: p }))),
      label: 'leftovers',
      action: 'trash'
    })
  }

  return (
    <div className="fade-up">
      <ScanError error={error} onRetry={rescan} />
      <PageHeader title={t('leftovers.title')} subtitle={t('leftovers.subtitle')}>
        <button className="btn btn-ghost" onClick={rescan} disabled={scanning}>
          {scanning ? <Spinner size={14} /> : <RefreshCw size={14} />}
          {scanning ? t('common.scanning') : t('common.refresh')}
        </button>
      </PageHeader>

      <div className="flex items-center gap-2.5 flex-wrap mb-4">
        <SearchBox value={search} onChange={setSearch} placeholder={t('apps.search')} />
        <SortSelect<LeftSort>
          label={t('controls.sort')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'size', label: t('controls.sortSize') },
            { value: 'name', label: t('controls.sortName') }
          ]}
        />
        <div className="flex-1" />
        <span className="text-xs text-zinc-600">
          {filtered.length} {t('controls.results')}
        </span>
      </div>

      {scanning && (
        <div className="card p-5 mb-5">
          <ProgressBar
            percent={progress?.percent}
            label={progress ? t(`progress.${progress.phase}`, progress.phase) : undefined}
          />
        </div>
      )}

      {!scanning && groups && filtered.length === 0 && <EmptyState text={t('leftovers.empty')} />}

      {!scanning && filtered.length > 0 && (
        <>
          <div className="flex items-center justify-end mb-3">
            <button
              className="text-xs text-zinc-400 hover:text-zinc-200 cursor-pointer"
              onClick={() =>
                setSelected(allSelected ? new Set() : new Set(selectable.map((g) => g.id)))
              }
            >
              {allSelected ? t('common.deselectAll') : t('common.selectAll')}
            </button>
          </div>

          <div className="space-y-2 mb-5">
            {filtered.map((group) => {
              const isOpen = openPaths === group.id
              return (
                <div key={group.id} className="card overflow-hidden">
                  <div className="flex items-center gap-3.5 px-4 py-3">
                    <input
                      type="checkbox"
                      className="checkbox"
                      aria-label={group.name}
                      disabled={group.protected}
                      checked={!group.protected && selected.has(group.id)}
                      onChange={() => toggle(group.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{group.name} {group.protected && <span className="text-xs text-zinc-500">· {t('common.protected')}</span>}</p>
                      <p className="text-[11px] text-zinc-500 font-mono truncate">
                        {group.bundleId ?? group.paths[0]} · {group.paths.length} {t('common.paths')}
                      </p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{formatBytes(group.size)}</span>
                    <button
                      className="text-zinc-500 hover:text-zinc-200 cursor-pointer shrink-0"
                      onClick={() => setOpenPaths(isOpen ? null : group.id)}
                    >
                      <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-line bg-panel-2/30 max-h-56 overflow-y-auto divide-y divide-line">
                      {group.paths.map((p) => (
                        <div key={p} className="flex items-center justify-between gap-3 px-4 py-1.5">
                          <button
                            className="text-xs font-mono text-zinc-400 hover:text-sky-300 truncate cursor-pointer text-left"
                            onClick={() => window.api.showInFolder(p)}
                            title={p}
                          >
                            {p}
                          </button>
                          <FolderOpen
                            size={12}
                            className="text-zinc-600 hover:text-zinc-300 shrink-0 cursor-pointer"
                            onClick={() => window.api.showInFolder(p)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <SelectionBar count={selectedGroups.length} size={selectedSize} busy={busy} onClean={cleanSelected} />
        </>
      )}

      {!scanning && !error && !groups && <EmptyState text={t('common.empty')} />}

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
