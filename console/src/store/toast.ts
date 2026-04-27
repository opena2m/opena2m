import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  kind: ToastKind
  action?: { label: string; onClick: () => void }
}

interface ToastStore {
  toasts: Toast[]
  addToast: (message: string, kind?: ToastKind, action?: Toast['action']) => void
  removeToast: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, kind = 'info', action) => {
    const id = Math.random().toString(36).slice(2)
    set(s => ({ toasts: [...s.toasts, { id, message, kind, action }] }))
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000)
  },
  removeToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))
