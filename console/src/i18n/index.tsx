import React, { createContext, useContext } from 'react'
import { en } from './en'
import { zh } from './zh'
import { useSettingsStore } from '@/store/settings'

export type Lang = 'en' | 'zh'
export const translations = { en, zh }

const I18nContext = createContext(en)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const lang = useSettingsStore(s => s.lang)
  const t = translations[lang] ?? en
  return <I18nContext.Provider value={t}>{children}</I18nContext.Provider>
}

export function useT() {
  return useContext(I18nContext)
}
