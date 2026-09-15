import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Trash2, AppWindowMac, PackageX, RefreshCw } from 'lucide-react'
import type { CleanTarget } from '../../../shared/types'
import { ScanError } from '../components/ScanError'
import { PageHeader } from '../components/PageHeader'
import { ProgressBar } from '../components/ProgressBar'
import { Spinner } from '../components/Spinner'
import { Toast } from '../components/Toast'
import { PreviewModal } from '../components/PreviewModal'
import { SelectionBar } from '../components/SelectionBar'
import { EmptyState } from '../components/EmptyState'
import { SortSelect, SearchBox } from '../components/controls'
import { useClean } from '../hooks/useClean'
import { useScan } from '../hooks/useScan'
import { formatBytes } from '../lib/format'

type Tab = 'apps' | 'junk' | 'leftovers'
type NameSort = 'size' | 'name'

export function SmartScan(): React.ReactNode {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('apps')
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set())
  const [selectedJunk, setSelectedJunk] = useState<Set<string>>(new Set())
  const [selectedLeft, setSelectedLeft] = useState<Set<string>>(new Set())
  const [appSearch, setAppSearch] = useState('')
  const [leftSearch, setLeftSearch] = useState('')
  const [appSort, setAppSort] = useState<NameSort>('size')
  const [junkSort, setJunkSort] = useState<NameSort>('size')
  const [leftSort, setLeftSort] = useState<NameSort>('size')

  const { data: result, scanning, progress, error, rescan, reload } = useScan((options) => window.api.smartScan(options))

  const { requestClean, confirmClean, cancelClean, previewState, busy, toast, dismissToast } = useClean(reload)

  const appsWithJunk = useMemo(() => {
    if (!result) return []
    const q = appSearch.trim().toLowerCase()
    const list = result.apps.filter((a) => a.totalJunkSize > 0).filter((a) => {
      if (!q) return true
      return a.app.name.toLowerCase().includes(q) || (a.app.bundleId ?? '').toLowerCase().includes(q)
    })
    return [...list].sort((a, b) =>
      appSort === 'size' ? b.totalJunkSize - a.totalJunkSize : a.app.name.localeCompare(b.app.name)
    )
  }, [result, appSearch, appSort])

  const junkSorted = useMemo(() => {
    if (!result) return []
    return [...result.junk].sort((a, b) => (junkSort === 'size' ? b.size - a.size : a.name.localeCompare(b.name)))
  }, [result, junkSort])

  const leftSorted = useMemo(() => {
    if (!result) return []
    const q = leftSearch.trim().toLowerCase()
    const list = result.leftovers.filter(
      (l) => !q || l.name.toLowerCase().includes(q) || (l.bundleId ?? '').toLowerCase().includes(q)
    )
    return [...list].sort((a, b) => (leftSort === 'size' ? b.size - a.size : a.name.localeCompare(b.name)))
  }, [result, leftSearch, leftSort])

  const totals = useMemo(() => {
    if (!result) return { selected: 0, count: 0 }
    let selected = 0
    let count = 0
    for (const a of result.apps) {
      if (a.totalJunkSize > 0 && selectedApps.has(a.app.id)) {
        selected += a.totalJunkSize
        count += a.artifacts.filter((art) => art.cleanable).length
      }
    }
    for (const g of result.junk) {
      if (selectedJunk.has(g.id)) {
        selected += g.size
        count += g.paths.length
      }
    }
    for (const l of result.leftovers) {
      if (!l.protected && selectedLeft.has(l.id)) {
        selected += l.size
        count += l.paths.length
      }
    }
    return { selected, count }
  }, [result, selectedApps, selectedJunk, selectedLeft])

  const totalPotential = useMemo(() => {
    if (!result) return 0
    return (
      result.apps.reduce((s, a) => s + a.totalJunkSize, 0) +
      result.junk.reduce((s, g) => s + g.size, 0) +
      result.leftovers.filter((l) => !l.protected).reduce((s, l) => s + l.size, 0)
    )
  }, [result])

  useEffect(() => {
    setSelectedApps(new Set())
    setSelectedJunk(new Set())
    setSelectedLeft(new Set())
  }, [result])

  const cleanSelected = (): void => {
    if (!result) return
    const targets: CleanTarget[] = []
    for (const a of result.apps) {
      if (a.totalJunkSize === 0 || !selectedApps.has(a.app.id)) continue
      for (const art of a.artifacts.filter((art) => art.cleanable)) targets.push({ path: art.path, size: art.size })
    }
    for (const g of result.junk) {
      if (!selectedJunk.has(g.id)) continue
      for (const p of g.paths) targets.push({ path: p })
    }
    for (const l of result.leftovers) {
      if (l.protected || !selectedLeft.has(l.id)) continue
      for (const p of l.paths) targets.push({ path: p })
    }
    void requestClean({ targets, label: 'smart-scan', action: 'trash' })
  }

  const toggleIn = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  return (
    <div className="fade-up">
      <ScanError error={error} onRetry={rescan} />
      <PageHeader title={t('smart.title')} subtitle={t('smart.subtitle')}>
        <button className="btn btn-primary" onClick={rescan} disabled={scanning}>
          {scanning ? <Spinner size={14} /> : <RefreshCw size={14} />}
          {scanning ? t('common.scanning') : t('smart.cta')}
        </button>
      </PageHeader>

      {scanning && (
        <div className="card flex flex-col items-center justify-center py-24 gap-6">
          <Spinner size={30} />
          <p className="text-sm text-zinc-400">{t('smart.scanning')}</p>
          <div className="w-96 max-w-full">
            <ProgressBar
              percent={progress?.percent}
              label={progress ? t(`progress.${progress.phase}`, progress.phase) : undefined}
            />
          </div>
        </div>
      )}

      {!scanning && !error && !result && (
        <div className="card flex flex-col items-center justify-center py-24 gap-6">
          <img src="./icon.svg" alt="Cleanish" className="w-24 h-24 drop-shadow-2xl" draggable={false} />
          <button className="btn btn-primary text-base px-8 py-3" onClick={rescan}>
            <Sparkles size={17} />
            {t('smart.cta')}
          </button>
        </div>
      )}

      {!scanning && result && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="card p-5 text-center">
              <p className="text-2xl font-bold text-gradient">{formatBytes(totalPotential)}</p>
              <p className="text-xs text-zinc-500 mt-1">{t('smart.savings')}</p>
            </div>
            <div className="card p-5 text-center">
              <p className="text-2xl font-bold">{result.apps.filter((a) => a.totalJunkSize > 0).length}</p>
              <p className="text-xs text-zinc-500 mt-1">{t('smart.appsWithJunk')}</p>
            </div>
            <div className="card p-5 text-center">
              <p className="text-2xl font-bold">{result.junk.length + result.leftovers.length}</p>
              <p className="text-xs text-zinc-500 mt-1">
                {t('smart.junkGroups')} + {t('smart.leftoverGroups')}
              </p>
            </div>
          </div>

          {totalPotential === 0 && result.leftovers.length === 0 ? (
            <EmptyState text={t('smart.noJunk')} />
          ) : (
            <>
              <div className="flex gap-1.5 mb-4">
                {(
                  [
                    { id: 'apps', label: `${t('smart.appsTab')} (${appsWithJunk.length})`, icon: AppWindowMac },
                    { id: 'junk', label: `${t('smart.junkTab')} (${junkSorted.length})`, icon: Trash2 },
                    {
                      id: 'leftovers',
                      label: `${t('smart.leftoversTab')} (${leftSorted.length})`,
                      icon: PackageX
                    }
                  ] as { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[]
                ).map((tb) => {
                  const Icon = tb.icon
                  return (
                    <button
                      key={tb.id}
                      onClick={() => setTab(tb.id)}
                      className={`btn text-xs py-2 ${tab === tb.id ? 'btn-primary' : 'btn-ghost'}`}
                    >
                      <Icon size={13} />
                      {tb.label}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-2.5 flex-wrap mb-3">
                {tab === 'apps' && (
                  <>
                    <SearchBox value={appSearch} onChange={setAppSearch} placeholder={t('apps.search')} />
                    <SortSelect<NameSort>
                      label={t('controls.sort')}
                      value={appSort}
                      onChange={setAppSort}
                      options={[
                        { value: 'size', label: t('controls.sortJunk') },
                        { value: 'name', label: t('controls.sortName') }
                      ]}
                    />
                  </>
                )}
                {tab === 'junk' && (
                  <SortSelect<NameSort>
                    label={t('controls.sort')}
                    value={junkSort}
                    onChange={setJunkSort}
                    options={[
                      { value: 'size', label: t('controls.sortSize') },
                      { value: 'name', label: t('controls.sortName') }
                    ]}
                  />
                )}
                {tab === 'leftovers' && (
                  <>
                    <SearchBox value={leftSearch} onChange={setLeftSearch} placeholder={t('apps.search')} />
                    <SortSelect<NameSort>
                      label={t('controls.sort')}
                      value={leftSort}
                      onChange={setLeftSort}
                      options={[
                        { value: 'size', label: t('controls.sortSize') },
                        { value: 'name', label: t('controls.sortName') }
                      ]}
                    />
                  </>
                )}
              </div>

              <div className="card overflow-hidden mb-5">
                <div className="max-h-[380px] overflow-y-auto divide-y divide-line">
                  {tab === 'apps' &&
                    appsWithJunk.map((a) => (
                      <div key={a.app.id} className="flex items-center gap-3 px-4 py-2.5">
                        <input
                          type="checkbox"
                          className="checkbox"
                          aria-label={a.app.name}
                          checked={selectedApps.has(a.app.id)}
                          onChange={() => setSelectedApps((prev) => toggleIn(prev, a.app.id))}
                        />
                        {a.app.icon ? (
                          <img src={a.app.icon} alt="" className="w-7 h-7 rounded-md shrink-0" />
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-panel-3 border border-line shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{a.app.name}</p>
                          <p className="text-[11px] text-zinc-500">
                            {a.artifacts.length} {t('common.items')}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-sky-300 shrink-0">
                          {formatBytes(a.totalJunkSize)}
                        </span>
                      </div>
                    ))}
                  {tab === 'apps' && appsWithJunk.length === 0 && (
                    <p className="text-xs text-zinc-500 px-4 py-6 text-center">{t('smart.noJunk')}</p>
                  )}

                  {tab === 'junk' &&
                    junkSorted.map((g) => (
                      <div key={g.id} className="flex items-center gap-3 px-4 py-2.5">
                        <input
                          type="checkbox"
                          className="checkbox"
                          aria-label={g.name}
                          checked={selectedJunk.has(g.id)}
                          onChange={() => setSelectedJunk((prev) => toggleIn(prev, g.id))}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {g.category === 'trash'
                              ? t('junk.trash')
                              : g.category === 'logs'
                                ? t('junk.logs')
                                : g.category === 'caches'
                                  ? t('junk.caches')
                                  : g.name}
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            {g.paths.length} {t('common.paths')}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-sky-300 shrink-0">{formatBytes(g.size)}</span>
                      </div>
                    ))}

                  {tab === 'leftovers' &&
                    leftSorted.map((l) => (
                      <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                        <input
                          type="checkbox"
                          className="checkbox"
                          aria-label={l.name}
                          disabled={l.protected}
                          checked={!l.protected && selectedLeft.has(l.id)}
                          onChange={() => setSelectedLeft((prev) => toggleIn(prev, l.id))}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{l.name} {l.protected && <span className="text-xs text-zinc-500">· {t('common.protected')}</span>}</p>
                          <p className="text-[11px] text-zinc-500 font-mono truncate">{l.bundleId ?? l.paths[0]}</p>
                        </div>
                        <span className="text-sm font-semibold text-sky-300 shrink-0">{formatBytes(l.size)}</span>
                      </div>
                    ))}
                  {tab === 'leftovers' && leftSorted.length === 0 && (
                    <p className="text-xs text-zinc-500 px-4 py-6 text-center">{t('leftovers.empty')}</p>
                  )}
                </div>
              </div>

              <SelectionBar count={totals.count} size={totals.selected} busy={busy} onClean={cleanSelected} />
            </>
          )}
        </>
      )}

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
