import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '@/i18n'

export type DataMode = 'mock' | 'live'

interface SettingsState {
  lang: Lang
  mode: DataMode
  setLang: (lang: Lang) => void
  setMode: (mode: DataMode) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      lang: 'en',
      mode: 'mock',
      setLang: (lang) => set({ lang }),
      setMode: (mode) => set({ mode }),
    }),
    { name: 'opena2m-settings' }
  )
)
