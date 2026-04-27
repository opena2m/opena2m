import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { listJobs, getTelemetry } from '@/lib/dataLayer'
import { RelativeTime, Empty, PageHeader, VisionVerdictChip } from '@/components/shared'

/** Single review card with telemetry fetched via dataLayer (works in both mock and live). */
function ReviewCard({ job }: { job: any }) {
  const m = useSettingsStore(s => s.mode)
  const t = useT()
  const { data: tel } = useQuery({
    queryKey: ['tel', job.job_id, m],
    queryFn: () => getTelemetry(job.job_id),
    // Only fetch for AUDITING jobs; stale for 5s
    staleTime: 5000,
  })
  const lastVc = (tel as any)?.vision_checks?.slice(-1)[0]

  return (
    <div className="card hover:border-amber-700/60 transition-colors">
      <div className="flex items-start gap-4">
        {/* Camera thumbnail placeholder */}
        <div className="w-[120px] h-[90px] flex-shrink-0 bg-gradient-to-br from-[#070910] via-[#0d1117] to-[#141922] border border-[var(--c-border)] rounded-lg flex items-center justify-center text-4xl opacity-20 relative">
          📷
          {lastVc && (
            <div className={clsx('absolute bottom-1 right-1 w-2 h-2 rounded-full', lastVc.verdict === 'pass' ? 'bg-[var(--c-green)]' : lastVc.verdict === 'warn' ? 'bg-amber-400' : 'bg-[var(--c-red)]')} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse-dot flex-shrink-0" />
                <span className="mono text-sm text-[var(--c-text)]">{job.job_id}</span>
                <span className="text-xs text-[var(--c-dim)]">{job.device_id}</span>
              </div>
              <p className="text-xs text-[var(--c-dim)] mt-1">{job.domain_id}</p>
            </div>
            <span className="text-xs text-[var(--c-dim)] flex-shrink-0 flex items-center gap-1">
              <Clock className="w-3 h-3" /><RelativeTime iso={job.updated_at} />
            </span>
          </div>

          {lastVc && (
            <div className="mb-2">
              <VisionVerdictChip verdict={lastVc.verdict} confidence={lastVc.confidence} check_name={lastVc.check_name} />
            </div>
          )}

          {(tel as any)?.human_action_required && (
            <div className="text-xs text-[var(--c-dim)] mb-1">
              <span className="text-[var(--c-text)] font-medium">{t.review.trigger}: </span>
              {(tel as any).human_action_required.checkpoint ?? 'mid_build_50_percent'}
            </div>
          )}
          <div className="text-xs text-[var(--c-dim)]">
            <span className="text-[var(--c-text)] font-medium">{t.review.policy}: </span>
            restricted-needs-hitl
          </div>
        </div>

        <Link to={`/review/${job.job_id}`} className="btn btn-amber text-xs flex-shrink-0">
          {t.review.openReview}
        </Link>
      </div>
    </div>
  )
}

export default function Review() {
  const [sortOrder, setSortOrder] = useState<'oldest'|'newest'>('oldest')
  const t = useT(); const m = useSettingsStore(s => s.mode)

  const { data, isLoading } = useQuery({
    queryKey: ['jobs-auditing', m],
    queryFn: () => listJobs({ state: 'AUDITING', page_size: 50 }),
    refetchInterval: 5000,
  })
  let jobs = (data as any)?.jobs ?? []
  if (sortOrder === 'oldest') jobs = [...jobs].sort((a: any, b: any) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title={t.review.title} sub={t.review.subtitle}
        right={jobs.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="badge bg-amber-900 text-amber-300">{jobs.length} {t.review.pending}</span>
            <select className="input w-40 text-xs" value={sortOrder} onChange={e => setSortOrder(e.target.value as 'oldest'|'newest')}>
              <option value="oldest">{t.review.sortOldest}</option>
              <option value="newest">{t.review.sortNewest}</option>
            </select>
          </div>
        ) : undefined}
      />

      {isLoading && <p className="text-[var(--c-dim)] text-sm">{t.common.loading}</p>}
      {!isLoading && jobs.length === 0 && (
        <Empty icon="✅" title={t.review.empty} desc={t.review.emptyDesc} />
      )}

      {jobs.length > 0 && (
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse-dot" />
          <span className="text-xs text-amber-300 font-semibold">
            {jobs.length} {t.review.waiting} {t.review.pending}
          </span>
        </div>
      )}

      <div className="space-y-3">
        {jobs.map((job: any) => <ReviewCard key={job.job_id} job={job} />)}
      </div>
    </div>
  )
}
