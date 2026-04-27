import React from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: string
}

export default function Drawer({ open, onClose, title, children, width='384px' }: Props) {
  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />}
      <div className={clsx(
        'fixed inset-y-0 right-0 z-50 flex flex-col bg-[var(--c-panel)] border-l border-[var(--c-border)] shadow-2xl transition-transform duration-200',
        open ? 'translate-x-0' : 'translate-x-full'
      )} style={{ width }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-border)] flex-shrink-0">
          {title && <h3 className="font-semibold text-sm text-[var(--c-text)]">{title}</h3>}
          <button onClick={onClose} className="btn btn-ghost p-1.5 ml-auto"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </>
  )
}
