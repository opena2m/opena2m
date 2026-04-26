import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, RefreshCw } from 'lucide-react'
import { gw } from '@/lib/api'
import { stateColor, stateDot, fmtRelative, pct } from '@/lib/utils'

const STATES = ['', 'PENDING', 'QUOTED', 'LOCKED', 'EXECUTING', 'AUDITING', 'FULFILLING', 'COMPLETED', 'ABORTED', 'FAILED']

export default function Jobs() {
  const [stateFilter, setStateFilter] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['jobs', stateFilter, page],
    queryFn: () => gw.listJobs({ state: stateFilter || undefined, page, page_size: 20 }),
    refetchInterval: 5000,
  })

  const jobs = data?.jobs ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 20))

  const filtered = search
    ? jobs.filter(j => j.job_id.toLowerCase().includes(search.toLowerCase()) ||
        (j.domain ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (j.device_id ?? '').toLowerCase().includes(search.toLowerCase()))
    : jobs

  return (
    <div className="space-y-5 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Jobs</h1>
          <p className="text-sm text-slate-400">{total} total</p>
        </div>
        <button onClick={() => refetch()} className="btn-ghost flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input className="input pl-9 w-64" placeholder="Search job ID, domain…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={stateFilter}
          onChange={e => { setStateFilter(e.target.value); setPage(1) }}>
          {STATES.map(s => <option key={s} value={s}>{s || 'All states'}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-surface-600">
            <tr>
              {['Job ID', 'State', 'Progress', 'Domain', 'Device', 'Updated'].map(h => (
                <th key={h} className="table-header px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            {isLoading && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">Loading…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-slate-500">No jobs found.</td></tr>
            )}
            {filtered.map(job => (
              <tr key={job.job_id} className="hover:bg-surface-700/50 transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/jobs/${job.job_id}`} className="font-mono text-xs text-brand-400 hover:text-brand-300">
                    {job.job_id.slice(0, 16)}…
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${stateColor(job.state)} gap-1.5`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${stateDot(job.state)}`} />
                    {job.state}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-surface-600 rounded-full">
                      <div className="h-full bg-brand-500 rounded-full" style={{ width: pct(job.progress) }} />
                    </div>
                    <span className="text-xs text-slate-400">{pct(job.progress)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-300 max-w-[180px] truncate">
                  {job.domain ?? '—'}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{job.device_id ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{fmtRelative(job.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn-ghost text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="text-sm text-slate-400">Page {page} of {pages}</span>
          <button className="btn-ghost text-xs" disabled={page === pages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}
