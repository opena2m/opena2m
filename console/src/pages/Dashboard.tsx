import { useQuery } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Activity, CheckCircle, AlertTriangle, Clock, Cpu, DollarSign } from 'lucide-react'
import { gw, type JobList, type Budget } from '@/lib/api'
import { stateColor, stateDot, fmtRelative, pct } from '@/lib/utils'
import { Link } from 'react-router-dom'

function StatCard({ label, value, sub, icon: Icon, accent = 'text-brand-400' }: {
  label: string; value: string | number; sub?: string
  icon: React.FC<{ className?: string }>; accent?: string
}) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`p-2.5 rounded-lg bg-surface-700 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-slate-400">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: allJobs } = useQuery({
    queryKey: ['jobs', 'all'],
    queryFn: () => gw.listJobs({ page_size: 100 }),
    refetchInterval: 8000,
  })
  const { data: running } = useQuery({
    queryKey: ['jobs', 'EXECUTING'],
    queryFn: () => gw.listJobs({ state: 'EXECUTING', page_size: 50 }),
    refetchInterval: 5000,
  })
  const { data: auditing } = useQuery({
    queryKey: ['jobs', 'AUDITING'],
    queryFn: () => gw.listJobs({ state: 'AUDITING', page_size: 50 }),
    refetchInterval: 5000,
  })
  const { data: budgets } = useQuery({
    queryKey: ['budgets'],
    queryFn: () => gw.listBudgets(),
    refetchInterval: 30000,
  })
  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: () => gw.listDevices(),
  })

  const jobs = (allJobs as JobList | undefined)?.jobs ?? []
  const completed = jobs.filter(j => j.state === 'COMPLETED').length
  const failed = jobs.filter(j => j.state === 'FAILED' || j.state === 'ABORTED').length

  // Build sparkline data from recent jobs
  const sparkData = jobs.slice(0, 20).reverse().map((j, i) => ({
    i,
    progress: Math.round(j.progress * 100),
  }))

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">Real-time view of your AIMP gateway</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Running jobs" value={(running as JobList | undefined)?.total ?? 0}
          icon={Activity} accent="text-green-400" />
        <StatCard label="Awaiting review" value={(auditing as JobList | undefined)?.total ?? 0}
          sub="HITL pending" icon={AlertTriangle} accent="text-amber-400" />
        <StatCard label="Completed today" value={completed}
          icon={CheckCircle} accent="text-emerald-400" />
        <StatCard label="Devices" value={devices?.length ?? 0}
          icon={Cpu} accent="text-brand-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent jobs */}
        <div className="lg:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Recent Jobs</h2>
            <Link to="/jobs" className="text-xs text-brand-400 hover:text-brand-300">View all →</Link>
          </div>
          <div className="space-y-1">
            {jobs.length === 0 && (
              <p className="text-slate-500 text-sm py-4 text-center">No jobs yet. Run <code className="font-mono">make seed</code> to create reference devices.</p>
            )}
            {jobs.slice(0, 8).map(job => (
              <Link key={job.job_id} to={`/jobs/${job.job_id}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-700 transition-colors group">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stateDot(job.state)}`} />
                <span className="font-mono text-xs text-slate-300 w-28 truncate">{job.job_id}</span>
                <span className="text-xs text-slate-400 flex-1 truncate">{job.domain ?? '—'}</span>
                <span className={`badge ${stateColor(job.state)}`}>{job.state}</span>
                <span className="text-xs text-slate-500 w-16 text-right">{fmtRelative(job.updated_at)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Budget utilisation */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Budgets</h2>
            <Link to="/budgets" className="text-xs text-brand-400 hover:text-brand-300">Manage →</Link>
          </div>
          {(!budgets || (budgets as Budget[]).length === 0) && (
            <p className="text-slate-500 text-sm">No budgets configured.</p>
          )}
          {(budgets as Budget[] | undefined)?.map(b => (
            <div key={b.budget_id} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-300">{b.name}</span>
                <span className="text-slate-400 font-mono">{pct(b.utilization)}</span>
              </div>
              <div className="h-2 bg-surface-600 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${b.utilization > 0.9 ? 'bg-red-500' : b.utilization > 0.7 ? 'bg-amber-500' : 'bg-brand-500'}`}
                  style={{ width: `${Math.min(b.utilization * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{b.currency} {b.consumed.toFixed(2)} used</span>
                <span>of {b.ceiling.toFixed(2)}</span>
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-surface-600">
            <h3 className="text-xs text-slate-400 uppercase tracking-wider mb-3">Progress trend</h3>
            <ResponsiveContainer width="100%" height={80}>
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="progress" stroke="#6366f1" strokeWidth={2} dot={false} />
                <XAxis hide />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: '#1e2535', border: 'none', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`, 'Progress']}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* HITL alert */}
      {((auditing as JobList | undefined)?.total ?? 0) > 0 && (
        <div className="rounded-xl border border-amber-700 bg-amber-900/20 p-4 flex items-center gap-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 font-medium">Human review required</p>
            <p className="text-amber-400/80 text-sm">
              {(auditing as JobList | undefined)?.total} job(s) are paused waiting for your decision.
            </p>
          </div>
          <Link to="/review" className="btn-primary bg-amber-600 hover:bg-amber-700 text-sm">
            Review now
          </Link>
        </div>
      )}
    </div>
  )
}
