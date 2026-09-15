import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldAlert, Trash2, Flame } from 'lucide-react'
import type { CleanPreview } from '../../../shared/types'
import type { CleanRequest } from '../hooks/useClean'
import { Modal } from './Modal'
import { Spinner } from './Spinner'
import { formatBytes } from '../lib/format'
import { useApp } from '../context/AppContext'

interface Props {
  request: CleanRequest
  preview: CleanPreview
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
  onPermanentChange: (permanent: boolean) => void
}

export function PreviewModal({ request, preview, busy, onConfirm, onCancel, onPermanentChange }: Props): React.ReactNode {
  const { t } = useTranslation()
  const { settings } = useApp()
  const wantsPermanent = request.permanent === true
  const [acknowledged, setAcknowledged] = useState(false)
  useEffect(() => { setAcknowledged(false) }, [preview.id])
  const hasTrash = preview.warnings.includes('trashPermanent')
  const hasOther = preview.targets.some((target) => !target.path.startsWith(window.api.home + '/.Trash/'))
  const effectivePermanent = preview.targets.length > 0 && preview.targets.every((target) => target.method === 'permanent')

  const dangerous = hasTrash || effectivePermanent

  return (
    <Modal
      title={t('preview.title')}
      onClose={onCancel}
      busy={busy}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            className={`btn ${dangerous ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy || preview.targets.length === 0 || (dangerous && !acknowledged)}
          >
            {busy ? <Spinner size={14} /> : dangerous ? <Flame size={14} /> : <Trash2 size={14} />}
            {dangerous ? hasOther && !effectivePermanent ? t('common.confirm') : t('preview.confirmPermanent') : t('preview.confirmTrash')}
          </button>
        </>
      }
    >
      {settings.allowPermanentDelete && hasOther && <label className="flex items-center gap-2 text-xs text-zinc-400 mb-4">
        <input type="checkbox" className="checkbox" disabled={busy} checked={wantsPermanent} onChange={(event) => onPermanentChange(event.target.checked)} />
        {t('preview.usePermanent')}
      </label>}
      <p className="text-sm text-zinc-400 mb-3">
        {preview.targets.length === 0
          ? t('preview.bodyNone')
          : effectivePermanent || (hasTrash && !hasOther) ? t('preview.bodyPermanent') : hasTrash ? t('preview.bodyMixed') : t('preview.body')}
      </p>

      {wantsPermanent && !settings.allowPermanentDelete && (
        <div className="flex items-start gap-2 text-xs text-warn bg-warn/10 border border-warn/25 rounded-lg px-3 py-2 mb-3">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          {t('preview.permanentDisabled')}
        </div>
      )}

      {preview.warnings.map((w) => (
        <div
          key={w}
          className="flex items-start gap-2 text-xs text-warn bg-warn/10 border border-warn/25 rounded-lg px-3 py-2 mb-3"
        >
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          {t(`preview.warning.${w}`, w)}
        </div>
      ))}

      {preview.targets.length > 0 && (
        <div className="rounded-lg border border-line overflow-hidden mb-3">
          <div className="max-h-64 overflow-y-auto divide-y divide-line">
            {preview.targets.map((target) => (
              <div key={target.path} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <span title={target.path} className="truncate text-zinc-300 font-mono">{target.path}</span>
                <span className="text-zinc-500 shrink-0">{formatBytes(target.size ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview.blocked.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-danger mb-1.5">
            {t('preview.blocked')} ({preview.blocked.length})
          </p>
          <div className="rounded-lg border border-danger/25 bg-danger/5 max-h-32 overflow-y-auto divide-y divide-line">
            {preview.blocked.map((b) => (
              <div key={b.path} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                <span className="truncate text-zinc-400 font-mono">{b.path}</span>
                <span className="text-danger/80 shrink-0">{b.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dangerous && <label className="flex items-start gap-2 text-xs text-warn mb-4">
        <input type="checkbox" className="checkbox" checked={acknowledged} disabled={busy}
          onChange={(event) => setAcknowledged(event.target.checked)} />
        {t('preview.acknowledgePermanent')}
      </label>}
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">{t('preview.total')}</span>
        <span className="font-bold text-gradient text-base">{formatBytes(preview.totalSize)}</span>
      </div>
    </Modal>
  )
}
