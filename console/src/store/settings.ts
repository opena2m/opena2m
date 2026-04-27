import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from '@/i18n'

export type DataMode  = 'mock' | 'live'
export type ThemeMode = 'dark' | 'light'

interface SettingsState {
  lang:     Lang
  mode:     DataMode
  theme:    ThemeMode
  setLang:  (lang: Lang) => void
  setMode:  (mode: DataMode) => void
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      lang:  'en',
      mode:  'mock',
      theme: 'dark',
      setLang:  (lang)  => set({ lang }),
      setMode:  (mode)  => set({ mode }),
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.setAttribute('data-theme', theme)
      },
      toggleTheme: () => {
        const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark'
        set({ theme: next })
        document.documentElement.setAttribute('data-theme', next)
      },
    }),
    {
      name: 'opena2m-settings',
      onRehydrateStorage: () => (state) => {
        // Apply persisted theme immediately on hydration
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
      },
    }
  )
)
