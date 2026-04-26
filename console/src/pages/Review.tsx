import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ShieldAlert, Clock } from 'lucide-react'
import { gw } from '@/lib/api'
import { fmtRelative } from '@/lib/utils'

export default function Review() {
  const { data, isLoading } = useQuery({
    queryKey: ['jobs', 'AUDITING'],
    queryFn: () => gw.listJobs({ state: 'AUDITING', page_size: 50 }),
    refetchInterval: 5000,
  })
  const jobs = data?.jobs ?? []

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-amber-400" />
        <div>
          <h1 className="text-xl font-bold text-white">Review Queue</h1>
          <p className="text-sm text-slate-400">Jobs paused for human-in-the-loop decision</p>
        </div>
        {jobs.length > 0 && (
          <span className="ml-auto bg-amber-500 text-white text-sm font-bold px-3 py-1 rounded-full">
            {jobs.length} pending
          </span>
        )}
      </div>

      {isLoading && <p className="text-slate-400">Loading…</p>}
      {!isLoading && jobs.length === 0 && (
        <div className="card text-center py-12">
          <ShieldAlert className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No jobs awaiting review</p>
          <p className="text-slate-500 text-sm mt-1">All HITL checkpoints have been resolved.</p>
        </div>
      )}

      <div className="space-y-3">
        {jobs.map(job => (
          <Link key={job.job_id} to={`/review/${job.job_id}`}
            className="card flex items-center gap-4 hover:border-amber-700 transition-colors group">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
            <div className="flex-1">
              <p className="font-mono text-sm text-white">{job.job_id}</p>
              <p className="text-xs text-slate-400 mt-0.5">{job.domain ?? '—'} · {job.device_id ?? '—'}</p>
            </div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
              <Clock className="w-3.5 h-3.5" />
              Waiting {fmtRelative(job.updated_at)}
            </div>
            <span className="btn-primary bg-amber-600 hover:bg-amber-700 text-xs">Review →</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
