import React, { useState, useEffect } from 'react'
import { clsx } from 'clsx'
import type { JobState } from '@/lib/api'
import { useSettingsStore } from '@/store/settings'
import { useT } from '@/i18n'

// ── State colors ───────────────────────────────────────────────────────────────
const STATE_CFG: Record<string, { bg:string; dot:string; pulse?:boolean }> = {
  PENDING:    { bg:'bg-slate-800/80 text-slate-400',      dot:'bg-slate-500' },
  QUOTED:     { bg:'bg-blue-950 text-blue-300',            dot:'bg-blue-400' },
  LOCKED:     { bg:'bg-indigo-950 text-indigo-300',        dot:'bg-indigo-400' },
  EXECUTING:  { bg:'bg-emerald-950 text-emerald-300',      dot:'bg-emerald-400', pulse:true },
  AUDITING:   { bg:'bg-amber-950 text-amber-300',          dot:'bg-amber-400',   pulse:true },
  FULFILLING: { bg:'bg-teal-950 text-teal-300',            dot:'bg-teal-400',    pulse:true },
  COMPLETED:  { bg:'bg-emerald-950/60 text-emerald-400',   dot:'bg-emerald-400' },
  ABORTED:    { bg:'bg-rose-950 text-rose-300',            dot:'bg-rose-400' },
  FAILED:     { bg:'bg-red-950 text-red-400',              dot:'bg-red-500' },
}
export function StateBadge({ state, size='md' }: { state:JobState|string; size?:'sm'|'md' }) {
  const cfg = STATE_CFG[state] ?? STATE_CFG.PENDING
  return <span className={clsx('badge', cfg.bg, size==='sm'&&'text-[10px] px-1.5 py-0.5')}>
    <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot, cfg.pulse&&'animate-pulse-dot')} />
    {state}
  </span>
}
export function StateDot({ state }: { state:JobState|string }) {
  const cfg = STATE_CFG[state] ?? { dot:'bg-slate-500', pulse:false }
  return <span className={clsx('inline-block w-2 h-2 rounded-full flex-shrink-0', cfg.dot, cfg.pulse&&'animate-pulse-dot')} />
}

// ── Progress ring (circular) ───────────────────────────────────────────────────
export function ProgressRing({ value, state, size=56 }: { value:number; state?:string; size?:number }) {
  const r = (size-8)/2, circ = 2*Math.PI*r
  const stroke = state==='COMPLETED'?'#34d399':state==='FAILED'||state==='ABORTED'?'#f87171':state==='AUDITING'?'#fbbf24':'#4f8ef7'
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--c-border)" strokeWidth={4} />
    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={stroke} strokeWidth={4} strokeLinecap="round"
      strokeDasharray={circ} strokeDashoffset={circ*(1-Math.min(value,1))} transform={`rotate(-90 ${size/2} ${size/2})`}
      style={{transition:'stroke-dashoffset .5s'}} />
    <text x={size/2} y={size/2} dominantBaseline="middle" textAnchor="middle" fill={stroke}
      fontSize={size>48?12:10} fontFamily="var(--font-mono)" fontWeight={600}>
      {Math.round(value*100)}%
    </text>
  </svg>
}

// ── Progress bar ───────────────────────────────────────────────────────────────
export function ProgressBar({ value, state, height=4 }: { value:number; state?:string; height?:number }) {
  const color = state==='COMPLETED'?'bg-emerald-500':state==='FAILED'||state==='ABORTED'?'bg-red-600':state==='AUDITING'?'bg-amber-500':'bg-[var(--c-accent)]'
  return <div className="progress-track" style={{height}}>
    <div className={clsx('progress-fill',color)} style={{width:`${Math.min(value*100,100)}%`}} />
  </div>
}

// ── Budget meter ───────────────────────────────────────────────────────────────
export function BudgetMeter({ consumed, ceiling, currency='USD' }: { consumed:number; ceiling:number; currency?:string }) {
  const pct = consumed/ceiling
  const color = pct>0.9?'bg-red-500':pct>0.8?'bg-amber-500':pct>0.5?'bg-blue-500':'bg-emerald-500'
  return <div className="space-y-1">
    <div className="relative h-3 bg-[var(--c-border)] rounded-full overflow-hidden">
      {[0.5,0.8,1.0].map(t=><div key={t} className="absolute top-0 h-full w-px bg-[var(--c-panel)] z-10" style={{left:`${t*100}%`}} />)}
      <div className={clsx('h-full rounded-full transition-all',color)} style={{width:`${Math.min(pct*100,100)}%`}} />
    </div>
    <div className="flex justify-between text-[10px] text-[var(--c-dim)]">
      <span>{currency} {consumed.toFixed(2)} used</span>
      <span>of {ceiling.toFixed(2)}</span>
    </div>
  </div>
}

// ── Vision verdict ────────────────────────────────────────────────────────────
export function VisionVerdictChip({ verdict, confidence, check_name }: { verdict:string; confidence:number; check_name?:string }) {
  const cfg: Record<string,{bg:string;label:string}> = {
    pass:         { bg:'bg-emerald-950 text-emerald-300', label:'PASS' },
    warn:         { bg:'bg-amber-950 text-amber-300',     label:'WARN' },
    fail:         { bg:'bg-red-950 text-red-400',         label:'FAIL' },
    inconclusive: { bg:'bg-slate-800 text-slate-400',     label:'INCO' },
  }
  const c = cfg[verdict] ?? cfg.inconclusive
  return <div className={clsx('inline-flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono font-semibold',c.bg)}>
    <span>{c.label}</span>
    <div className="flex gap-0.5">
      {Array.from({length:5}).map((_,i)=><div key={i} className={clsx('w-1.5 h-1.5 rounded-sm',i<Math.round(confidence*5)?'bg-current opacity-100':'opacity-20 bg-current')} />)}
    </div>
    <span>{(confidence*100).toFixed(0)}%</span>
    {check_name && <span className="opacity-60">{check_name}</span>}
  </div>
}

