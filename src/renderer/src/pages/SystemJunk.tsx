import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, FolderOpen, RefreshCw } from 'lucide-react'
import type { JunkGroup } from '../../../shared/types'
import { ScanError } from '../components/ScanError'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Toast } from '../components/Toast'
import { PreviewModal } from '../components/PreviewModal'
import { SelectionBar } from '../components/SelectionBar'
import { SortSelect, FilterChip } from '../components/controls'
import { useClean } from '../hooks/useClean'
import { useScan } from '../hooks/useScan'
import { formatBytes } from '../lib/format'

type JunkSort = 'size' | 'name'
type CatFilter = 'all' | 'caches' | 'logs' | 'trash' | 'dev'

function groupName(group: JunkGroup, t: (k: string) => string): string {
  if (group.category === 'trash') return t('junk.trash')
  if (group.category === 'logs') return t('junk.logs')
  if (group.category === 'caches') return t('junk.caches')
  return group.name
}

export function SystemJunk(): React.ReactNode {
  const { t } = useTranslation()
  const [includeDev, setIncludeDev] = useState(false)
  const [sort, setSort] = useState<JunkSort>('size')
  const [cat, setCat] = useState<CatFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openPaths, setOpenPaths] = useState<string | null>(null)

  const { data: groups, scanning, progress, error, rescan, reload } = useScan(
    (options) => window.api.scanJunk(includeDev, options),
    String(includeDev)
  )

  useEffect(() => {
    setSelected(new Set())
  }, [groups])

  const { requestClean, confirmClean, cancelClean, previewState, busy, toast, dismissToast } = useClean(reload)

  const filtered = (groups ?? [])
    .filter((g) => {
      if (cat === 'all') return true
      if (cat === 'dev') return g.isDev
      return g.category === cat && !g.isDev
    })
    .sort((a, b) => (sort === 'size' ? b.size - a.size : groupName(a, t).localeCompare(groupName(b, t))))

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedGroups = filtered.filter((g) => selected.has(g.id))
  const selectedSize = selectedGroups.reduce((s, g) => s + g.size, 0)

  const cleanSelected = (): void => {
    void requestClean({
      targets: selectedGroups.flatMap((g) => g.paths.map((p) => ({ path: p }))),
      label: 'system-junk',
      action: 'trash'
    })
  }

  return (
    <div className="fade-up">
      <ScanError error={error} onRetry={rescan} />
      <PageHeader title={t('junk.title')} subtitle={t('junk.subtitle')}>
        <button className="btn btn-ghost" onClick={rescan} disabled={scanning}>
          {scanning ? <Spinner size={14} /> : <RefreshCw size={14} />}
          {scanning ? t('common.scanning') : t('common.refresh')}
        </button>
      </PageHeader>

      <div className="flex items-center gap-2.5 flex-wrap mb-4">
        <FilterChip active={cat === 'all'} onClick={() => setCat('all')}>
          {t('controls.catAll')}
        </FilterChip>
        <FilterChip active={cat === 'caches'} onClick={() => setCat('caches')}>
          {t('controls.catCaches')}
        </FilterChip>
        <FilterChip active={cat === 'logs'} onClick={() => setCat('logs')}>
          {t('controls.catLogs')}
        </FilterChip>
        <FilterChip active={cat === 'trash'} onClick={() => setCat('trash')}>
          {t('controls.catTrash')}
        </FilterChip>
        <FilterChip active={cat === 'dev'} onClick={() => setCat('dev')}>
          {t('controls.catDev')}
        </FilterChip>
        <div className="flex-1" />
        <SortSelect<JunkSort>
          label={t('controls.sort')}
          value={sort}
          onChange={setSort}
          options={[
            { value: 'size', label: t('controls.sortSize') },
            { value: 'name', label: t('controls.sortName') }
          ]}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox"
            checked={includeDev}
            onChange={(e) => setIncludeDev(e.target.checked)}
          />
          {t('junk.includeDev')}
        </label>
      </div>

      {scanning && (
        <div className="card p-5 mb-5">
          <ProgressBar
            percent={progress?.phase === 'junk' ? progress.percent : undefined}
            label={progress?.current ? `${t('progress.junk')} ${progress.current}` : t('progress.junk')}
          />
        </div>
      )}

      {!scanning && groups && filtered.length === 0 && <EmptyState text={t('junk.empty')} />}

      {!scanning && filtered.length > 0 && (
        <>
          <div className="space-y-2 mb-5">
            {filtered.map((group) => {
              const isOpen = openPaths === group.id
              return (
                <div key={group.id} className="card overflow-hidden">
                  <div className="flex items-center gap-3.5 px-4 py-3">
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={selected.has(group.id)}
                      onChange={() => toggle(group.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">
                        {groupName(group, (k) => t(k))}
                        {group.isDev && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-panel-3 border border-line text-zinc-400 align-middle">dev</span>}
                      </p>
                      <p className="text-[11px] text-zinc-500">
                        {group.paths.length} {t('common.paths')}
                        {group.note ? ` · ${t(`junk.${group.note}`, group.note)}` : ''}
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
