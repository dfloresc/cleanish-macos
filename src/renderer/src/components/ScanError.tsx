import { useTranslation } from 'react-i18next'

export function ScanError({ error, onRetry }: { error: string | null; onRetry: () => void }): React.ReactNode {
  const { t } = useTranslation()
  if (!error) return null
  return <div role="alert" className="card border-danger/30 p-4 mb-4">
    <p className="text-sm text-danger">{t('common.scanFailed')}</p>
    <p className="text-xs text-zinc-400 mt-2 break-words">{error}</p>
    <button className="btn btn-ghost mt-3" onClick={onRetry}>{t('common.retry')}</button>
  </div>
}