// ── Principal avatar ──────────────────────────────────────────────────────────
export function PrincipalAvatar({ principal_id, display_name, kind }: { principal_id?:string; display_name:string; kind:'agent'|'human'|'system' }) {
  const icon = kind==='human'?'👤':kind==='agent'?'🤖':'⚙'
  return <div className="flex items-center gap-1.5">
    <span className="text-xs">{icon}</span>
    <span className="mono text-xs text-[var(--c-text)]">{display_name}</span>
  </div>
}

// ── Risk badge ────────────────────────────────────────────────────────────────
export function RiskBadge({ tier }: { tier?:string }) {
  const cfg = tier==='hazardous'?'bg-red-950 text-red-300':tier==='restricted'?'bg-amber-950 text-amber-300':'bg-emerald-950 text-emerald-400'
  return <span className={clsx('badge',cfg)}>{tier??'routine'}</span>
}

// ── Mode switcher ──────────────────────────────────────────────────────────────
export function ModeSwitcher() {
  const { mode, setMode } = useSettingsStore(); const t = useT()
  return <button onClick={()=>setMode(mode==='mock'?'live':'mock')} className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border',mode==='mock'?'bg-violet-950 border-violet-800 text-violet-300 hover:bg-violet-900':'bg-emerald-950 border-emerald-800 text-emerald-400 hover:bg-emerald-900')} title={mode==='mock'?t.mode.switchToLive:t.mode.switchToMock}>
    <span className={clsx('w-1.5 h-1.5 rounded-full',mode==='mock'?'bg-violet-400':'bg-emerald-400 animate-pulse-dot')} />
    {mode==='mock'?t.mode.mock:t.mode.live}
  </button>
}

// ── Language switcher ──────────────────────────────────────────────────────────
export function LangSwitcher() {
  const { lang, setLang } = useSettingsStore()
  return <button onClick={()=>setLang(lang==='en'?'zh':'en')} className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--c-dim)] border border-[var(--c-border)] hover:text-[var(--c-text)] transition-all">
    {lang==='en'?'中文':'EN'}
  </button>
}


// ── Theme switcher ─────────────────────────────────────────────────────────────
export function ThemeSwitcher() {
  const { theme, toggleTheme } = useSettingsStore()
  const t = useT()
  const isDark = theme === 'dark'
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-7 h-7 rounded-md text-[var(--c-dim)] hover:text-[var(--c-text)] hover:bg-[var(--c-surface)] transition-all border border-[var(--c-border)]"
      title={isDark ? t.theme.switchToLight : t.theme.switchToDark}
      aria-label={isDark ? t.theme.switchToLight : t.theme.switchToDark}
    >
      <span className="text-sm leading-none animate-theme-spin" key={theme}>
        {isDark ? '☀' : '🌙'}
      </span>
    </button>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export const pct = (v:number) => `${(v*100).toFixed(0)}%`
export function RelativeTime({ iso }: { iso:string }) {
  const t = useT(); const ms = Date.now()-new Date(iso).getTime(); const s = Math.round(ms/1000)
  const label = s<60?`${s}s`:s<3600?`${Math.round(s/60)}m`:s<86400?`${Math.round(s/3600)}h`:new Date(iso).toLocaleDateString()
  return <span className="text-[var(--c-dim)]">{label} {t.common.ago}</span>
}
export function Empty({ icon, title, desc, action }: { icon?:React.ReactNode; title:string; desc?:string; action?:React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
    {icon && <div className="text-4xl opacity-30">{icon}</div>}
    <p className="text-[var(--c-text)] font-medium">{title}</p>
    {desc && <p className="text-[var(--c-dim)] text-xs">{desc}</p>}
    {action}
  </div>
}
export function PageHeader({ title, sub, right, crumbs }: { title:string; sub?:string; right?:React.ReactNode; crumbs?:{label:string;href?:string}[] }) {
  return <div className="mb-5">
    {crumbs && crumbs.length>0 && <div className="flex items-center gap-1 text-[11px] text-[var(--c-dim)] mb-2">
      {crumbs.map((c,i)=>[i>0&&<span key={`sep${i}`}>/</span>, <span key={c.label} className={c.href?'hover:text-[var(--c-text)] cursor-pointer':undefined}>{c.label}</span>])}
    </div>}
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="section-title">{title}</h1>{sub&&<p className="section-sub">{sub}</p>}</div>
      {right}
    </div>
  </div>
}

export { default as ApprovalConfirmModal } from './ApprovalConfirmModal'
export { default as Drawer } from './Drawer'
export { default as Toast } from './Toast'
export { default as StateMachineDiagram } from './StateMachineDiagram'
export { default as TimelineRail } from './TimelineRail'
export { default as SchemaDocViewer } from './SchemaDocViewer'
export { default as PolicyTraceTree } from './PolicyTraceTree'

export { default as SimpleModal } from './SimpleModal'

export { default as NewJobWizard } from './NewJobWizard'
