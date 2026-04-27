import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { fmtAgo } from '@/lib/utils'
import { resolvePrincipal, type JobTransition } from '@/lib/dataLayer'
import { useT } from '@/i18n'
import { PrincipalAvatar } from './index'

const ICONS: Record<string,string> = {
  PENDING:'○', QUOTED:'◇', LOCKED:'◻', EXECUTING:'▶', AUDITING:'⏸', FULFILLING:'⬡', COMPLETED:'✓', ABORTED:'✕', FAILED:'✖'
}
const COLORS: Record<string,string> = {
  PENDING:'text-slate-400', QUOTED:'text-blue-400', LOCKED:'text-indigo-400',
  EXECUTING:'text-emerald-400', AUDITING:'text-amber-400', FULFILLING:'text-teal-400',
  COMPLETED:'text-emerald-400', ABORTED:'text-rose-400', FAILED:'text-red-500',
}

export default function TimelineRail({ transitions }: { transitions: JobTransition[] }) {
  const t = useT()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const toggle = (id: number) => setExpanded(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n })

  if (!transitions || transitions.length === 0) return <p className="text-[var(--c-dim)] text-xs py-6 text-center">No transitions recorded.</p>

  return (
    <div className="relative">
      <div className="absolute left-[22px] top-0 bottom-0 w-px bg-[var(--c-border)]" />
      <div className="space-y-0.5">
        {transitions.map((_t, i) => {
          const isLast = i === transitions.length - 1
          const principal = resolvePrincipal(_t.by_principal_id)
          const isOpen = expanded.has(_t.id)
          const color = COLORS[_t.to_state] ?? 'text-slate-400'
          return (
            <div key={_t.id} className="relative flex gap-4">
              {/* Icon */}
              <div className={clsx('w-11 h-11 flex-shrink-0 flex items-center justify-center z-10 text-base font-bold', color)}>
                {ICONS[_t.to_state] ?? '·'}
              </div>
              {/* Content */}
              <div className="flex-1 pb-4 min-w-0">
                <button onClick={()=>toggle(_t.id)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={clsx('mono text-xs font-semibold', color)}>{_t.to_state}</span>
                        {_t.from_state && <span className="text-[10px] text-[var(--c-dim)]">← {_t.from_state}</span>}
                        {isOpen ? <ChevronDown className="w-3 h-3 text-[var(--c-dim)]" /> : <ChevronRight className="w-3 h-3 text-[var(--c-dim)]" />}
                      </div>
                      <p className="text-[11px] text-[var(--c-dim)] mt-0.5">{_t.reason}</p>
                      <div className="mt-1"><PrincipalAvatar display_name={principal.display_name} kind={principal.kind} /></div>
                    </div>
                    <span className="text-[10px] text-[var(--c-dim)] flex-shrink-0">{fmtAgo(_t.at)}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="mt-2 space-y-2 pl-2 border-l border-[var(--c-border)]">
                    <pre className="text-[10px] text-[var(--c-dim)] mono bg-[var(--c-surface)] rounded p-2 overflow-x-auto">
                      {JSON.stringify(_t.details_json, null, 2)}
                    </pre>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-[var(--c-dim)] uppercase tracking-wider">{t.timeline.signature}</span>
                      <span className="mono text-[9px] text-[var(--c-dim)] truncate">{_t.signature}</span>
                      <span className="text-[9px] text-emerald-400 font-medium">{t.timeline.valid}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
