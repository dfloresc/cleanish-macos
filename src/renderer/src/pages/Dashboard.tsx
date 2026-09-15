import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, AppWindowMac, HardDrive } from 'lucide-react'
import type { DiskInfo } from '../../../shared/types'
import { ScanError } from '../components/ScanError'
import { PageHeader } from '../components/PageHeader'
import { DonutChart } from '../components/DonutChart'
import { FdaBanner } from '../components/FdaBanner'
import { HomeFolders } from '../components/HomeFolders'
import { formatBytes } from '../lib/format'
import { useScan } from '../hooks/useScan'
import type { Page } from '../components/Sidebar'

const HOME = window.api.home

function StatRow({ label, value, color }: { label: string; value: string; color?: string }): React.ReactNode {
  return (
    <div className="flex items-center justify-between text-sm py-1.5">
      <span className="text-zinc-400 flex items-center gap-2">
        {color && <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

interface DashboardProps {
  onNavigate: (p: Page) => void
  onOpenExplorer: (path: string) => void
}

export function Dashboard({ onNavigate, onOpenExplorer }: DashboardProps): React.ReactNode {
  const { t } = useTranslation()
  const [disk, setDisk] = useState<DiskInfo | null>(null)
  // Listing is immediate; measuring walks each home folder and is started on demand.
  const [measure, setMeasure] = useState(false)

  const { data: listing, scanning, progress, error, rescan, reload } = useScan(
    (options) => window.api.listFolder(HOME, { ...options, measureSizes: measure }),
    String(measure),
    (update) => update.folder
  )

  useEffect(() => {
    window.api.diskInfo().then(setDisk).catch(() => setDisk(null))
  }, [listing?.size])

  return (
    <div className="fade-up">
      <ScanError error={error} onRetry={rescan} />
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.subtitle')} />
      <FdaBanner />

      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="card p-6 flex items-center gap-7">
          {disk ? (
            <>
              <DonutChart used={disk.used} total={disk.total}>
                <HardDrive size={20} className="text-zinc-500 mb-1" />
                <p className="text-lg font-bold">{formatBytes(disk.free)}</p>
                <p className="text-[10px] text-zinc-500">{t('dashboard.free')}</p>
              </DonutChart>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <span className="text-zinc-400">{t('dashboard.diskUsage')}</span>
                </p>
                <StatRow label={t('dashboard.used')} value={formatBytes(disk.used)} color="#38bdf8" />
                <StatRow label={t('dashboard.free')} value={formatBytes(disk.free)} color="#1d1d29" />
                <StatRow label={t('dashboard.total')} value={formatBytes(disk.total)} />
              </div>
            </>
          ) : (
            <div className="w-full text-sm text-zinc-500">{t('common.loading')}</div>
          )}
        </div>

        <div className="grid grid-rows-2 gap-5">
          <button
            className="card p-5 text-left hover:border-sky-500/40 transition-colors cursor-pointer group"
            onClick={() => onNavigate('smart')}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <p className="font-semibold text-sm group-hover:text-sky-300 transition-colors">
                  {t('nav.smartScan')}
                </p>
                <p className="text-xs text-zinc-500">{t('dashboard.smartCta')}</p>
              </div>
            </div>
          </button>
          <button
            className="card p-5 text-left hover:border-sky-500/40 transition-colors cursor-pointer group"
            onClick={() => onNavigate('apps')}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-panel-3 border border-line flex items-center justify-center">
                <AppWindowMac size={18} className="text-zinc-300" />
              </div>
              <div>
                <p className="font-semibold text-sm group-hover:text-sky-300 transition-colors">
                  {t('nav.applications')}
                </p>
                <p className="text-xs text-zinc-500">{t('dashboard.scanCta')}</p>
              </div>
            </div>
          </button>
        </div>
      </div>

      <HomeFolders
        listing={listing}
        scanning={scanning}
        measuring={scanning && measure}
        progress={progress}
        // Retrying keeps sizes already measured; Refresh discards them.
        onMeasure={() => (measure ? reload() : setMeasure(true))}
        onRefresh={rescan}
        onOpen={onOpenExplorer}
      />
    </div>
  )
}
