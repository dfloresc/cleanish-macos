import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CleanPreview, CleanTarget } from '../../../shared/types'
import { formatBytes } from '../lib/format'
import type { ToastMsg } from '../components/Toast'

export interface CleanRequest {
  targets: CleanTarget[]
  label: string
  action: 'trash' | 'permanent' | 'uninstall'
  permanent?: boolean
}

interface PreviewState {
  request: CleanRequest
  preview: CleanPreview
}

export function useClean(onDone?: () => void): {
  requestClean: (request: CleanRequest) => Promise<void>
  confirmClean: () => Promise<void>
  cancelClean: () => void
  previewState: PreviewState | null
  busy: boolean
  toast: ToastMsg | null
  dismissToast: () => void
} {
  const { t } = useTranslation()
  const [previewState, setPreviewState] = useState<PreviewState | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const locked = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const showToast = useCallback((msg: ToastMsg): void => {
    setToast(msg)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 4500)
  }, [])

  const requestClean = useCallback(
    async (request: CleanRequest): Promise<void> => {
      if (locked.current) return
      if (request.targets.length === 0) {
        showToast({ kind: 'warning', text: t('toast.nothing') })
        return
      }
      locked.current = true
      setBusy(true)
      try {
        const preview = await window.api.cleanPreview(request.targets, request.permanent)
        setPreviewState({ request, preview })
      } catch {
        showToast({ kind: 'error', text: t('toast.previewFailed') })
      } finally {
        locked.current = false
        setBusy(false)
      }
    },
    [showToast, t]
  )

  const confirmClean = useCallback(async (): Promise<void> => {
    if (!previewState || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      const { request, preview } = previewState
      const result = await window.api.cleanExecute(preview.id, {
        permanent: request.permanent === true,
        label: request.label,
        action: request.action
      })
      setPreviewState(null)
      if (result.succeeded.length === 0) {
        showToast({ kind: 'error', text: t('toast.failed') })
      } else if (result.failed.length > 0) {
        showToast({
          kind: 'warning',
          text: t('toast.partial', { size: formatBytes(result.freedBytes + result.trashedBytes), count: result.failed.length })
        })
      } else {
        showToast({ kind: 'success', text: t('toast.cleaned', { moved: formatBytes(result.trashedBytes), freed: formatBytes(result.freedBytes) }) })
      }
      onDone?.()
    } catch {
      setPreviewState(null)
      showToast({ kind: 'error', text: t('toast.failed') })
      onDone?.()
    } finally {
      locked.current = false
      setBusy(false)
    }
  }, [previewState, showToast, t, onDone])

  const cancelClean = useCallback((): void => {
    if (!locked.current) setPreviewState(null)
  }, [])

  return {
    requestClean,
    confirmClean,
    cancelClean,
    previewState,
    busy,
    toast,
    dismissToast: () => setToast(null)
  }
}
