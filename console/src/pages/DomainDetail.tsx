import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { getDomain, listDevices } from '@/lib/dataLayer'
import { PageHeader, SchemaDocViewer, RiskBadge } from '@/components/shared'

type Tab = 'summary'|'schema'|'sensors'|'vision'|'errors'|'devices'

export default function DomainDetail() {
  const { domainId } = useParams<{ domainId: string }>()
  const navigate = useNavigate()
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const [tab, setTab] = useState<Tab>('summary')

  const { data: domain, isLoading } = useQuery({ queryKey:['domain',domainId,m], queryFn:()=>getDomain(decodeURIComponent(domainId!)), enabled:!!domainId })
  const { data: devices } = useQuery({ queryKey:['devices',m], queryFn:listDevices })

  if (isLoading) return <div className="text-[var(--c-dim)] py-20 text-center">Loading…</div>
  if (!domain) return <div className="text-[var(--c-red)] py-20 text-center">Domain not found.</div>

  const d = domain as any
  const domainDevices = (devices ?? []).filter((dev:any) => dev.domains?.includes(d.domain_id))

  const TABS: {id:Tab;label:string}[] = [
    {id:'summary',label:t.domains.tabSummary},{id:'schema',label:t.domains.tabSchema},{id:'sensors',label:'Sensors'},
    {id:'vision',label:t.domains.tabVision},{id:'errors',label:t.domains.tabErrors},{id:'devices',label:`Devices (${domainDevices.length})`},
  ]

  const CATEGORY_COLORS: Record<string,string> = {
    hardware_fault:'bg-red-950 text-red-300', process_fault:'bg-orange-950 text-orange-300',
    safety:'bg-red-950 text-red-400', consumable:'bg-amber-950 text-amber-300',
    validation:'bg-blue-950 text-blue-300', fulfillment:'bg-purple-950 text-purple-300',
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={()=>navigate('/domains')} className="btn btn-ghost p-1.5"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="mono text-sm font-semibold text-[var(--c-text)] truncate">{d.domain_id}</h1>
          <p className="text-xs text-[var(--c-dim)]">{d.adapter_package} · v{d.adapter_version}</p>
        </div>
        <div className="flex gap-2">
          <RiskBadge tier={d.risk_tier_default} />
          {d.loaded && <span className="flex items-center gap-1 text-[10px] text-[var(--c-green)]"><CheckCircle className="w-3 h-3" />Loaded</span>}
        </div>
      </div>

      <div className="border-b border-[var(--c-border)] flex gap-0 overflow-x-auto">
        {TABS.map(tb=><button key={tb.id} onClick={()=>setTab(tb.id)} className={clsx('tab',tab===tb.id&&'active')}>{tb.label}</button>)}
      </div>

      {tab==='summary' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            ['Domain ID', d.domain_id],['Adapter', d.adapter_package],['Version', d.adapter_version],
            ['Risk Tier', d.risk_tier_default],[t.domains.registered, new Date(d.registered_at).toLocaleDateString()],[t.domains.deviceCount, String(d.device_count)],
          ].map(([k,v])=>(
            <div key={k} className="card py-3"><p className="text-[10px] text-[var(--c-dim)] mb-1">{k}</p><p className="text-xs text-[var(--c-text)] mono break-all">{v}</p></div>
          ))}
        </div>
      )}

      {tab==='schema' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-[var(--c-text)]">{(d.schema_json as any)?.title}</p>
              <p className="text-xs text-[var(--c-dim)]">{(d.schema_json as any)?.description}</p>
            </div>
          </div>
          <SchemaDocViewer schema={d.schema_json as any} />
        </div>
      )}

      {tab==='sensors' && (
        <div className="space-y-2">
          {(d.registered_sensors ?? []).map((s:any)=>(
            <div key={s.channel} className="card flex items-center gap-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center text-[var(--c-accent)] text-sm">📊</div>
              <div className="flex-1">
                <p className="mono text-xs font-semibold text-[var(--c-text)]">{s.channel}</p>
                <p className="text-[11px] text-[var(--c-dim)]">{s.description}</p>
              </div>
              <span className="badge bg-[var(--c-surface)] text-[var(--c-dim)]">{s.unit}</span>
            </div>
          ))}
        </div>
      )}

      {tab==='vision' && (
        <div className="space-y-2">
          {(d.registered_vision_checks ?? []).map((vc:any)=>(
            <div key={vc.name} className="card flex items-start gap-4">
              <div className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center text-sm">👁</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="mono text-xs font-semibold text-[var(--c-text)]">{vc.name}</p>
                  {vc.sandbox && <span className="badge bg-orange-950 text-orange-300 text-[9px]">sandboxed</span>}
                </div>
                <p className="text-[11px] text-[var(--c-dim)]">{vc.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab==='errors' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead><tr>
              {[t.domains.errorCode,t.domains.description,t.domains.category].map(h=><th key={h} className="table-th">{h}</th>)}
            </tr></thead>
            <tbody>
              {(d.error_codes ?? []).map((ec:any)=>(
                <tr key={ec.code} className="table-row">
                  <td className="table-td mono text-[11px] text-[var(--c-red)]">{ec.code}</td>
                  <td className="table-td text-xs text-[var(--c-text)]">{ec.description}</td>
                  <td className="table-td"><span className={clsx('badge text-[10px]', CATEGORY_COLORS[ec.category]??'bg-[var(--c-surface)] text-[var(--c-dim)]')}>{ec.category}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='devices' && (
        <div className="space-y-2">
          {domainDevices.length===0 && <p className="text-[var(--c-dim)] text-xs py-6 text-center">No devices registered for this domain.</p>}
          {domainDevices.map((dev:any)=>(
            <div key={dev.device_id} className="card flex items-center gap-4">
              <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0', dev.status_json?.reachable?(dev.status_json?.busy?'bg-amber-400':'bg-[var(--c-green)]'):'bg-[var(--c-red)]')} />
              <div className="flex-1">
                <p className="text-xs font-semibold text-[var(--c-text)]">{dev.display_name}</p>
                <p className="mono text-[10px] text-[var(--c-dim)]">{dev.device_id}</p>
              </div>
              <RiskBadge tier={dev.risk_tier} />
              <span className="badge bg-[var(--c-surface)] text-[var(--c-dim)]">{dev.conformance}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
