import React from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: string
  danger?: boolean
}

export default function SimpleModal({ open, onClose, title, children, footer, width = '480px', danger }: Props) {
  const t = useT()
  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={clsx('relative bg-[var(--c-panel)] border rounded-xl shadow-2xl animate-fade-in flex flex-col', danger ? 'border-red-900/60' : 'border-[var(--c-border)]')}
        style={{ width, maxWidth: '95vw', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)] flex-shrink-0">
          <h2 className="font-semibold text-sm text-[var(--c-text)]">{title}</h2>
          <button onClick={onClose} className="btn btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex gap-3 px-5 py-4 border-t border-[var(--c-border)] flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
