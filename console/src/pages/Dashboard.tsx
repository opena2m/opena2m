import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Link , useNavigate} from 'react-router-dom'

import { Activity, CheckCircle, AlertTriangle, Cpu, DollarSign } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { listJobs, listBudgets, getHealth, getCapabilities, listDevices, tickProgress } from '@/lib/dataLayer'
import { StateBadge, StateDot, ProgressBar, BudgetMeter, RelativeTime, PageHeader, pct } from '@/components/shared'
import { resolvePrincipal } from '@/lib/dataLayer'

function KpiCard({ label, value, sub, icon: Icon, color='text-[var(--c-accent)]', onClick }: any) {
  return <div className={clsx('card flex items-start gap-4 transition-colors', onClick && 'cursor-pointer hover:border-[var(--c-accent)]')} onClick={onClick}>
    <div className={clsx('p-2.5 rounded-lg bg-[var(--c-surface)]', color)}><Icon className="w-5 h-5" /></div>
    <div>
      <p className="text-2xl font-bold text-[var(--c-text)]" style={{fontFamily:'var(--font-display)'}}>{value}</p>
      <p className="text-xs text-[var(--c-dim)]">{label}</p>
      {sub && <p className="text-[10px] text-[var(--c-dim)] opacity-60 mt-0.5">{sub}</p>}
    </div>
  </div>
}

