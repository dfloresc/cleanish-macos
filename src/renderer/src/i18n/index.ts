import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import es from './es.json'
import en from './en.json'

export async function initI18n(): Promise<typeof i18n> {
  let savedLanguage: string = 'system'
  try {
    const settings = await window.api.getSettings()
    savedLanguage = settings.language
  } catch {
    /* default */
  }

  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        es: { translation: es },
        en: { translation: en }
      },
      lng: savedLanguage === 'system' ? undefined : savedLanguage,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      detection: {
        order: ['navigator'],
        lookupQuerystring: 'lng'
      }
    })

  return i18n
}

export function applyLanguage(language: 'es' | 'en' | 'system'): void {
  if (language === 'system') {
    const nav = navigator.language.slice(0, 2)
    i18n.changeLanguage(nav === 'es' ? 'es' : 'en')
  } else {
    i18n.changeLanguage(language)
  }
}

export default i18n
