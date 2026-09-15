import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, History, Flame } from 'lucide-react'
import type { OpLogEntry } from '../../../shared/types'
import { PageHeader } from '../components/PageHeader'
import { useApp } from '../context/AppContext'
import { formatBytes } from '../lib/format'

export function SettingsPage(): React.ReactNode {
  const { t } = useTranslation()
  const { settings, updateSettings } = useApp()
  const [threshold, setThreshold] = useState(String(settings.largeFileThresholdMB))
  const [logError, setLogError] = useState(false)
  useEffect(() => { setThreshold(String(settings.largeFileThresholdMB)) }, [settings.largeFileThresholdMB])
  const [oplog, setOplog] = useState<OpLogEntry[] | null>(null)

  useEffect(() => {
    window.api.opLog().then(setOplog).catch(() => setLogError(true))
  }, [])

  return (
    <div className="fade-up">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="space-y-5">
        <div className="card p-5">
          <p className="text-sm font-semibold mb-3">{t('settings.language')}</p>
          <div className="flex gap-2">
            {(
              [
                { value: 'system', label: t('settings.langSystem') },
                { value: 'es', label: t('settings.langEs') },
                { value: 'en', label: t('settings.langEn') }
              ] as { value: 'system' | 'es' | 'en'; label: string }[]
            ).map((opt) => (
              <button
                key={opt.value}
                className={`btn text-xs ${settings.language === opt.value ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => void updateSettings({ language: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                <Flame size={14} className="text-danger" />
                {t('settings.permanent')}
              </p>
              <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed max-w-lg">{t('settings.permanentDesc')}</p>
            </div>
            <button
              role="switch"
              aria-label={t('settings.permanent')}
              aria-checked={settings.allowPermanentDelete}
              onClick={() => void updateSettings({ allowPermanentDelete: !settings.allowPermanentDelete })}
              className={`w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer relative ${
                settings.allowPermanentDelete ? 'bg-gradient-to-r from-sky-500 to-indigo-500' : 'bg-panel-3 border border-line'
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                  settings.allowPermanentDelete ? 'left-[22px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="card p-5">
          <p className="text-sm font-semibold mb-3">{t('settings.threshold')}</p>
          <input
            type="number"
            min={50}
            max={10240}
            className="input w-32"
            aria-label={t('settings.threshold')}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            onBlur={() => { const value = Math.min(10240, Math.max(50, Number(threshold) || 500)); setThreshold(String(value)); void updateSettings({ largeFileThresholdMB: value }) }}
          />
        </div>

        <div className="card p-5">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <ShieldCheck size={15} className="text-ok" />
            {t('settings.safetyTitle')}
          </p>
          <ul className="space-y-1.5">
            {(['safety1', 'safety2', 'safety3', 'safety4'] as const).map((k) => (
              <li key={k} className="text-xs text-zinc-400 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-ok shrink-0" />
                {t(`settings.${k}`)}
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-5">
          <p className="text-sm font-semibold mb-3 flex items-center gap-2">
            <History size={15} className="text-zinc-400" />
            {t('settings.oplog')}
          </p>
          {logError && <p role="alert" className="text-xs text-danger">{t('settings.logError')}</p>}
          {oplog && oplog.length === 0 && <p className="text-xs text-zinc-500">{t('settings.oplogEmpty')}</p>}
          {oplog && oplog.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {oplog.map((entry, i) => (
                <div key={i} className="rounded-lg border border-line bg-panel-2/40 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">
                      {t(`oplog.${entry.action}`, entry.action)} · {entry.label}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(entry.ts).toLocaleString()} · {formatBytes(entry.freedBytes)}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1 truncate">
                    {entry.paths.slice(0, 3).join(', ')}
                    {entry.paths.length > 3 ? ` +${entry.paths.length - 3}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
