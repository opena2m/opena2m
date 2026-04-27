import { useQuery } from '@tanstack/react-query'
import { Link , useNavigate} from 'react-router-dom'

import { Package, CheckCircle, XCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { listDomains } from '@/lib/dataLayer'
import { PageHeader, Empty, RiskBadge } from '@/components/shared'

export default function Domains() {
  const navigate = useNavigate()
  const t = useT(); const m = useSettingsStore(s=>s.mode)
  const { data: domains=[], isLoading } = useQuery({ queryKey:['domains',m], queryFn:listDomains })

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader title={t.domains.title} />
      {isLoading && <p className="text-[var(--c-dim)] text-sm">{t.common.loading}</p>}
      {!isLoading && (domains as any[]).length===0 && <Empty icon="◇" title={t.domains.noDomains} />}
      <div className="card p-0 overflow-hidden">
        <table className="w-full" style={{minWidth:520}}>
          <thead><tr>
            {['Domain','Adapter','Version','Devices','Risk','Status'].map(h=><th key={h} className="table-th">{h}</th>)}
          </tr></thead>
          <tbody>
            {(domains as any[]).map(d=>(
              <tr key={d.domain_id} className="table-row cursor-pointer" onClick={()=>navigate('/domains/'+encodeURIComponent(d.domain_id))}>
                <td className="table-td">
                  <p className="mono text-xs font-semibold text-[var(--c-accent)] hover:opacity-80">{d.domain_id}</p>
                </td>
                <td className="table-td text-xs text-[var(--c-dim)]">{d.adapter_package}</td>
                <td className="table-td mono text-xs text-[var(--c-dim)]">v{d.adapter_version}</td>
                <td className="table-td text-xs text-[var(--c-text)]">{d.device_count}</td>
                <td className="table-td"><RiskBadge tier={d.risk_tier_default} /></td>
                <td className="table-td">
                  {d.loaded
                    ? <span className="flex items-center gap-1 text-[10px] text-[var(--c-green)]"><CheckCircle className="w-3 h-3" />{t.domains.loaded}</span>
                    : <span className="flex items-center gap-1 text-[10px] text-[var(--c-dim)]"><XCircle className="w-3 h-3" />{t.domains.notLoaded}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
