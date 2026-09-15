import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { app } from 'electron'
import path from 'node:path'
import type { AppSettings } from '../../shared/types'

export const DEFAULT_SETTINGS: AppSettings = { language: 'system', allowPermanentDelete: false, largeFileThresholdMB: 500 }
function settingsFile(): string { return path.join(app.getPath('userData'), 'settings.json') }

function normalize(settings: Partial<AppSettings> | null): AppSettings {
  return {
    language: settings?.language === 'es' || settings?.language === 'en' ? settings.language : 'system',
    allowPermanentDelete: settings?.allowPermanentDelete === true,
    largeFileThresholdMB: Math.min(Math.max(Number(settings?.largeFileThresholdMB) || 500, 50), 10240)
  }
}
export async function loadSettings(): Promise<AppSettings> {
  try { return normalize(JSON.parse(await readFile(settingsFile(), 'utf8'))) }
  catch { return { ...DEFAULT_SETTINGS } }
}

let writes: Promise<unknown> = Promise.resolve()
export function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const next = writes.then(async () => {
    const settings = normalize({ ...await loadSettings(), ...patch })
    await mkdir(app.getPath('userData'), { recursive: true })
    const temporary = settingsFile() + '.tmp'
    await writeFile(temporary, JSON.stringify(settings, null, 2), 'utf8')
    await rename(temporary, settingsFile())
    return settings
  })
  writes = next.catch(() => undefined)
  return next
}
