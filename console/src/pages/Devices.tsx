import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Zap } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { listDevices, listJobs, createDevice } from '@/lib/dataLayer'
import { RiskBadge, PageHeader, Empty, SimpleModal, NewJobWizard } from '@/components/shared'
import { useToastStore } from '@/store/toast'

const DOMAINS_OPTS = ['manufacturing.print.2d.v1', 'manufacturing.additive.fdm.v1']

export default function Devices() {
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const [showRegister, setShowRegister] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [form, setForm] = useState({ device_id: '', display_name: '', vendor: '', model: '', firmware: '0.1.0', domain: DOMAINS_OPTS[0], risk_tier: 'routine', site: '', country: 'US' })

  const { data: devices = [], isLoading } = useQuery({ queryKey: ['devices', m], queryFn: listDevices })
  const { data: jobsData } = useQuery({ queryKey: ['jobs-all', m], queryFn: () => listJobs({ page_size: 50 }) })

  const currentJobs = new Map(
    ((jobsData as any)?.jobs ?? [])
      .filter((j: any) => ['EXECUTING','AUDITING','LOCKED','FULFILLING'].includes(j.state))
      .map((j: any) => [j.device_id, j])
  )

  const registerMut = useMutation({
    mutationFn: () => createDevice(form as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devices'] })
      addToast(t.devices.registerSuccess, 'success')
      setShowRegister(false)
      setForm({ device_id: '', display_name: '', vendor: '', model: '', firmware: '0.1.0', domain: DOMAINS_OPTS[0], risk_tier: 'routine', site: '', country: 'US' })
    },
    onError: (e: Error) => addToast(`${t.devices.registerFailed}: ${e.message}`, 'error'),
  })

  const fld = (k: keyof typeof form, label: string, rest?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div key={k}>
      <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{label}</label>
      <input className="input text-xs" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} {...rest} />
    </div>
  )

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title={t.devices.title}
        right={
          <div className="flex gap-2">
            <button className="btn btn-ghost text-xs" onClick={() => setShowWizard(true)}>
              <Zap className="w-3.5 h-3.5" />{t.wizard.title}
            </button>
            <button className="btn btn-primary text-xs" onClick={() => setShowRegister(true)}>
              <Plus className="w-3.5 h-3.5" />{t.devices.registerDevice}
            </button>
          </div>
        }
      />

      {isLoading && <p className="text-[var(--c-dim)] text-sm">{t.common.loading}</p>}

      {/* Desktop table */}
      <div className="hidden md:block card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full" style={{ minWidth: 720 }}>
          <thead><tr>
            {[t.devices.vendorModel, 'Domains', t.devices.riskTier, t.devices.conformance, t.common.status, t.devices.queue, t.devices.currentJob, t.devices.location].map(h => <th key={h} className="table-th">{h}</th>)}
          </tr></thead>
          <tbody>
            {(devices as any[]).map(d => {
              const cj = currentJobs.get(d.device_id)
              return (
                <tr key={d.device_id} className="table-row cursor-pointer" onClick={() => window.location.href = `/devices/${d.device_id}`}>
                  <td className="table-td">
                    <p className="text-xs font-semibold text-[var(--c-text)]">{d.display_name}</p>
                    <p className="mono text-[10px] text-[var(--c-dim)]">{d.device_id}</p>
                    <p className="text-[10px] text-[var(--c-dim)]">{d.vendor} · {d.model}</p>
                  </td>
                  <td className="table-td">
                    {d.domains?.map((dom: string) => <span key={dom} className="badge bg-[var(--c-surface)] text-[var(--c-dim)] text-[9px] mr-1">{dom.split('.').slice(-2).join('.')}</span>)}
                  </td>
                  <td className="table-td"><RiskBadge tier={d.risk_tier} /></td>
                  <td className="table-td"><span className="badge bg-blue-950 text-blue-300">{d.conformance}</span></td>
                  <td className="table-td">
                    <div className="flex items-center gap-2">
                      <span className={clsx('w-2 h-2 rounded-full', d.status_json?.reachable ? (d.status_json?.busy ? 'bg-amber-400 animate-pulse-dot' : 'bg-[var(--c-green)]') : 'bg-[var(--c-red)]')} />
                      <span className="text-xs text-[var(--c-text)]">{d.status_json?.reachable ? (d.status_json?.busy ? t.devices.busy : 'ready') : t.common.offline}</span>
                    </div>
                  </td>
                  <td className="table-td mono text-xs text-[var(--c-text)]">{d.status_json?.queue_length}</td>
                  <td className="table-td">
                    {cj ? <Link to={`/jobs/${(cj as any).job_id}`} className="mono text-[10px] text-[var(--c-accent)] hover:opacity-80" onClick={e => e.stopPropagation()}>{(cj as any).job_id.slice(0,10)}…</Link> : <span className="text-[var(--c-dim)] text-[10px]">—</span>}
                  </td>
                  <td className="table-td text-xs text-[var(--c-dim)]">{d.location_json?.site}, {d.location_json?.country}</td>
                </tr>
              )
            })}
            {!isLoading && (devices as any[]).length === 0 && (
              <tr><td colSpan={8} className="table-td text-center py-12">
                <Empty icon="⬡" title={t.devices.noDevices} desc={t.devices.seedHint} />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden grid grid-cols-1 gap-3">
        {(devices as any[]).map(d => (
          <Link key={d.device_id} to={`/devices/${d.device_id}`} className="card card-hover">
            <div className="flex items-start gap-3">
              <span className={clsx('w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0', d.status_json?.reachable ? (d.status_json?.busy ? 'bg-amber-400 animate-pulse-dot' : 'bg-[var(--c-green)]') : 'bg-[var(--c-red)]')} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--c-text)]">{d.display_name}</p>
                <p className="mono text-[10px] text-[var(--c-dim)]">{d.device_id}</p>
                <div className="flex gap-2 mt-2 flex-wrap"><RiskBadge tier={d.risk_tier} /><span className="badge bg-blue-950 text-blue-300">{d.conformance}</span></div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Register Device Modal */}
      <SimpleModal open={showRegister} onClose={() => setShowRegister(false)} title={t.devices.registerDevice}
        footer={<>
          <button className="btn btn-ghost flex-1 justify-center" onClick={() => setShowRegister(false)}>{t.common.cancel}</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={() => registerMut.mutate()} disabled={!form.device_id || registerMut.isPending}>
            {registerMut.isPending ? '…' : t.devices.registerDevice}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-3">
          {fld('device_id', 'Device ID *', { placeholder: 'my-printer-01' })}
          {fld('display_name', t.common.displayName, { placeholder: 'My Printer 01' })}
          {fld('vendor', t.devices.vendor.replace('/Model',''), { placeholder: 'Acme Corp' })}
          {fld('model', t.devices.model, { placeholder: 'PrintBot-5000' })}
          {fld('firmware', t.devices.firmware, { placeholder: '1.2.3' })}
          <div>
            <label className="text-[10px] text-[var(--c-dim)] mb-1 block">Domain</label>
            <select className="input text-xs" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}>
              {DOMAINS_OPTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.devices.riskTier}</label>
            <select className="input text-xs" value={form.risk_tier} onChange={e => setForm(f => ({ ...f, risk_tier: e.target.value }))}>
              {['routine','restricted','hazardous'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {fld('site', 'Site / Location', { placeholder: 'Fab Floor A' })}
        </div>
      </SimpleModal>

      {/* New Job Wizard */}
      <NewJobWizard open={showWizard} onClose={() => setShowWizard(false)} />
    </div>
  )
}
