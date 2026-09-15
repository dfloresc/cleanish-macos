import { createContext, useContext } from 'react'
import type { AppSettings, FdaStatus } from '../../../shared/types'

export interface AppState {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  fda: FdaStatus | null
  refreshFda: () => Promise<void>
}

export const AppContext = createContext<AppState>({
  settings: { language: 'system', allowPermanentDelete: false, largeFileThresholdMB: 500 },
  updateSettings: async () => undefined,
  fda: null,
  refreshFda: async () => undefined
})

export function useApp(): AppState {
  return useContext(AppContext)
}