export default function Dashboard() {
  const navigate = useNavigate()
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const qc = useQueryClient()

  const { data: allJobs } = useQuery({ queryKey:['jobs-all',m], queryFn:()=>listJobs({page_size:50}), refetchInterval:6000 })
  const { data: running } = useQuery({ queryKey:['jobs-running',m], queryFn:()=>listJobs({state:'EXECUTING',page_size:50}), refetchInterval:5000 })
  const { data: auditing } = useQuery({ queryKey:['jobs-auditing',m], queryFn:()=>listJobs({state:'AUDITING',page_size:10}), refetchInterval:5000 })
  const { data: budgets } = useQuery({ queryKey:['budgets',m], queryFn:listBudgets, refetchInterval:30000 })
  const { data: health } = useQuery({ queryKey:['health',m], queryFn:getHealth, refetchInterval:30000 })
  const { data: caps } = useQuery({ queryKey:['caps',m], queryFn:getCapabilities })
  const { data: devices } = useQuery({ queryKey:['devices',m], queryFn:listDevices })

  // Simulate live progress ticks in mock mode
  const tickRef = useRef<ReturnType<typeof setInterval>|null>(null)
  useEffect(() => {
    if (m !== 'mock') return
    tickRef.current = setInterval(() => { tickProgress(); qc.invalidateQueries({queryKey:['jobs-all']}) }, 3000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [m, qc])

  const jobs = (allJobs as any)?.jobs ?? []
  const completed = jobs.filter((j:any)=>j.state==='COMPLETED').length
  const totalSpendToday = budgets?.reduce((s:number,b:any)=>s+b.consumed,0) ?? 0
  const spendCeiling = budgets?.reduce((s:number,b:any)=>s+b.ceiling_amount,0) ?? 100
  const sparkData = [...jobs].reverse().map((j:any,i:number)=>({i,v:Math.round(j.progress*100)}))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="section-title">{t.dashboard.title}</h1>
        <p className="section-sub">{t.dashboard.subtitle}
          {caps && <span className="text-[var(--c-accent)] ml-2">{t.dashboard.conformance}: {caps.conformance_level}</span>}
          <span className={clsx('ml-3 inline-flex items-center gap-1 text-[10px]', health ? 'text-[var(--c-green)]' : 'text-[var(--c-red)]')}>
            <span className={clsx('w-1.5 h-1.5 rounded-full', health ? 'bg-[var(--c-green)] animate-pulse-dot' : 'bg-[var(--c-red)]')} />
            {health ? t.dashboard.gatewayOnline : t.dashboard.gatewayOffline}
          </span>
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label={t.dashboard.runningJobs} value={running?.total??0} icon={Activity} color="text-[var(--c-green)]" onClick={()=>navigate('/jobs?state=EXECUTING')} />
        <KpiCard label={t.dashboard.awaitingReview} value={auditing?.total??0} sub={t.dashboard.hitlPending} icon={AlertTriangle} color="text-[var(--c-amber)]" onClick={()=>navigate('/review')} />
        <KpiCard label={t.dashboard.completedToday} value={completed} icon={CheckCircle} color="text-[var(--c-accent)]" onClick={()=>navigate('/jobs?state=COMPLETED')} />
        <KpiCard label={t.dashboard.devices} value={devices?.length??0} icon={Cpu} color="text-[var(--c-violet)]" onClick={()=>navigate('/devices')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent activity */}
        <div className="lg:col-span-2 card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--c-border)]">
            <span className="text-sm font-semibold text-[var(--c-text)]">{t.dashboard.recentJobs}</span>
            <Link to="/jobs" className="text-xs text-[var(--c-accent)] hover:opacity-80">{t.common.viewAll}</Link>
          </div>
          <div>
            {jobs.length === 0 && <p className="text-[var(--c-dim)] text-xs py-8 text-center">{t.dashboard.noJobs} <code className="text-[var(--c-accent)]">{t.dashboard.seedHint}</code></p>}
            {jobs.slice(0,8).map((job:any)=>{
              const p = resolvePrincipal(job.principal_id)
              return <Link key={job.job_id} to={`/jobs/${job.job_id}`}
                className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--c-border-dim)] last:border-0 hover:bg-[rgba(79,142,247,0.04)] transition-colors">
                <StateDot state={job.state} />
                <span className="mono text-[11px] text-[var(--c-dim)] w-24 truncate">{job.job_id.slice(0,14)}…</span>
                <span className="text-[11px] text-[var(--c-dim)] flex-1 truncate hidden sm:block">{job.domain_id??'—'}</span>
                <div className="w-16 hidden md:block"><ProgressBar value={job.progress} state={job.state} /></div>
                <StateBadge state={job.state} size="sm" />
                <span className="text-[10px] text-[var(--c-dim)] w-12 text-right shrink-0"><RelativeTime iso={job.updated_at} /></span>
              </Link>
            })}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          {/* Devices summary */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--c-border)]">
              <span className="text-sm font-semibold text-[var(--c-text)]">Devices ({devices?.length ?? 0})</span>
              <Link to="/devices" className="text-xs text-[var(--c-accent)] hover:opacity-80">{t.common.viewAll}</Link>
            </div>
            <div>
              {(devices ?? []).slice(0,4).map((d:any)=>(
                <Link key={d.device_id} to={`/devices/${d.device_id}`} className="flex items-center gap-3 px-5 py-2.5 border-b border-[var(--c-border-dim)] last:border-0 hover:bg-[rgba(79,142,247,0.04)] transition-colors">
                  <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', d.status_json?.reachable ? d.status_json?.busy ? 'bg-amber-400 animate-pulse-dot' : 'bg-[var(--c-green)]' : 'bg-[var(--c-red)]')} />
                  <span className="text-xs text-[var(--c-text)] flex-1 truncate">{d.display_name}</span>
                  <span className="text-[10px] text-[var(--c-dim)]">{d.status_json?.reachable ? d.status_json?.busy ? 'busy' : 'ready' : 'offline'}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Spend today */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-2"><DollarSign className="w-4 h-4 text-[var(--c-dim)]" />Spend today</span>
              <Link to="/budgets" className="text-xs text-[var(--c-accent)] hover:opacity-80">{t.common.manage}</Link>
            </div>
            <div className="text-xl font-bold mono text-[var(--c-text)] mb-2">USD ${totalSpendToday.toFixed(2)} <span className="text-xs text-[var(--c-dim)] font-normal">of ${spendCeiling.toFixed(0)}</span></div>
            <BudgetMeter consumed={totalSpendToday} ceiling={Math.max(spendCeiling, 1)} currency="USD" />
            {budgets?.slice(0,3).map((b:any)=>(
              <div key={b.budget_id} className="flex items-center justify-between mt-2 text-[10px] text-[var(--c-dim)]">
                <span>{resolvePrincipal(b.principal_id).display_name}</span>
                <span className="mono">${b.consumed.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Sparkline */}
          <div className="card">
            <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider mb-3">{t.dashboard.progressTrend}</p>
            <ResponsiveContainer width="100%" height={70}>
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="v" stroke="var(--c-accent)" strokeWidth={1.5} dot={false} />
                <XAxis hide /><YAxis hide domain={[0,100]} />
                <Tooltip contentStyle={{background:'var(--c-panel)',border:'1px solid var(--c-border)',borderRadius:6,fontSize:10,color:'var(--c-text)'}} formatter={(v:number)=>[`${v}%`,'']} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* HITL alert */}
      {(auditing?.total??0) > 0 && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--c-amber)] flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 font-medium text-sm">{t.dashboard.hitlAlert}</p>
            <p className="text-amber-400/70 text-xs mt-0.5">{auditing?.total} {t.dashboard.hitlAlertDesc}</p>
          </div>
          <Link to="/review" className="btn btn-amber text-xs whitespace-nowrap">{t.dashboard.reviewNow}</Link>
        </div>
      )}
    </div>
  )
}
