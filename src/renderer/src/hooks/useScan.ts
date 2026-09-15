import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScanOptions, ScanProgress } from '../../../shared/types'

export interface UseScanResult<T> {
  data: T | null
  scanning: boolean
  progress: ScanProgress | null
  error: string | null
  rescan: () => void
  reload: () => void
  setData: React.Dispatch<React.SetStateAction<T | null>>
}

export function useScan<T>(run: (options: ScanOptions) => Promise<T | null>, autoKey?: string, readPartial?: (progress: ScanProgress) => T | undefined): UseScanResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [scanning, setScanning] = useState(true)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const refresh = useRef(false)
  const runRef = useRef(run)
  runRef.current = run
  const partialRef = useRef(readPartial)
  partialRef.current = readPartial

  useEffect(() => {
    let alive = true
    const requestId = crypto.randomUUID()
    const options = { requestId, refresh: refresh.current }
    refresh.current = false
    setScanning(true)
    setData(null)
    setProgress(null)
    setError(null)
    const off = window.api.onScanProgress((p) => {
      if (alive && p.requestId === requestId) {
        setProgress(p)
        const partial = partialRef.current?.(p)
        if (partial !== undefined) setData(partial)
      }
    })
    Promise.resolve().then(() => {
      if (!alive) return null
      return runRef.current(options)
    }).then((result) => {
      if (alive && result !== null) setData(result)
    }).catch((err: unknown) => {
      if (alive) setError(err instanceof Error ? err.message : String(err))
    }).finally(() => {
      if (alive) { setScanning(false); setProgress(null) }
    })
    return () => {
      alive = false
      off()
      void window.api.cancelScan(requestId).catch(() => undefined)
    }
  }, [nonce, autoKey])

  const rescan = useCallback((): void => { refresh.current = true; setNonce((n) => n + 1) }, [])
  const reload = useCallback((): void => { setNonce((n) => n + 1) }, [])
  return { data, scanning, progress, error, rescan, reload, setData }
}
