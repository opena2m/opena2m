import React from 'react'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'

interface Props {
  title: string; action: string; details: Record<string, unknown>
  principal: string; danger?: boolean
  onConfirm: () => void; onCancel: () => void; loading?: boolean
}

export default function ApprovalConfirmModal({ title, action, details, principal, danger, onConfirm, onCancel, loading }: Props) {
  const t = useT()

  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative bg-[var(--c-panel)] border border-[var(--c-border)] rounded-xl w-full max-w-md shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
        <div className={clsx('flex items-center gap-3 p-5 border-b border-[var(--c-border)]', danger && 'border-red-900/60')}>
          {danger ? <AlertTriangle className="w-5 h-5 text-[var(--c-red)] flex-shrink-0" /> : <CheckCircle className="w-5 h-5 text-[var(--c-accent)] flex-shrink-0" />}
          <h2 className="font-semibold text-[var(--c-text)]">{title}</h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-[var(--c-surface)] rounded-lg p-3 flex items-center gap-2">
            <span className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider">{t.modal.actingAs}</span>
            <span className="mono text-xs text-[var(--c-text)]">{principal}</span>
          </div>
          <div>
            <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider mb-1">{t.modal.actionLabel}</p>
            <p className="mono text-xs text-[var(--c-accent)]">{action}</p>
          </div>
          <div>
            <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider mb-1">{t.modal.details}</p>
            <pre className="text-[10px] text-[var(--c-dim)] mono bg-[var(--c-surface)] rounded p-3 overflow-x-auto max-h-32">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
          {danger && (
            <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-[var(--c-red)]">
              ⚠ {t.modal.destructiveWarning}
            </div>
          )}
        </div>
        <div className="flex gap-3 p-5 border-t border-[var(--c-border)]">
          <button onClick={onCancel} className="btn btn-ghost flex-1 justify-center">{t.common.cancel}</button>
          <button onClick={onConfirm} disabled={loading}
            className={clsx('btn flex-1 justify-center', danger ? 'btn-danger' : 'btn-primary')}>
            {loading ? '…' : (danger ? t.modal.confirmDestructive : t.modal.confirmLabel)}
          </button>
        </div>
      </div>
    </div>
  )
}
