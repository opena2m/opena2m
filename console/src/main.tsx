import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { I18nProvider } from './i18n'
import './index.css'

// Apply persisted theme before first render to avoid flash
const stored = localStorage.getItem('opena2m-settings')
if (stored) {
  try {
    const { state } = JSON.parse(stored)
    if (state?.theme) document.documentElement.setAttribute('data-theme', state.theme)
  } catch { /* ignore */ }
}
// Default to dark if nothing stored
if (!document.documentElement.getAttribute('data-theme')) {
  document.documentElement.setAttribute('data-theme', 'dark')
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 8_000, retry: 1 } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <I18nProvider>
          <App />
        </I18nProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
