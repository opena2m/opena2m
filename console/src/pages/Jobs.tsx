import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams , useNavigate} from 'react-router-dom'

import { Search, RefreshCw, Download, ChevronDown, Zap } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { listJobs, abortJob } from '@/lib/dataLayer'
import { StateBadge, StateDot, ProgressBar, RelativeTime, PageHeader, pct, ApprovalConfirmModal, NewJobWizard } from '@/components/shared'
import { useToastStore } from '@/store/toast'
import { resolvePrincipal } from '@/lib/dataLayer'

const STATES = ['','PENDING','QUOTED','LOCKED','EXECUTING','AUDITING','FULFILLING','COMPLETED','ABORTED','FAILED']

export default function Jobs() {
  const navigate = useNavigate()
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)

  const [stateFilter, setStateFilter] = useState(searchParams.get('state') ?? '')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [kebabJob, setKebabJob] = useState<string | null>(null)
  const [abortTarget, setAbortTarget] = useState<string | null>(null)
  const [showWizard, setShowWizard] = useState(false)

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['jobs-all', stateFilter, page, m],
    queryFn: () => listJobs({ state: stateFilter || undefined, page, page_size: 20 }),
    refetchInterval: 5000,
  })
  const jobs = (data as any)?.jobs ?? []
  const total = (data as any)?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / 20))

  const abortMut = useMutation({
    mutationFn: (id: string) => abortJob(id, 'console_abort'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs-all'] }); addToast(t.jobs.aborted, 'success'); setAbortTarget(null) },
    onError: (e: Error) => addToast(`${t.jobs.abortFailed}: ${e.message}`, 'error'),
  })

  const filtered = search
    ? jobs.filter((j: any) => j.job_id.toLowerCase().includes(search.toLowerCase()) || (j.domain_id ?? '').includes(search) || (j.device_id ?? '').includes(search))
    : jobs

  const handleExportCsv = () => {
    const header = 'job_id,state,progress,domain_id,device_id,cost_estimate,updated_at'
    const rows = jobs.map((j: any) => `${j.job_id},${j.state},${j.progress},${j.domain_id ?? ''},${j.device_id ?? ''},${j.cost_estimate ?? ''},${j.updated_at}`)
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'jobs.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t.jobs.title} sub={`${total} ${t.common.total}`}
        right={
          <div className="flex gap-2">
            <button className="btn btn-ghost text-xs" onClick={() => setShowWizard(true)}><Zap className="w-3.5 h-3.5" />{t.wizard.title}</button>
            <button onClick={() => refetch()} className="btn btn-ghost text-xs">
              <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} />{t.common.refresh}
            </button>
            <button onClick={handleExportCsv} className="btn btn-ghost text-xs">
              <Download className="w-3.5 h-3.5" />Export CSV
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-dim)]" />
          <input className="input pl-9" placeholder={t.common.search} value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input w-44" value={stateFilter}
          onChange={e => { setStateFilter(e.target.value); setPage(1); setSearchParams(e.target.value ? { state: e.target.value } : {}) }}>
          {STATES.map(s => <option key={s} value={s}>{s || t.jobs.allStates}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full" style={{ minWidth: 680 }}>
          <thead><tr>
            {[t.jobs.jobId, t.jobs.state, t.jobs.progress, t.jobs.domain, t.jobs.device, 'Cost', 'Actor', t.jobs.updated, ''].map(h => <th key={h} className="table-th">{h}</th>)}
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="table-td text-center text-[var(--c-dim)] py-8">{t.common.loading}</td></tr>}
            {!isLoading && filtered.length === 0 && <tr><td colSpan={9} className="table-td text-center text-[var(--c-dim)] py-8">{t.jobs.noJobs}</td></tr>}
            {filtered.map((job: any) => {
              const principal = resolvePrincipal(job.principal_id)
              const isRunning = ['EXECUTING','AUDITING','LOCKED','PENDING','FULFILLING'].includes(job.state)
              return (
                <tr key={job.job_id} className="table-row" onClick={() => navigate(`/jobs/${job.job_id}`)}>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <StateDot state={job.state} />
                      <Link to={`/jobs/${job.job_id}`} className="mono text-[11px] text-[var(--c-accent)] hover:opacity-80" onClick={e => e.stopPropagation()}>
                        {job.job_id.slice(0, 14)}…
                      </Link>
                    </div>
                  </td>
                  <td className="table-td"><StateBadge state={job.state} size="sm" /></td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <div className="w-16"><ProgressBar value={job.progress} state={job.state} /></div>
                      <span className="text-[11px] text-[var(--c-dim)] mono">{pct(job.progress)}</span>
                    </div>
                  </td>
                  <td className="table-td text-[11px] text-[var(--c-dim)] max-w-[140px] truncate hidden md:table-cell">{job.domain_id ?? '—'}</td>
                  <td className="table-td text-[11px] text-[var(--c-dim)] hidden lg:table-cell">{job.device_id ?? '—'}</td>
                  <td className="table-td mono text-[11px] text-[var(--c-text)]">{job.cost_estimate != null ? `$${job.cost_estimate.toFixed(2)}` : '—'}</td>
                  <td className="table-td hidden xl:table-cell">
                    <span className="text-[10px] text-[var(--c-dim)] flex items-center gap-1">
                      <span>{principal.kind === 'agent' ? '🤖' : '👤'}</span>
                      {principal.display_name}
                    </span>
                  </td>
                  <td className="table-td text-[11px]"><RelativeTime iso={job.updated_at} /></td>
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    <div className="relative">
                      <button className="btn btn-ghost text-xs px-2 py-1" onClick={e => { e.stopPropagation(); setKebabJob(job.job_id === kebabJob ? null : job.job_id) }}>
                        ⋯
                      </button>
                      {kebabJob === job.job_id && (
                        <div className="absolute right-0 top-7 z-20 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-lg shadow-xl py-1 w-40" onClick={e => e.stopPropagation()}>
                          <button className="w-full text-left px-4 py-2 text-xs text-[var(--c-text)] hover:bg-[var(--c-surface)]" onClick={() => { navigator.clipboard.writeText(job.job_id); setKebabJob(null) }}>Copy job ID</button>
                          <button className="w-full text-left px-4 py-2 text-xs text-[var(--c-text)] hover:bg-[var(--c-surface)]" onClick={() => { window.open(`/jobs/${job.job_id}`, '_blank'); setKebabJob(null) }}>Open in new tab</button>
                          {isRunning && <button className="w-full text-left px-4 py-2 text-xs text-[var(--c-red)] hover:bg-[var(--c-surface)]" onClick={() => { setAbortTarget(job.job_id); setKebabJob(null) }}>Abort</button>}
                          <button className="w-full text-left px-4 py-2 text-xs text-[var(--c-dim)] hover:bg-[var(--c-surface)]" onClick={() => setKebabJob(null)}>Re-run (prefill quote)</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-xs">
          <button className="btn btn-ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t.common.prev}</button>
          <span className="text-[var(--c-dim)]">{t.common.page} {page} {t.common.of} {pages}</span>
          <button className="btn btn-ghost" disabled={page === pages} onClick={() => setPage(p => p + 1)}>{t.common.next}</button>
        </div>
      )}

      {/* New Job Wizard */}
      <NewJobWizard open={showWizard} onClose={() => setShowWizard(false)} />

      {/* Close kebab on outside click */}
      {kebabJob && <div className="fixed inset-0 z-10" onClick={() => setKebabJob(null)} />}

      {/* Abort confirm */}
      {abortTarget && (
        <ApprovalConfirmModal title="Abort Job" action="job.abort"
          details={{ job_id: abortTarget, reason: t.jobs.operatorAbort, recovery_mode: 'safe_home' }}
          principal="human://bob@fab" danger
          onConfirm={() => abortMut.mutate(abortTarget)} onCancel={() => setAbortTarget(null)}
          loading={abortMut.isPending} />
      )}
    </div>
  )
}
