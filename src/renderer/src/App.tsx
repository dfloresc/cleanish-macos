import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AppSettings, FdaStatus } from '../../shared/types'
import { AppContext } from './context/AppContext'
import { Sidebar, type Page } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { SmartScan } from './pages/SmartScan'
import { Applications } from './pages/Applications'
import { SystemJunk } from './pages/SystemJunk'
import { LargeFiles } from './pages/LargeFiles'
import { Explorer } from './pages/Explorer'
import { Leftovers } from './pages/Leftovers'
import { SettingsPage } from './pages/SettingsPage'
import { applyLanguage } from './i18n'

const DEFAULT_SETTINGS: AppSettings = {
  language: 'system',
  allowPermanentDelete: false,
  largeFileThresholdMB: 500
}

export default function App(): React.ReactNode {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState<Page>('dashboard')
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [settingsError, setSettingsError] = useState(false)
  const settingsVersion = useRef(0)
  const [fda, setFda] = useState<FdaStatus | null>(null)
  const [explorerPath, setExplorerPath] = useState<string | null>(null)

  const openExplorer = useCallback((path: string): void => {
    setExplorerPath(path)
    setPage('explorer')
  }, [])

  useEffect(() => {
    window.api.getSettings().then((s) => {
      if (settingsVersion.current === 0) { setSettings(s); applyLanguage(s.language) }
    }).catch(() => setSettingsError(true))
    window.api.checkFda().then(setFda).catch(() => setFda({ granted: false, checkedPath: null }))
  }, [])

  useEffect(() => {
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>): Promise<void> => {
    const version = ++settingsVersion.current
    setSettings((previous) => ({ ...previous, ...patch }))
    setSettingsError(false)
    try {
      const saved = await window.api.setSettings(patch)
      if (version === settingsVersion.current) { setSettings(saved); applyLanguage(saved.language) }
    } catch {
      setSettingsError(true)
      try {
        const saved = await window.api.getSettings()
        if (version === settingsVersion.current) setSettings(saved)
      } catch { /* the error remains visible */ }
    }
  }, [])

  const refreshFda = useCallback(async (): Promise<void> => {
    try { setFda(await window.api.checkFda()) } catch { setFda({ granted: false, checkedPath: null }) }
  }, [])

  return (
    <AppContext.Provider value={{ settings, updateSettings, fda, refreshFda }}>
      <div className="flex h-full">
        <Sidebar page={page} onNavigate={setPage} />
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="drag h-14" />
          <div className="px-8 pb-10 max-w-5xl mx-auto">
            {settingsError && <p role="alert" className="text-sm text-danger mb-4">{t('settings.saveError')}</p>}
            {page === 'dashboard' && <Dashboard onNavigate={setPage} onOpenExplorer={openExplorer} />}
            {page === 'smart' && <SmartScan />}
            {page === 'apps' && <Applications />}
            {page === 'junk' && <SystemJunk />}
            {page === 'large' && <LargeFiles />}
            {page === 'explorer' && <Explorer initialPath={explorerPath} />}
            {page === 'leftovers' && <Leftovers />}
            {page === 'settings' && <SettingsPage />}
          </div>
        </main>
      </div>
    </AppContext.Provider>
  )
}
