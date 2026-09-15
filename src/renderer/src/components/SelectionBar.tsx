import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Spinner } from './Spinner'
import { formatBytes } from '../lib/format'

interface Props {
  count: number
  size: number
  busy: boolean
  onClean: () => void
  label?: string
}

// Sticky action bar shared by every list that can send a selection to the Trash.
export function SelectionBar({ count, size, busy, onClean, label }: Props): React.ReactNode {
  const { t } = useTranslation()
  return (
    <div className="card px-4 py-3 flex items-center justify-between gap-4 sticky bottom-4 shadow-xl shadow-black/30">
      <p className="text-sm text-zinc-400" aria-live="polite">
        {count} {t('common.items')} · <span className="font-bold text-gradient">{formatBytes(size)}</span>
      </p>
      <button className="btn btn-primary min-w-44" disabled={count === 0 || busy} onClick={onClean}>
        {busy ? <Spinner size={14} /> : <Trash2 size={14} />}
        {busy ? t('common.preparing') : label ?? t('smart.cleanSelected')}
      </button>
    </div>
  )
}
