import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { ArrowLeft, StopCircle, Camera, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { getJob, getTelemetry, listAudit, abortJob, getJobTransitions, getPolicyTrace } from '@/lib/dataLayer'
import { StateBadge, ProgressBar, ProgressRing, RelativeTime, VisionVerdictChip, PrincipalAvatar, PageHeader, ApprovalConfirmModal, StateMachineDiagram, TimelineRail, SchemaDocViewer, PolicyTraceTree, pct } from '@/components/shared'
import { useToastStore } from '@/store/toast'
import { resolveDomain } from '@/lib/dataLayer'
import { resolvePrincipal } from '@/lib/dataLayer'

type Tab = 'overview'|'telemetry'|'media'|'audit'|'policy'|'payload'|'raw'

export default function JobDetail() {
  const { jobId } = useParams<{ jobId:string }>()
  const navigate = useNavigate(); const qc = useQueryClient()
  const t = useT(); const m = useSettingsStore(s=>s.mode)
  const addToast = useToastStore(s=>s.addToast)
  const [tab, setTab] = useState<Tab>('overview')
  const [showAbortConfirm, setShowAbortConfirm] = useState(false)

  const { data: job, isLoading } = useQuery({ queryKey:['job',jobId,m], queryFn:()=>getJob(jobId!), refetchInterval:d=>(['EXECUTING','AUDITING','LOCKED','FULFILLING'].includes((d as any)?.state??'')?3000:false), enabled:!!jobId })
  const { data: tel } = useQuery({ queryKey:['tel',jobId,m], queryFn:()=>getTelemetry(jobId!), refetchInterval:d=>(['EXECUTING','AUDITING','LOCKED'].includes((d as any)?.state??'')?2500:false), enabled:!!jobId })
  const { data: auditData } = useQuery({ queryKey:['audit-job',jobId,m], queryFn:()=>listAudit({job_id:jobId,page_size:50}), enabled:tab==='audit'&&!!jobId })
  const { data: transitions } = useQuery({ queryKey:['transitions',jobId], queryFn:()=>getJobTransitions(jobId!), enabled:!!jobId })
  const { data: policyTrace } = useQuery({ queryKey:['ptrace',jobId], queryFn:()=>getPolicyTrace(jobId!), enabled:tab==='policy'&&!!jobId })

  const abortMut = useMutation({
    mutationFn:()=>abortJob(jobId!,'console_abort'),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['job',jobId]}); qc.invalidateQueries({queryKey:['jobs-all']}); addToast(t.jobs.aborted,'success'); setShowAbortConfirm(false) },
    onError:(e:Error)=>addToast(`${t.jobs.abortFailed}: ${e.message}`,'error'),
  })

  if (isLoading) return <div className="text-[var(--c-dim)] py-20 text-center">{t.common.loading}</div>
  if (!job) return <div className="text-[var(--c-red)] py-20 text-center">{t.common.notFound}</div>

  const jb = job as any
  const isActive = ['EXECUTING','AUDITING','LOCKED','PENDING','FULFILLING'].includes(jb.state)
  const isAuditing = jb.state === 'AUDITING'
  const isFailed = jb.state === 'FAILED' || jb.state === 'ABORTED'
  const isCompleted = jb.state === 'COMPLETED'
  const principal = resolvePrincipal(jb.principal_id)
  const domain = resolveDomain(jb.domain_id)

  const sensorMap: Record<string,{v:number;t:string}[]> = {}
  ;((tel as any)?.sensors ?? []).forEach((s:any)=>{ if(typeof s.value==='number'){ sensorMap[s.channel]=sensorMap[s.channel]??[]; sensorMap[s.channel].push({v:s.value,t:s.at}) } })

  const TABS: {id:Tab;label:string}[] = [
    {id:'overview',label:t.jobs.tabOverview},
    {id:'telemetry',label:`${t.jobs.tabTelemetry} (${(tel as any)?.sensors?.length??0})`},
    {id:'media',    label:`${t.jobs.tabMedia} (${(tel as any)?.media?.length??0})`},
    {id:'audit',    label:`${t.jobs.tabAudit} (${(auditData as any)?.entries?.length??'…'})`},
    {id:'policy',   label:'Policy'},
    {id:'payload',  label:'Payload'},
    {id:'raw',      label:'Raw'},
  ]

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={()=>navigate('/jobs')} className="btn btn-ghost p-1.5 mt-0.5"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="mono text-[14px] font-semibold text-[var(--c-text)] truncate">{jobId}</h1>
            <StateBadge state={jb.state} />
          </div>
          <p className="text-xs text-[var(--c-dim)] mt-0.5 flex items-center gap-1 flex-wrap">
            <span>{jb.domain_id??'—'}</span><span>·</span>
            <span>{jb.device_id??'—'}</span><span>·</span>
            <PrincipalAvatar display_name={principal.display_name} kind={principal.kind} />
            <span>·</span>
            <RelativeTime iso={jb.updated_at} />
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0 flex-wrap">
          {isAuditing && <Link to={`/review/${jobId}`} className="btn btn-amber text-xs">⏸ {t.review.openReview}</Link>}
          {isCompleted && jb.tracking_json && <a href={jb.tracking_json.url} target="_blank" rel="noreferrer" className="btn btn-ghost text-xs">📦 Track {jb.tracking_json.carrier}</a>}
          {isActive && !isAuditing && <button className="btn btn-danger text-xs" onClick={()=>setShowAbortConfirm(true)} disabled={abortMut.isPending}><StopCircle className="w-3.5 h-3.5" />{t.jobs.abort}</button>}
        </div>
      </div>

      {/* Progress + ring */}
      <div className="card flex gap-6 items-center">
        <ProgressRing value={jb.progress} state={jb.state} size={72} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-[var(--c-dim)]">{t.jobs.progress}</span>
            <span className="mono font-medium text-[var(--c-text)]">{pct(jb.progress)}</span>
          </div>
          <ProgressBar value={jb.progress} state={jb.state} height={6} />
          {isFailed && jb.error_json && (
            <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/30 p-3">
              <p className="text-[var(--c-red)] text-xs font-semibold">{jb.error_json.code}</p>
              <p className="text-[var(--c-dim)] text-xs mt-1">{jb.error_json.message}</p>
            </div>
          )}
          {isCompleted && jb.tracking_json && (
            <div className="mt-3 rounded-lg border border-emerald-900/50 bg-emerald-950/30 p-3 flex items-center gap-3">
              <span className="text-lg">📦</span>
              <div>
                <p className="text-emerald-300 text-xs font-semibold">{jb.tracking_json.carrier} · {jb.tracking_json.tracking_number}</p>
                <p className="text-[var(--c-dim)] text-xs">{jb.tracking_json.status} · Cost: ${jb.cost_actual?.toFixed(2)??'—'}</p>
              </div>
            </div>
          )}
          {isAuditing && (tel as any)?.human_action_required && (
            <div className="mt-3 rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 flex items-center gap-3">
              <AlertIcon />
              <div className="flex-1"><p className="text-amber-300 text-xs font-medium">{(tel as any).human_action_required.reason}</p></div>
              <Link to={`/review/${jobId}`} className="btn btn-amber text-xs">Review →</Link>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--c-border)] flex gap-0 overflow-x-auto">
        {TABS.map(tb=><button key={tb.id} onClick={()=>setTab(tb.id)} className={clsx('tab whitespace-nowrap',tab===tb.id&&'active')}>{tb.label}</button>)}
      </div>

      {/* Tab: Overview */}
      {tab==='overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            {/* State machine */}
            <div className="card">
              <p className="text-xs font-semibold text-[var(--c-text)] mb-3">State Machine</p>
              <StateMachineDiagram currentState={jb.state} compact />
            </div>
            {/* Meta */}
            <div className="card grid grid-cols-2 gap-2">
              {[['Job ID',jb.job_id],[t.jobs.version,`v${jb.version}`],['Domain',jb.domain_id??'—'],['Device',jb.device_id??'—'],['Created',new Date(jb.created_at).toLocaleString()],['Updated',new Date(jb.updated_at).toLocaleString()]].map(([k,v])=>(
                <div key={k}>
                  <p className="text-[9px] text-[var(--c-dim)] uppercase tracking-wider mb-0.5">{k}</p>
                  <p className="text-[11px] text-[var(--c-text)] mono break-all">{v}</p>
                </div>
              ))}
            </div>
            {/* Cost */}
            <div className="card">
              <p className="text-xs font-semibold text-[var(--c-text)] mb-3">Cost Ledger</p>
              {[[t.jobs.estimate,jb.cost_estimate!=null?`$${jb.cost_estimate.toFixed(2)}`:'—'],[t.jobs.actual,jb.cost_actual!=null?`$${jb.cost_actual.toFixed(2)}`:'pending'],[t.jobs.currency,jb.cost_currency]].map(([k,v])=>(
                <div key={k} className="flex justify-between py-1.5 border-b border-[var(--c-border-dim)] last:border-0 text-xs">
                  <span className="text-[var(--c-dim)]">{k}</span>
                  <span className="text-[var(--c-text)] mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            {/* Live sensors */}
            {Object.keys(sensorMap).length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold text-[var(--c-text)] mb-3">{t.jobs.latestSensors}</p>
                <div className="space-y-2">
                  {(tel as any)?.sensors?.map((s:any)=>(
                    <div key={s.channel} className="flex items-center justify-between bg-[var(--c-surface)] rounded-lg px-3 py-2">
                      <div>
                        <p className="text-[10px] text-[var(--c-dim)]">{s.channel}</p>
                        <p className="text-lg font-bold text-[var(--c-accent)] mono">{typeof s.value==='number'?s.value.toFixed(1):String(s.value)}<span className="text-[10px] text-[var(--c-dim)] ml-1">{s.unit}</span></p>
                      </div>
                      <span className={clsx('text-[10px] font-medium', s.quality==='ok'?'text-[var(--c-green)]':s.quality==='warn'?'text-[var(--c-amber)]':'text-[var(--c-red)]')}>{s.quality}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Latest media */}
            {(tel as any)?.media?.length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold text-[var(--c-text)] mb-3 flex items-center gap-2"><Camera className="w-3.5 h-3.5 text-[var(--c-dim)]" />{t.jobs.latestSnapshots}</p>
                <div className="grid grid-cols-2 gap-2">
                  {(tel as any).media.slice(0,4).map((md:any)=>(
                    <div key={md.id} className="relative">
                      <div className="aspect-video bg-[var(--c-surface)] rounded-lg flex items-center justify-center text-[var(--c-dim)] text-3xl opacity-20">📷</div>
                      <p className="text-[9px] text-[var(--c-dim)] mt-1 text-center">{md.channel} · <RelativeTime iso={md.captured_at} /></p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Vision checks */}
            {(tel as any)?.vision_checks?.length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold text-[var(--c-text)] mb-3">{t.jobs.visionChecks}</p>
                {(tel as any).vision_checks.map((vc:any)=>(
                  <div key={vc.id} className="py-1.5 border-b border-[var(--c-border-dim)] last:border-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <VisionVerdictChip verdict={vc.verdict} confidence={vc.confidence} check_name={vc.check_name} />
                      <span className="text-[10px] text-[var(--c-dim)]"><RelativeTime iso={vc.at} /></span>
                    </div>
                    {vc.recommended_action && <p className="text-[10px] text-amber-400 mt-1">{vc.recommended_action}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Telemetry */}
      {tab==='telemetry' && (
        <div className="space-y-3">
          {Object.keys(sensorMap).length===0 && <p className="text-[var(--c-dim)] text-xs py-6 text-center">{t.jobs.noSensors}</p>}
          {Object.entries(sensorMap).map(([ch,readings])=>{
            const latest = readings[readings.length-1]
            return <div key={ch} className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-[var(--c-text)]">{ch}</span>
                <span className="text-2xl font-bold text-[var(--c-accent)] mono">{latest?.v?.toFixed(1)}</span>
              </div>
              <ResponsiveContainer width="100%" height={64}>
                <LineChart data={readings.slice(-30).map((r,i)=>({i,v:r.v}))}>
                  <Line type="monotone" dataKey="v" stroke="var(--c-accent)" strokeWidth={1.5} dot={false} />
                  <XAxis hide /><YAxis hide />
                  <Tooltip contentStyle={{background:'var(--c-panel)',border:'1px solid var(--c-border)',borderRadius:6,fontSize:10,color:'var(--c-text)'}} labelFormatter={()=>''} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          })}
        </div>
      )}

      {/* Tab: Media */}
      {tab==='media' && (
        <div>
          {(tel as any)?.media?.length===0 && <p className="text-[var(--c-dim)] text-xs py-6 text-center">{t.jobs.noMedia}</p>}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(tel as any)?.media?.map((md:any)=>(
              <div key={md.id} className="card p-2">
                <div className="aspect-video bg-[var(--c-surface)] rounded-lg flex items-center justify-center text-[var(--c-dim)] text-4xl opacity-20">📷</div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Camera className="w-3 h-3 text-[var(--c-dim)]" />
                  <span className="text-[10px] text-[var(--c-dim)]">{md.channel}</span>
                  <span className="text-[10px] text-[var(--c-dim)] ml-auto"><RelativeTime iso={md.captured_at} /></span>
                </div>
                <p className="text-[9px] text-[var(--c-dim)] mono mt-1 truncate">sig: {md.signature}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Audit */}
      {tab==='audit' && (
        <div>
          <TimelineRail transitions={transitions??[]} />
        </div>
      )}

      {/* Tab: Policy */}
      {tab==='policy' && (
        <div>
          <p className="text-xs text-[var(--c-dim)] mb-4">Policy evaluation trace at quote time for job <span className="mono text-[var(--c-text)]">{jobId}</span></p>
          <PolicyTraceTree steps={policyTrace??[]} />
        </div>
      )}

      {/* Tab: Payload */}
      {tab==='payload' && (
        <div className="card">
          <p className="text-xs font-semibold text-[var(--c-text)] mb-3">Execute Request Payload</p>
          {jb.asset_json && (
            <div className="mb-3 p-3 bg-[var(--c-surface)] rounded-lg text-xs">
              <p className="text-[var(--c-dim)] mb-1">Asset</p>
              <p className="mono text-[var(--c-text)]">{jb.asset_json.url}</p>
              <p className="mono text-[var(--c-dim)]">hash: {jb.asset_json.hash} · {(jb.asset_json.size_bytes/1024).toFixed(0)} KB</p>
            </div>
          )}
          <pre className="text-[11px] text-[var(--c-dim)] mono bg-[var(--c-surface)] rounded-lg p-4 overflow-x-auto">
            {JSON.stringify(jb.payload_json, null, 2)}
          </pre>
        </div>
      )}

      {/* Tab: Raw */}
      {tab==='raw' && (
        <div className="card">
          <p className="text-xs font-semibold text-[var(--c-text)] mb-3">Raw Telemetry Response</p>
          <pre className="text-[11px] text-[var(--c-dim)] mono bg-[var(--c-surface)] rounded-lg p-4 overflow-x-auto max-h-[500px]">
            {JSON.stringify(tel, null, 2)}
          </pre>
        </div>
      )}

      {/* Abort confirm modal */}
      {showAbortConfirm && (
        <ApprovalConfirmModal title="Abort Job" action={t.jobs.abortAction}
          details={{ job_id: jobId, reason: t.jobs.operatorAbort, recovery_mode: 'safe_home' }}
          principal={`human://bob@fab`} danger
          onConfirm={()=>abortMut.mutate()} onCancel={()=>setShowAbortConfirm(false)}
          loading={abortMut.isPending} />
      )}
    </div>
  )
}

function AlertIcon() { return <span className="text-amber-400 text-lg">⚠</span> }
