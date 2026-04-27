import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { getDevice, listJobs, restartAdapter, toggleDevice } from '@/lib/dataLayer'
import { RiskBadge, StateBadge, ProgressBar, SchemaDocViewer, ApprovalConfirmModal } from '@/components/shared'
import { useToastStore } from '@/store/toast'
import { resolveDomain } from '@/lib/dataLayer'

type Tab = 'overview' | 'capabilities' | 'sensors' | 'vision' | 'jobs' | 'config'

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const navigate = useNavigate()
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const [tab, setTab] = useState<Tab>('overview')
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [showToggleConfirm, setShowToggleConfirm] = useState(false)

  const { data: device, isLoading } = useQuery({ queryKey: ['device', deviceId, m], queryFn: () => getDevice(deviceId!), enabled: !!deviceId })
  const { data: jobsData } = useQuery({ queryKey: ['device-jobs', deviceId, m], queryFn: () => listJobs({ device_id: deviceId, page_size: 10 }), enabled: tab === 'jobs' && !!deviceId })

  const restartMut = useMutation({
    mutationFn: () => restartAdapter(deviceId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['device', deviceId] }); addToast(t.devices.restartSuccess, 'success'); setShowRestartConfirm(false) },
    onError: (e: Error) => { addToast(`${t.devices.restartFailed}: ${e.message}`, 'error'); setShowRestartConfirm(false) },
  })

  const toggleMut = useMutation({
    mutationFn: () => toggleDevice(deviceId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['device', deviceId] }); addToast('Device status updated.', 'success'); setShowToggleConfirm(false) },
    onError: (e: Error) => { addToast(e.message, 'error'); setShowToggleConfirm(false) },
  })

  if (isLoading) return <div className="text-[var(--c-dim)] py-20 text-center">{t.common.loading}</div>
  if (!device) return <div className="text-[var(--c-red)] py-20 text-center">{t.devices.devNotFound}</div>

  const d = device as any
  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: t.devices.tabOverview }, { id: 'capabilities', label: t.devices.tabCapabilities },
    { id: 'sensors', label: t.devices.tabSensors }, { id: 'vision', label: t.devices.tabVision },
    { id: 'jobs', label: t.devices.tabJobs }, { id: 'config', label: t.devices.tabConfig },
  ]
  const domain = resolveDomain(d.domains?.[0])
  const statusColor = d.status_json?.reachable ? (d.status_json?.busy ? 'bg-amber-400' : 'bg-[var(--c-green)]') : 'bg-[var(--c-red)]'
  const statusLabel = d.status_json?.reachable ? (d.status_json?.busy ? t.devices.busy : 'ready') : t.common.offline

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/devices')} className="btn btn-ghost p-1.5"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="section-title">{d.display_name}</h1>
            <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', statusColor, d.status_json?.reachable && 'animate-pulse-dot')} />
            <span className="text-xs text-[var(--c-dim)]">{statusLabel}</span>
          </div>
          <p className="text-xs text-[var(--c-dim)]">{t.devices.vendor}: {d.vendor} · {d.model} · fw {d.firmware}</p>
        </div>
        <RiskBadge tier={d.risk_tier} />
        <span className="badge bg-[var(--c-surface)] text-[var(--c-dim)]">{d.conformance}</span>
      </div>

      <div className="border-b border-[var(--c-border)] flex gap-0 overflow-x-auto">
        {TABS.map(tb => <button key={tb.id} onClick={() => setTab(tb.id)} className={clsx('tab', tab === tb.id && 'active')}>{tb.label}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card">
              <p className="text-xs font-semibold text-[var(--c-dim)] mb-3">{t.devices.snapshot}</p>
              {[['reachable', d.status_json?.reachable ? 'yes' : 'no'], ['busy', d.status_json?.busy ? 'yes' : 'no'], ['queue', String(d.status_json?.queue_length)], ['conformance', d.conformance]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-[var(--c-border-dim)] last:border-0 text-xs">
                  <span className="text-[var(--c-dim)]">{k}</span>
                  <span className="text-[var(--c-text)] mono">{v}</span>
                </div>
              ))}
            </div>
            <div className="card">
              <p className="text-xs font-semibold text-[var(--c-dim)] mb-3">{t.devices.currentJob}</p>
              {d.status_json?.current_job_id
                ? <Link to={`/jobs/${d.status_json.current_job_id}`} className="mono text-xs text-[var(--c-accent)] hover:opacity-80">{d.status_json.current_job_id}</Link>
                : <p className="text-[var(--c-dim)] text-xs">{t.devices.noCurrentJob}</p>}
            </div>
            <div className="card">
              <p className="text-xs font-semibold text-[var(--c-dim)] mb-3">{t.devices.stats24h}</p>
              {[[t.devices.jobs, String(d.stats24h?.jobs)], [t.devices.successPct, `${d.stats24h?.success_pct}%`], [t.devices.avgTime, `${d.stats24h?.avg_min} min`], [t.devices.uptime, `${d.stats24h?.uptime_pct}%`]].map(([k, v]) => (
                <div key={k} className="flex justify-between py-1.5 border-b border-[var(--c-border-dim)] last:border-0 text-xs">
                  <span className="text-[var(--c-dim)]">{k}</span>
                  <span className="text-[var(--c-text)] mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
          {d.consumables?.length > 0 && (
            <div className="card">
              <p className="text-xs font-semibold text-[var(--c-text)] mb-3">{t.devices.consumables}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {d.consumables.map((c: any) => (
                  <div key={c.name} className={clsx('bg-[var(--c-surface)] rounded-lg p-3 border', c.status === 'warn' ? 'border-amber-800/50' : 'border-[var(--c-border)]')}>
                    <p className="text-[10px] text-[var(--c-dim)] mb-1">{c.name}</p>
                    <p className={clsx('text-sm font-bold mono', c.status === 'warn' ? 'text-amber-300' : 'text-[var(--c-text)]')}>{c.remaining}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'capabilities' && domain && (
        <div className="card">
          <p className="text-sm font-semibold text-[var(--c-text)] mb-1">{domain.domain_id}</p>
          <p className="text-xs text-[var(--c-dim)] mb-4">{(domain.schema_json as any)?.description}</p>
          <SchemaDocViewer schema={domain.schema_json as any} />
        </div>
      )}

      {tab === 'sensors' && (
        <div className="space-y-2">
          {domain?.registered_sensors?.map(s => (
            <div key={s.channel} className="card flex items-center gap-4">
              <div className="flex-1"><p className="mono text-xs font-semibold text-[var(--c-text)]">{s.channel}</p><p className="text-[11px] text-[var(--c-dim)]">{s.description}</p></div>
              <span className="badge bg-[var(--c-surface)] text-[var(--c-dim)]">{s.unit}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'vision' && (
        <div className="space-y-2">
          {domain?.registered_vision_checks?.map(vc => (
            <div key={vc.name} className="card flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="mono text-xs font-semibold text-[var(--c-text)]">{vc.name}</p>
                  {vc.sandbox && <span className="badge bg-orange-950 text-orange-300 text-[9px]">{t.domains.sandbox}</span>}
                </div>
                <p className="text-[11px] text-[var(--c-dim)]">{vc.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'jobs' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full" style={{ minWidth: 400 }}>
            <thead><tr>{[t.jobs.jobId, t.jobs.state, t.jobs.progress, t.jobs.updated].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
            <tbody>
              {(jobsData as any)?.jobs?.map((j: any) => (
                <tr key={j.job_id} className="table-row cursor-pointer" onClick={() => navigate(`/jobs/${j.job_id}`)}>
                  <td className="table-td mono text-[11px] text-[var(--c-accent)]">{j.job_id}</td>
                  <td className="table-td"><StateBadge state={j.state} size="sm" /></td>
                  <td className="table-td"><div className="w-20"><ProgressBar value={j.progress} state={j.state} /></div></td>
                  <td className="table-td text-[11px] text-[var(--c-dim)]">{new Date(j.updated_at).toLocaleString()}</td>
                </tr>
              ))}
              {!(jobsData as any)?.jobs?.length && <tr><td colSpan={4} className="table-td text-center text-[var(--c-dim)] text-xs py-6">{t.devices.noJobs}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'config' && (
        <div className="card space-y-4">
          <p className="text-xs text-amber-400">⚠ {t.devices.configWarning}</p>
          <div className="grid grid-cols-2 gap-3">
            {[['Device ID', d.device_id], [t.devices.adapterVersion, domain?.adapter_package ?? '—'], ['Version', domain?.adapter_version ?? '—'], ['Location', `${d.location_json?.site}, ${d.location_json?.country}`]].map(([k, v]) => (
              <div key={k} className="bg-[var(--c-surface)] rounded-lg p-3">
                <p className="text-[10px] text-[var(--c-dim)] mb-1">{k}</p>
                <p className="text-xs text-[var(--c-text)] mono">{v}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost text-xs" onClick={() => setShowToggleConfirm(true)}>{t.devices.toggleEnabled}</button>
            <button className="btn btn-ghost text-xs" onClick={() => setShowRestartConfirm(true)}>{t.devices.restartAdapter}</button>
          </div>
        </div>
      )}

      {showRestartConfirm && (
        <ApprovalConfirmModal title={t.devices.restartConfirmTitle} action="device.restart"
          details={{ device_id: deviceId, reason: t.devices.restartConfirmDesc }}
          principal="human://bob@fab" danger
          onConfirm={() => restartMut.mutate()} onCancel={() => setShowRestartConfirm(false)}
          loading={restartMut.isPending} />
      )}
      {showToggleConfirm && (
        <ApprovalConfirmModal title={t.devices.toggleConfirmTitle} action="device.toggle"
          details={{ device_id: deviceId, currently_enabled: !d.disabled_at }}
          principal="human://bob@fab"
          onConfirm={() => toggleMut.mutate()} onCancel={() => setShowToggleConfirm(false)}
          loading={toggleMut.isPending} />
      )}
    </div>
  )
}
