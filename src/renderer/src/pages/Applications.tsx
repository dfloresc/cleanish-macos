import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  Trash2,
  PackageX,
  RotateCcw,
  FolderOpen,
  ShieldCheck,
  PlayCircle,
  Power,
  RefreshCw
} from 'lucide-react'
import type { AppAnalysis, ArtifactCategory } from '../../../shared/types'
import { ScanError } from '../components/ScanError'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { Toast } from '../components/Toast'
import { PreviewModal } from '../components/PreviewModal'
import { SortSelect, FilterChip, SearchBox } from '../components/controls'
import { useClean } from '../hooks/useClean'
import { useScan } from '../hooks/useScan'
import { formatBytes } from '../lib/format'

const CATEGORY_COLORS: Record<ArtifactCategory, string> = {
  cache: '#38bdf8',
  preferences: '#a78bfa',
  logs: '#fbbf24',
  appSupport: '#34d399',
  container: '#f472b6',
  groupContainer: '#fb923c',
  savedState: '#94a3b8',
  httpStorage: '#2dd4bf',
  webkit: '#c084fc'
}

type AppSort = 'total' | 'app' | 'junk' | 'name'

export function Applications(): React.ReactNode {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<AppSort>('total')
  const [onlyJunk, setOnlyJunk] = useState(false)
  const [onlyRunning, setOnlyRunning] = useState(false)
  const [hideSystem, setHideSystem] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [selection, setSelection] = useState<Map<string, Set<string>>>(new Map())
  const [quitting, setQuitting] = useState<string | null>(null)
  const [quitError, setQuitError] = useState<string | null>(null)

  const { data: analyses, scanning, progress, error, rescan, reload } = useScan((options) => window.api.scanApps(options))

  const { requestClean, confirmClean, cancelClean, previewState, busy, toast, dismissToast } = useClean(reload)

  useEffect(() => { setSelection(new Map()) }, [analyses])

  const quitApp = async (analysis: AppAnalysis): Promise<void> => {
    if (quitting || busy) return
    setQuitting(analysis.app.id)
    setQuitError(null)
    try {
      if (await window.api.quitApp(analysis.app.path)) reload()
      else setQuitError(analysis.app.id)
    } catch { setQuitError(analysis.app.id) }
    finally { setQuitting(null) }
  }

  const filtered = useMemo(() => {
    if (!analyses) return []
    const q = search.trim().toLowerCase()
    const list = analyses.filter((a) => {
      if (q && !a.app.name.toLowerCase().includes(q) && !(a.app.bundleId ?? '').toLowerCase().includes(q)) {
        return false
      }
      if (onlyJunk && a.totalJunkSize === 0) return false
      if (onlyRunning && !a.app.isRunning) return false
      if (hideSystem && a.app.isSystem) return false
      return true
    })
    const comparators: Record<AppSort, (x: AppAnalysis, y: AppAnalysis) => number> = {
      total: (x, y) => y.app.appSize + y.totalDataSize - (x.app.appSize + x.totalDataSize),
      app: (x, y) => y.app.appSize - x.app.appSize,
      junk: (x, y) => y.totalJunkSize - x.totalJunkSize,
      name: (x, y) => x.app.name.localeCompare(y.app.name)
    }
    return [...list].sort(comparators[sort])
  }, [analyses, search, sort, onlyJunk, onlyRunning, hideSystem])

  const isSelected = useCallback(
    (appId: string, path: string): boolean => selection.get(appId)?.has(path) ?? false,
    [selection]
  )

  const toggleArtifact = useCallback((appId: string, path: string): void => {
    setSelection((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(appId) ?? [])
      if (set.has(path)) set.delete(path)
      else set.add(path)
      if (set.size > 0) next.set(appId, set)
      else next.delete(appId)
      return next
    })
  }, [])

  const toggleAll = useCallback((analysis: AppAnalysis): void => {
    setSelection((prev) => {
      const next = new Map(prev)
      const current = next.get(analysis.app.id)
      const selectable = analysis.artifacts.filter((a) => !a.protected)
      const allSelected = selectable.length > 0 && selectable.every((a) => current?.has(a.path))
      if (allSelected) {
        next.delete(analysis.app.id)
      } else {
        next.set(analysis.app.id, new Set(selectable.map((a) => a.path)))
      }
      return next
    })
  }, [])

  const selectedArtifacts = useCallback(
    (analysis: AppAnalysis) => analysis.artifacts.filter((a) => !a.protected && !analysis.app.isRunning && isSelected(analysis.app.id, a.path)),
    [isSelected]
  )

  const cleanSelected = useCallback(
    (analysis: AppAnalysis): void => {
      const selected = selectedArtifacts(analysis)
      void requestClean({
        targets: selected.map((a) => ({ path: a.path, size: a.size })),
        label: `clean:${analysis.app.name}`,
        action: 'trash'
      })
    },
    [requestClean, selectedArtifacts]
  )

  const resetPrefs = useCallback(
    (analysis: AppAnalysis): void => {
      const prefs = selectedArtifacts(analysis).filter(
        (a) => a.category === 'preferences' || a.category === 'savedState'
      )
      void requestClean({
        targets: prefs.map((a) => ({ path: a.path, size: a.size })),
        label: `reset:${analysis.app.name}`,
        action: 'trash'
      })
    },
    [requestClean, selectedArtifacts]
  )

  const uninstall = useCallback(
    (analysis: AppAnalysis): void => {
      const { app } = analysis
      if (app.isSystem || app.isRunning || app.uninstallBlockedReason) return
      void requestClean({
        targets: [
          { path: app.path, size: app.appSize },
          ...selectedArtifacts(analysis).map((a) => ({ path: a.path, size: a.size }))
        ],
        label: `uninstall:${app.name}`,
        action: 'uninstall'
      })
    },
    [requestClean, selectedArtifacts]
  )

  return (
    <div className="fade-up">
      <ScanError error={error} onRetry={rescan} />
      <PageHeader title={t('apps.title')} subtitle={t('apps.subtitle')}>
        <button className="btn btn-ghost" onClick={rescan} disabled={scanning || busy || quitting !== null}>
          {scanning ? <Spinner size={14} /> : <RefreshCw size={14} />}
          {scanning ? t('common.scanning') : t('common.refresh')}
        </button>
      </PageHeader>

      {scanning && (
        <div className="card p-5 mb-5">
          <ProgressBar
            percent={progress?.percent}
            label={
              progress
                ? t(`progress.${progress.phase}`, progress.phase) +
                  (progress.current ? ` — ${progress.current}` : '')
                : undefined
            }
          />
        </div>
      )}

      {!scanning && analyses && (
        <>
          <div className="flex items-center gap-2.5 flex-wrap mb-4">
            <SearchBox value={search} onChange={setSearch} placeholder={t('apps.search')} />
            <SortSelect<AppSort>
              label={t('controls.sort')}
              value={sort}
              onChange={setSort}
              options={[
                { value: 'total', label: t('controls.sortTotal') },
                { value: 'junk', label: t('controls.sortJunk') },
                { value: 'app', label: t('controls.sortApp') },
                { value: 'name', label: t('controls.sortName') }
              ]}
            />
            <div className="flex items-center gap-1.5">
              <FilterChip active={onlyJunk} onClick={() => setOnlyJunk((v) => !v)}>
                {t('controls.onlyJunk')}
              </FilterChip>
              <FilterChip active={onlyRunning} onClick={() => setOnlyRunning((v) => !v)}>
                {t('controls.onlyRunning')}
              </FilterChip>
              <FilterChip active={hideSystem} onClick={() => setHideSystem((v) => !v)}>
                {t('controls.hideSystem')}
              </FilterChip>
            </div>
            <div className="flex-1" />
            <span className="text-xs text-zinc-600">
              {filtered.length} {t('controls.results')}
            </span>
          </div>

          {filtered.length === 0 && <EmptyState text={t('apps.noResults')} />}

          <div className="space-y-2">
            {filtered.map((analysis) => {
              const { app } = analysis
              const isOpen = expanded === app.id
              const selected = selectedArtifacts(analysis)
              const selectedSize = selected.reduce((s, a) => s + a.size, 0)
              const selectable = analysis.artifacts.filter((a) => !a.protected)
              const allSelected = selectable.length > 0 && selected.length === selectable.length
              const hasPrefs = selected.some(
                (a) => a.category === 'preferences' || a.category === 'savedState'
              )

              return (
                <div key={app.id} className="card overflow-hidden">
                  <button
                    className="w-full flex items-center gap-3.5 px-4 py-3 hover:bg-panel-2/60 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isOpen ? null : app.id)}
                  >
                    {app.icon ? (
                      <img src={app.icon} alt="" className="w-9 h-9 rounded-lg shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-panel-3 border border-line shrink-0" />
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm truncate">{app.name}</p>
                        {app.isSystem && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-panel-3 border border-line text-zinc-400 flex items-center gap-1">
                            <ShieldCheck size={9} />
                            {t('apps.system')}
                          </span>
                        )}
                        {app.isRunning && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-ok/10 border border-ok/25 text-ok flex items-center gap-1">
                            <PlayCircle size={9} />
                            {t('apps.running')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 truncate">
                        {app.bundleId ?? app.path}
                        {app.version ? ` · v${app.version}` : ''}
                      </p>
                    </div>
                    <div className="text-right shrink-0 w-24">
                      <p className="text-sm font-semibold">{formatBytes(app.appSize)}</p>
                      <p className="text-[10px] text-zinc-500">{t('apps.appSize')}</p>
                    </div>
                    <div className="text-right shrink-0 w-24">
                      <p
                        className={`text-sm font-semibold ${analysis.totalJunkSize > 0 ? 'text-sky-300' : 'text-zinc-600'}`}
                      >
                        {formatBytes(analysis.totalDataSize)}
                      </p>
                      <p className="text-[10px] text-zinc-500">{t('apps.dataSize')}</p>
                    </div>
                    <ChevronDown
                      size={16}
                      className={`text-zinc-500 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="border-t border-line px-4 py-4 bg-panel-2/30 fade-up">
                      {analysis.artifacts.length === 0 ? (
                        <p className="text-xs text-zinc-500 py-2">{t('apps.noArtifacts')}</p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2.5">
                            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                              <input
                                type="checkbox"
                                className="checkbox"
                                disabled={selectable.length === 0 || app.isRunning}
                                checked={allSelected}
                                onChange={() => toggleAll(analysis)}
                              />
                              {allSelected ? t('common.deselectAll') : t('common.selectAll')}
                            </label>
                            <span className="text-xs text-zinc-500">
                              {selected.length}/{selectable.length} · {formatBytes(selectedSize)}
                            </span>
                          </div>

                          <div className="rounded-lg border border-line overflow-hidden mb-4 bg-panel">
                            <div className="max-h-60 overflow-y-auto divide-y divide-line">
                              {analysis.artifacts.map((artifact) => (
                                <div key={artifact.path} className="flex items-center gap-3 px-3 py-2">
                                  <input
                                    type="checkbox"
                                    className="checkbox"
                                    aria-label={artifact.path}
                                    disabled={artifact.protected || app.isRunning}
                                    checked={!artifact.protected && isSelected(app.id, artifact.path)}
                                    onChange={() => toggleArtifact(app.id, artifact.path)}
                                  />
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 w-28 text-center"
                                    style={{
                                      color: CATEGORY_COLORS[artifact.category],
                                      background: `${CATEGORY_COLORS[artifact.category]}18`
                                    }}
                                  >
                                    {t(`category.${artifact.category}`)}
                                    {artifact.protected && <span title={t('common.protected')}> · 🔒</span>}
                                  </span>
                                  <button
                                    className="flex-1 text-left text-xs font-mono text-zinc-400 hover:text-sky-300 truncate cursor-pointer"
                                    onClick={() => window.api.showInFolder(artifact.path)}
                                    title={artifact.path}
                                  >
                                    {artifact.path}
                                  </button>
                                  <span className="text-xs text-zinc-500 shrink-0">{formatBytes(artifact.size)}</span>
                                  <FolderOpen
                                    size={13}
                                    className="text-zinc-600 hover:text-zinc-300 shrink-0 cursor-pointer"
                                    onClick={() => window.api.showInFolder(artifact.path)}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {app.isRunning && <p className="text-xs text-warn mb-3">{t('apps.quitFirst')}</p>}
                      {quitError === app.id && <p role="alert" className="text-xs text-warn mb-3">{t('apps.quitFailed')}</p>}
                      {!app.isSystem && app.uninstallBlockedReason && <p className="text-xs text-warn mb-3">{t('apps.uninstallBlocked')}</p>}
                      <p className="text-xs text-zinc-500 mb-3">{t('apps.selectionNote')}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          className="btn btn-primary"
                          disabled={selected.length === 0 || busy || app.isRunning || quitting !== null}
                          onClick={() => cleanSelected(analysis)}
                        >
                          {busy && !previewState ? <Spinner size={14} /> : <Trash2 size={14} />}
                          {busy && !previewState ? t('common.preparing') : `${t('apps.cleanJunk')} (${formatBytes(selectedSize)})`}
                        </button>
                        <button
                          className="btn btn-ghost"
                          disabled={!hasPrefs || busy || app.isRunning || quitting !== null}
                          onClick={() => resetPrefs(analysis)}
                          title={t('apps.resetPrefs')}
                        >
                          <RotateCcw size={14} />
                          {t('apps.resetPrefs')}
                        </button>
                        <div className="flex-1" />
                        {app.isRunning && !app.isSystem && !app.uninstallBlockedReason && (
                          <button className="btn btn-ghost" disabled={busy || quitting !== null} onClick={() => void quitApp(analysis)}>
                            {quitting === app.id ? <Spinner size={14} /> : <Power size={14} />}
                            {quitting === app.id ? t('apps.quitAttempt') : t('apps.quit')}
                          </button>
                        )}
                        <button
                          className="btn btn-danger"
                          disabled={app.isSystem || !!app.uninstallBlockedReason || app.isRunning || busy || quitting !== null}
                          onClick={() => uninstall(analysis)}
                          title={app.isRunning ? t('apps.quitFirst') : app.isSystem ? t('apps.system') : undefined}
                        >
                          <PackageX size={14} />
                          {t('apps.uninstall')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {!scanning && !error && !analyses && <EmptyState text={t('common.empty')} />}

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
