import { useTranslation } from 'react-i18next'
import { ShieldAlert, ExternalLink, RefreshCw } from 'lucide-react'
import { useApp } from '../context/AppContext'

export function FdaBanner(): React.ReactNode {
  const { t } = useTranslation()
  const { fda, refreshFda } = useApp()

  if (!fda || fda.granted) return null

  return (
    <div className="card border-warn/30 bg-warn/5 px-5 py-4 mb-6 fade-up">
      <div className="flex items-start gap-3">
        <ShieldAlert size={20} className="text-warn shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-sm text-warn">{t('fda.title')}</p>
          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{t('fda.body')}</p>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-ghost text-xs py-1.5" onClick={() => window.api.openFdaSettings()}>
              <ExternalLink size={13} />
              {t('fda.open')}
            </button>
            <button className="btn btn-ghost text-xs py-1.5" onClick={() => refreshFda()}>
              <RefreshCw size={13} />
              {t('fda.recheck')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
