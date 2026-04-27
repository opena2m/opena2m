import { type JobState } from '@/lib/api'
import { clsx } from 'clsx'

export function stateColor(state: JobState | string): string {
  const map: Record<string, string> = {
    PENDING:    'bg-slate-700 text-slate-300',
    QUOTED:     'bg-blue-900 text-blue-300',
    LOCKED:     'bg-indigo-900 text-indigo-300',
    EXECUTING:  'bg-green-900 text-green-300',
    AUDITING:   'bg-amber-900 text-amber-300',
    FULFILLING: 'bg-teal-900 text-teal-300',
    COMPLETED:  'bg-emerald-900 text-emerald-300',
    ABORTED:    'bg-rose-900 text-rose-300',
    FAILED:     'bg-red-900 text-red-400',
  }
  return map[state] ?? 'bg-slate-700 text-slate-300'
}

export function stateDot(state: JobState | string): string {
  const map: Record<string, string> = {
    EXECUTING:  'bg-green-400 animate-pulse',
    AUDITING:   'bg-amber-400 animate-pulse',
    FULFILLING: 'bg-teal-400',
    COMPLETED:  'bg-emerald-400',
    ABORTED:    'bg-rose-400',
    FAILED:     'bg-red-400',
    LOCKED:     'bg-indigo-400',
    QUOTED:     'bg-blue-400',
    PENDING:    'bg-slate-400',
  }
  return map[state] ?? 'bg-slate-400'
}

export function riskColor(tier?: string): string {
  if (tier === 'hazardous') return 'bg-red-900 text-red-300'
  if (tier === 'restricted') return 'bg-amber-900 text-amber-300'
  return 'bg-green-900 text-green-300'
}

export function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

export function truncate(s: string, n = 12): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`
}

export const fmtAgo = (iso:string) => { const s=Math.floor((Date.now()-new Date(iso).getTime())/1000); if(s<60) return `${s}s ago`; if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago` }
export const fmtUSD = (n:number) => `$${n.toFixed(2)}`
export const truncId = (id:string, n=12) => id.length>n ? id.slice(0,n)+'…' : id
