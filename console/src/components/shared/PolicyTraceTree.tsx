import { useT } from '@/i18n'
import React from 'react'
import { CheckCircle, XCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import type { PolicyTraceStep } from '@/lib/dataLayer'

export default function PolicyTraceTree({ steps }: { steps: PolicyTraceStep[] }) {
  const t = useT()
  if (!steps || steps.length === 0) return <p className="text-[var(--c-dim)] text-xs">{t.policyTrace.noTrace}</p>
  return (
    <div className="space-y-1.5">
      {steps.map(s => {
        const Icon = s.decision === 'ALLOW' ? CheckCircle : s.decision === 'DENY' ? XCircle : AlertTriangle
        const color = s.decision === 'ALLOW' ? 'text-emerald-400' : s.decision === 'DENY' ? 'text-[var(--c-red)]' : 'text-amber-400'
        const bg = s.decision === 'ALLOW' ? 'bg-emerald-950/40 border-emerald-900/40' : s.decision === 'DENY' ? 'bg-red-950/40 border-red-900/40' : 'bg-amber-950/40 border-amber-900/40'
        return (
          <div key={s.step} className={clsx('flex gap-3 p-3 rounded-lg border', bg)}>
            <div className="flex items-center gap-2 w-8 flex-shrink-0">
              <span className="text-[10px] text-[var(--c-dim)] w-3">{s.step}</span>
              <Icon className={clsx('w-4 h-4 flex-shrink-0', color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="mono text-xs font-semibold text-[var(--c-text)]">{s.name}</span>
                <span className={clsx('badge text-[10px]', s.decision === 'ALLOW' ? 'bg-emerald-900/60 text-emerald-300' : s.decision === 'DENY' ? 'bg-red-900/60 text-red-300' : 'bg-amber-900/60 text-amber-300')}>{s.decision}</span>
              </div>
              <p className="text-[11px] text-[var(--c-dim)] mb-1">{s.description}</p>
              <p className="text-[11px] text-[var(--c-text)]">{s.rule}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {Object.entries(s.inputs).map(([k, v]) => (
                  <span key={k} className="text-[9px] mono text-[var(--c-dim)]">{k}: <span className="text-[var(--c-text)]">{JSON.stringify(v)}</span></span>
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
