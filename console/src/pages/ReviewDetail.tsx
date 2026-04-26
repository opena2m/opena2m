import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, XCircle, Camera, Thermometer } from 'lucide-react'
import { gw } from '@/lib/api'
import { stateColor, pct } from '@/lib/utils'

export default function ReviewDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const [token, setToken] = useState('')

  const { data: telemetry, isLoading } = useQuery({
    queryKey: ['telemetry', jobId],
    queryFn: () => gw.getTelemetry(jobId!),
    refetchInterval: 3000,
    enabled: !!jobId,
  })

  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => gw.getJob(jobId!),
    enabled: !!jobId,
  })

  const resumeMut = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      gw.resumeJob(jobId!, token || 'dev-auto-token', decision, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job', jobId] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      navigate('/review')
    },
    onError: (err: Error) => alert(`Resume failed: ${err.message}`),
  })

  if (isLoading) return <div className="text-slate-400 py-10 text-center">Loading…</div>

  const hitl = telemetry?.human_action_required
  const sensors = telemetry?.sensor_readings ?? []
  const media = telemetry?.media ?? []
  const vision = telemetry?.vision_checks ?? []

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/review')} className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">HITL Review</h1>
          <p className="font-mono text-sm text-slate-400">{jobId}</p>
        </div>
        {job && <span className={`badge ${stateColor(job.state)} ml-auto`}>{job.state}</span>}
      </div>

      {hitl && (
        <div className="rounded-xl border border-amber-700 bg-amber-900/20 p-5">
          <h2 className="text-amber-300 font-semibold mb-1">{hitl.reason}</h2>
          {hitl.checkpoint && <p className="text-xs text-amber-400 mb-2">Checkpoint: {hitl.checkpoint}</p>}
          {hitl.instructions && <p className="text-slate-300 text-sm">{hitl.instructions}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Progress */}
        <div className="card">
          <p className="text-xs text-slate-500 mb-2">Job Progress at Pause</p>
          <div className="text-3xl font-bold text-amber-400 mb-2">{pct(telemetry?.progress ?? 0)}</div>
          <div className="h-2 bg-surface-600 rounded-full">
            <div className="h-full bg-amber-500 rounded-full" style={{ width: pct(telemetry?.progress ?? 0) }} />
          </div>
        </div>

        {/* Vision verdicts */}
        <div className="card">
          <p className="text-xs text-slate-500 mb-2">Vision Checks</p>
          {vision.length === 0 && <p className="text-slate-500 text-sm">No checks run.</p>}
          {vision.map((vc, i) => (
            <div key={i} className="flex items-center gap-2 mb-1.5">
              {vc.passed
                ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                : <XCircle className="w-4 h-4 text-red-400" />}
              <span className="text-xs text-slate-300">{vc.check_name}</span>
              <span className={`text-xs font-medium ml-auto ${vc.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                {vc.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Latest sensors */}
      {sensors.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-slate-400" /> Latest Sensor Readings
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sensors.slice(0, 8).map((s, i) => (
              <div key={i} className="bg-surface-700 rounded-lg p-3">
                <p className="text-xs text-slate-500 mb-1">{s.channel}</p>
                <p className="text-lg font-mono font-bold text-brand-400">
                  {typeof s.value === 'number' ? s.value.toFixed(1) : String(s.value)}
                  {s.unit && <span className="text-xs text-slate-400 ml-1">{s.unit}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Latest media */}
      {media.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
            <Camera className="w-4 h-4 text-slate-400" /> Latest Snapshots
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {media.slice(-3).map((m, i) => (
              <div key={i}>
                <img src={m.url} alt={m.channel}
                  className="w-full rounded-lg aspect-video object-cover bg-surface-700"
                  onError={e => { (e.target as HTMLImageElement).alt = '[media unavailable]' }} />
                <p className="text-xs text-slate-500 mt-1 text-center">{m.channel}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision panel */}
      <div className="card border-2 border-surface-500">
        <h3 className="font-semibold text-white mb-4">Your Decision</h3>

        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1 block">Approval token</label>
          <input className="input font-mono text-xs" placeholder="Paste token (or leave blank for dev mode)"
            value={token} onChange={e => setToken(e.target.value)} />
          <p className="text-xs text-slate-500 mt-1">In dev mode, token verification is relaxed.</p>
        </div>

        <div className="mb-4">
          <label className="text-xs text-slate-400 mb-1 block">Reviewer note (optional)</label>
          <textarea className="input" rows={2} placeholder="Add notes about your decision…"
            value={note} onChange={e => setNote(e.target.value)} />
        </div>

        <div className="flex gap-3">
          <button
            className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
            disabled={resumeMut.isPending}
            onClick={() => resumeMut.mutate('approve')}>
            <CheckCircle className="w-5 h-5" />
            Approve — Continue Print
          </button>
          <button
            className="flex-1 flex items-center justify-center gap-2 bg-red-700 hover:bg-red-800 text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-50"
            disabled={resumeMut.isPending}
            onClick={() => resumeMut.mutate('reject')}>
            <XCircle className="w-5 h-5" />
            Reject — Abort Job
          </button>
        </div>
      </div>
    </div>
  )
}
