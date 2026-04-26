import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowLeft, StopCircle, RefreshCw, Camera, Thermometer, CheckCircle, XCircle } from 'lucide-react'
import { gw } from '@/lib/api'
import { stateColor, stateDot, fmtRelative, pct } from '@/lib/utils'

type Tab = 'overview' | 'telemetry' | 'media' | 'audit'

export default function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => gw.getJob(jobId!),
    refetchInterval: d => (['EXECUTING','AUDITING','LOCKED','PENDING','FULFILLING'].includes(d?.state ?? '') ? 3000 : false),
    enabled: !!jobId,
  })

  const { data: telemetry } = useQuery({
    queryKey: ['telemetry', jobId],
    queryFn: () => gw.getTelemetry(jobId!),
    refetchInterval: d => (['EXECUTING','AUDITING','LOCKED'].includes(d?.state ?? '') ? 2000 : false),
    enabled: !!jobId,
  })

  const { data: auditData } = useQuery({
    queryKey: ['audit', jobId],
    queryFn: () => gw.listAudit({ job_id: jobId, page_size: 50 }),
    enabled: tab === 'audit' && !!jobId,
    refetchInterval: 5000,
  })

  const abortMut = useMutation({
    mutationFn: () => gw.abortJob(jobId!, 'console_abort'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job', jobId] }),
  })

  const sensorHistory = (telemetry?.sensor_readings ?? []).reduce<Record<string, { at: string; value: number }[]>>(
    (acc, s) => {
      if (typeof s.value === 'number') {
        acc[s.channel] = acc[s.channel] ?? []
        acc[s.channel].push({ at: s.at, value: s.value })
      }
      return acc
    }, {})

  if (isLoading) return <div className="text-slate-400 py-10 text-center">Loading job…</div>
  if (!job) return <div className="text-red-400 py-10 text-center">Job not found.</div>

  const isActive = ['EXECUTING','AUDITING','LOCKED','PENDING','FULFILLING'].includes(job.state)
  const isAuditing = job.state === 'AUDITING'

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'telemetry', label: `Telemetry (${telemetry?.sensor_readings.length ?? 0})` },
    { id: 'media', label: `Media (${telemetry?.media.length ?? 0})` },
    { id: 'audit', label: `Audit (${auditData?.entries.length ?? '…'})` },
  ]

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/jobs')} className="btn-ghost p-2 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white font-mono">{jobId}</h1>
            <span className={`badge ${stateColor(job.state)} gap-1.5`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stateDot(job.state)}`} />
              {job.state}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {job.domain ?? 'Unknown domain'} · Device: {job.device_id ?? '—'} · Updated {fmtRelative(job.updated_at)}
          </p>
        </div>
        <div className="flex gap-2">
          {isAuditing && (
            <Link to={`/review/${jobId}`} className="btn-primary bg-amber-600 hover:bg-amber-700">
              Review (HITL)
            </Link>
          )}
          {isActive && (
            <button className="btn-danger flex items-center gap-2"
              onClick={() => { if (confirm('Abort this job?')) abortMut.mutate() }}
              disabled={abortMut.isPending}>
              <StopCircle className="w-4 h-4" />
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="card">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-300">Progress</span>
          <span className="text-slate-300 font-mono font-medium">{pct(job.progress)}</span>
        </div>
        <div className="h-3 bg-surface-600 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              job.state === 'COMPLETED' ? 'bg-emerald-500' :
              job.state === 'ABORTED' || job.state === 'FAILED' ? 'bg-red-500' :
              job.state === 'AUDITING' ? 'bg-amber-500' : 'bg-brand-500'
            }`}
            style={{ width: pct(job.progress) }}
          />
        </div>
        {job.error_message && (
          <p className="text-red-400 text-sm mt-2">⚠ {job.error_message}</p>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-600 flex gap-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.id ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400 hover:text-white'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4">
          {[
            { k: 'Job ID', v: job.job_id },
            { k: 'State', v: job.state },
            { k: 'Domain', v: job.domain ?? '—' },
            { k: 'Device', v: job.device_id ?? '—' },
            { k: 'Principal', v: job.principal_id ?? '—' },
            { k: 'Created', v: new Date(job.created_at).toLocaleString() },
            { k: 'Updated', v: new Date(job.updated_at).toLocaleString() },
            { k: 'Completed', v: job.completed_at ? new Date(job.completed_at).toLocaleString() : '—' },
          ].map(({ k, v }) => (
            <div key={k} className="card py-3">
              <p className="text-xs text-slate-500 mb-1">{k}</p>
              <p className="text-sm text-slate-200 font-mono break-all">{v}</p>
            </div>
          ))}

          {/* HITL info */}
          {telemetry?.human_action_required && (
            <div className="col-span-2 rounded-xl border border-amber-700 bg-amber-900/20 p-4">
              <p className="text-amber-300 font-semibold mb-1">⚠ Human review required</p>
              <p className="text-amber-400/80 text-sm">{telemetry.human_action_required.reason}</p>
              {telemetry.human_action_required.instructions && (
                <p className="text-slate-300 text-sm mt-1">{telemetry.human_action_required.instructions}</p>
              )}
              <Link to={`/review/${jobId}`} className="btn-primary mt-3 inline-block bg-amber-600 hover:bg-amber-700">
                Open Review
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Tab: Telemetry */}
      {tab === 'telemetry' && (
        <div className="space-y-4">
          {Object.keys(sensorHistory).length === 0 && (
            <p className="text-slate-500 text-sm">No sensor data yet.</p>
          )}
          {Object.entries(sensorHistory).map(([channel, readings]) => {
            const latest = readings[readings.length - 1]
            return (
              <div key={channel} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-200">{channel}</span>
                  </div>
                  <span className="text-lg font-mono font-bold text-brand-400">
                    {typeof latest?.value === 'number' ? latest.value.toFixed(1) : latest?.value}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={60}>
                  <LineChart data={readings.slice(-30)}>
                    <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={1.5} dot={false} />
                    <XAxis hide />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: '#1e2535', border: 'none', borderRadius: 6, fontSize: 11 }}
                      labelFormatter={() => ''}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          })}

          {/* Vision checks */}
          {(telemetry?.vision_checks ?? []).length > 0 && (
            <div className="card">
              <h3 className="text-sm font-semibold text-slate-200 mb-3">Vision Checks</h3>
              <div className="space-y-2">
                {telemetry!.vision_checks.map((vc, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-surface-700">
                    {vc.passed
                      ? <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-200">{vc.check_name}</p>
                      {vc.detail && <p className="text-xs text-slate-400">{vc.detail}</p>}
                    </div>
                    {vc.confidence != null && (
                      <span className="text-xs text-slate-400 font-mono">{(vc.confidence * 100).toFixed(0)}%</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Media */}
      {tab === 'media' && (
        <div>
          {(telemetry?.media ?? []).length === 0 && (
            <p className="text-slate-500 text-sm">No media snapshots yet.</p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {(telemetry?.media ?? []).map((m, i) => (
              <div key={i} className="card p-2">
                <img src={m.url} alt={m.channel} className="w-full rounded-lg object-cover aspect-video bg-surface-700"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                <div className="mt-2 flex items-center gap-1.5">
                  <Camera className="w-3 h-3 text-slate-500" />
                  <span className="text-xs text-slate-400">{m.channel}</span>
                  <span className="text-xs text-slate-500 ml-auto">{fmtRelative(m.captured_at)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Audit */}
      {tab === 'audit' && (
        <div className="space-y-2">
          {(auditData?.entries ?? []).length === 0 && (
            <p className="text-slate-500 text-sm">No audit entries.</p>
          )}
          {(auditData?.entries ?? []).map(entry => (
            <div key={entry.id} className="card py-3 flex gap-4">
              <div className="w-24 text-xs text-slate-500 font-mono flex-shrink-0">
                {new Date(entry.at).toLocaleTimeString()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-200">{entry.event_type}</span>
                  {entry.principal_id && (
                    <span className="text-xs text-slate-500">{entry.principal_id}</span>
                  )}
                </div>
                {entry.payload && (
                  <pre className="text-xs text-slate-400 font-mono overflow-x-auto">
                    {JSON.stringify(entry.payload, null, 2)}
                  </pre>
                )}
                {entry.entry_hash && (
                  <p className="text-xs text-slate-600 font-mono mt-1 truncate">#{entry.entry_hash}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
