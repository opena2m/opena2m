import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle, XCircle, Settings2, Camera } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { getJob, getTelemetry, resumeJob } from '@/lib/dataLayer'
import { StateBadge, ProgressBar, VisionVerdictChip, PrincipalAvatar, ApprovalConfirmModal, pct } from '@/components/shared'
import { useToastStore } from '@/store/toast'
import { resolvePrincipal } from '@/lib/dataLayer'

type Decision = 'CONTINUE' | 'ADJUST' | 'ABORT'

export default function ReviewDetail() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const addToast = useToastStore(s => s.addToast)
  const [decision, setDecision] = useState<Decision>('CONTINUE')
  const [note, setNote] = useState('')
  const [adjustParams, setAdjustParams] = useState<Record<string, unknown>>({})
  const [showConfirm, setShowConfirm] = useState(false)

  const { data: tel, isLoading } = useQuery({ queryKey:['tel',jobId,m], queryFn:()=>getTelemetry(jobId!), refetchInterval:3000, enabled:!!jobId })
  const { data: job } = useQuery({ queryKey:['job',jobId,m], queryFn:()=>getJob(jobId!), enabled:!!jobId })

  const resumeMut = useMutation({
    mutationFn: () => resumeJob(jobId!, 'dev-auto-token', decision, note, decision === 'ADJUST' ? adjustParams : undefined),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey:['job',jobId] })
      qc.invalidateQueries({ queryKey:['jobs-all'] })
      qc.invalidateQueries({ queryKey:['jobs-auditing'] })
      addToast(`Decision submitted: ${decision}`, decision === 'ABORT' ? 'warning' : 'success')
      setShowConfirm(false)
      navigate('/jobs/' + jobId)
    },
    onError: (e: Error) => addToast(`${t.review.resumeFailed}: ${e.message}`, 'error'),
  })

  // Keyboard shortcuts: c=Continue, a=Adjust, x=Abort, Enter=Submit
  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    if (e.key === 'c') setDecision('CONTINUE')
    if (e.key === 'a') setDecision('ADJUST')
    if (e.key === 'x') setDecision('ABORT')
    if (e.key === 'Enter') setShowConfirm(true)
  }, [])
  useEffect(() => { document.addEventListener('keydown', handleKey); return () => document.removeEventListener('keydown', handleKey) }, [handleKey])

  const jb = job as any
  const te = tel as any
  if (isLoading) return <div className="text-[var(--c-dim)] py-20 text-center">{t.common.loading}</div>

  // Job moved on
  if (jb && jb.state !== 'AUDITING') {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={()=>navigate('/review')} className="btn btn-ghost p-1.5"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="section-title">{t.review.hitlTitle}</h1>
        </div>
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">✓</div>
          <p className="font-semibold text-[var(--c-text)] mb-2">This job has moved on</p>
          <p className="text-[var(--c-dim)] text-xs mb-4">Current state: {jb.state}</p>
          <button onClick={()=>navigate('/jobs/'+jobId)} className="btn btn-primary text-xs">View Job →</button>
        </div>
      </div>
    )
  }

  const lastVc = te?.vision_checks?.slice(-1)[0]
  const sensors = te?.sensors ?? []
  const hitl = te?.human_action_required

  const OPTS: {value:Decision;label:string;icon:React.ReactNode;desc:string;cls?:string}[] = [
    { value:'CONTINUE', label:'Continue',           icon:<CheckCircle className="w-5 h-5"/>, desc:'Resume the job from current state' },
    { value:'ADJUST',   label:'Adjust parameters',  icon:<Settings2   className="w-5 h-5"/>, desc:'Override specific parameters and continue' },
    { value:'ABORT',    label:'Abort',              icon:<XCircle     className="w-5 h-5"/>, desc:'Halt the job and return device to safe state', cls:'text-[var(--c-red)]' },
  ]

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={()=>navigate('/review')} className="btn btn-ghost p-1.5"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <h1 className="section-title">{t.review.hitlTitle}</h1>
          <p className="mono text-xs text-[var(--c-dim)]">{jobId}</p>
        </div>
        {jb && <StateBadge state={jb.state} />}
      </div>

      {/* Why called */}
      {hitl && (
        <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 space-y-1">
          <p className="text-amber-300 font-semibold text-sm">Why I was called</p>
          <p className="text-[var(--c-dim)] text-xs"><span className="text-[var(--c-text)]">Trigger:</span> {hitl.checkpoint ?? 'mid_build_50_percent'}</p>
          <p className="text-[var(--c-dim)] text-xs"><span className="text-[var(--c-text)]">Reason:</span> {hitl.reason}</p>
          {lastVc && <div className="flex items-center gap-2 mt-1"><span className="text-[var(--c-dim)] text-xs">Last vision:</span><VisionVerdictChip verdict={lastVc.verdict} confidence={lastVc.confidence} check_name={lastVc.check_name} /></div>}
          <p className="text-[var(--c-dim)] text-xs"><span className="text-[var(--c-text)]">Policy:</span> restricted-needs-hitl — human review required</p>
          <p className="text-[var(--c-dim)] text-xs"><span className="text-[var(--c-text)]">Progress:</span> {jb ? pct(jb.progress) : '50%'}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left: camera + sensors */}
        <div className="lg:col-span-3 space-y-3">
          {/* Camera */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
              <span className="text-xs font-semibold text-[var(--c-text)] flex items-center gap-2"><Camera className="w-3.5 h-3.5 text-[var(--c-dim)]" />Live Camera — camera.top</span>
              <span className="text-[10px] text-[var(--c-dim)]">2s ago</span>
            </div>
            <div className="aspect-video bg-gradient-to-br from-[#070910] via-[#0d1117] to-[#141922] flex items-center justify-center text-[var(--c-dim)] text-6xl opacity-10 relative">
              📷
              <div className="absolute bottom-3 left-3 bg-black/70 rounded px-2 py-1 mono text-[10px] text-[var(--c-dim)]">camera.top · 2s ago</div>
            </div>
          </div>

          {/* Sensors */}
          <div className="card">
            <p className="text-xs font-semibold text-[var(--c-text)] mb-3">Sensors Now</p>
            <div className="grid grid-cols-2 gap-2">
              {sensors.map((s:any)=>(
                <div key={s.channel} className="bg-[var(--c-surface)] rounded-lg p-3">
                  <p className="text-[10px] text-[var(--c-dim)] mb-1">{s.channel}</p>
                  <p className="text-lg font-bold text-[var(--c-accent)] mono">{typeof s.value==='number'?s.value.toFixed(1):String(s.value)}<span className="text-[10px] text-[var(--c-dim)] ml-1">{s.unit}</span></p>
                </div>
              ))}
            </div>
          </div>

          {/* Vision history */}
          {te?.vision_checks?.length > 0 && (
            <div className="card">
              <p className="text-xs font-semibold text-[var(--c-text)] mb-3">Vision Check History</p>
              <div className="space-y-1.5">
                {te.vision_checks.map((vc:any)=>(
                  <div key={vc.id} className="flex items-center gap-3">
                    <VisionVerdictChip verdict={vc.verdict} confidence={vc.confidence} />
                    <span className="text-[10px] text-[var(--c-dim)] flex-1">{vc.check_name}</span>
                    {vc.recommended_action && <span className="text-[10px] text-amber-400">{vc.recommended_action}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: decision panel */}
        <div className="lg:col-span-2">
          <div className="card border-2 border-[var(--c-border)] space-y-4 sticky top-4">
            <p className="font-semibold text-sm text-[var(--c-text)]">{t.review.yourDecision}</p>

            {/* Decision options */}
            <div className="space-y-2">
              {OPTS.map(o=>(
                <div key={o.value} onClick={()=>setDecision(o.value)} className={clsx(
                  'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                  decision===o.value ? 'border-[var(--c-accent)] bg-[var(--c-accent-glow)]' : 'border-[var(--c-border)] hover:border-[var(--c-border-dim)] bg-[var(--c-surface)]'
                )}>
                  <div className={clsx('flex-shrink-0', decision===o.value?'text-[var(--c-accent)]':o.cls??'text-[var(--c-dim)]')}>{o.icon}</div>
                  <div>
                    <p className={clsx('text-xs font-semibold', decision===o.value?'text-[var(--c-text)]':o.cls??'text-[var(--c-dim)]')}>{o.label}</p>
                    <p className="text-[10px] text-[var(--c-dim)]">{o.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Adjust form */}
            {decision === 'ADJUST' && (
              <div className="bg-[var(--c-surface)] rounded-lg p-3 border border-[var(--c-border)] space-y-2">
                <p className="text-[10px] text-[var(--c-dim)] font-semibold uppercase tracking-wider">Parameter overrides</p>
                {[['nozzle_temp_celsius','Nozzle Temp (°C)','240','180–280'],['bed_temp_celsius','Bed Temp (°C)','80','0–110'],['infill_percent','Infill %','40','0–100']].map(([k,label,def,range])=>(
                  <div key={k}>
                    <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{label} <span className="opacity-50">({range})</span></label>
                    <input type="number" className="input text-xs" defaultValue={def}
                      onChange={e=>setAdjustParams(p=>({...p,[k!]:Number(e.target.value)}))} />
                  </div>
                ))}
              </div>
            )}

            {/* Note */}
            <div>
              <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.review.reviewerNote}</label>
              <textarea className="input" rows={2} placeholder={t.review.noteHint} value={note} onChange={e=>setNote(e.target.value)} />
            </div>

            {/* Acting as */}
            <div className="bg-[var(--c-surface)] rounded-lg p-2.5 flex items-center gap-2">
              <span className="text-[10px] text-[var(--c-dim)]">Acting as</span>
              <PrincipalAvatar display_name="bob@fab" kind="human" />
              <span className="text-[9px] text-[var(--c-dim)] ml-auto">Reviewer</span>
            </div>

            <button className="btn btn-primary w-full justify-center" onClick={()=>setShowConfirm(true)} disabled={resumeMut.isPending}>
              {resumeMut.isPending ? '…' : 'Submit Decision'}
            </button>

            <p className="text-[9px] text-[var(--c-dim)] text-center">
              Keyboard: <kbd className="bg-[var(--c-surface)] px-1 rounded mono">c</kbd> Continue &nbsp;
              <kbd className="bg-[var(--c-surface)] px-1 rounded mono">a</kbd> Adjust &nbsp;
              <kbd className="bg-[var(--c-surface)] px-1 rounded mono">x</kbd> Abort &nbsp;
              <kbd className="bg-[var(--c-surface)] px-1 rounded mono">Enter</kbd> Submit
            </p>
          </div>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <ApprovalConfirmModal title={`Confirm: ${decision}`}
          action={`job.resume.${decision.toLowerCase()}`}
          details={{ decision, job_id: jobId, job_version: jb?.version, note: note||'(none)', adjustParams: decision==='ADJUST'?adjustParams:undefined }}
          principal="human://bob@fab" danger={decision==='ABORT'}
          onConfirm={()=>resumeMut.mutate()} onCancel={()=>setShowConfirm(false)}
          loading={resumeMut.isPending} />
      )}
    </div>
  )
}
