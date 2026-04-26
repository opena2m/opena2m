import { useQuery } from '@tanstack/react-query'
import { Package, CheckCircle, XCircle } from 'lucide-react'
import { gw } from '@/lib/api'

export default function Domains() {
  const { data: domains = [], isLoading } = useQuery({ queryKey: ['domains'], queryFn: () => gw.listDomains() })

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-xl font-bold text-white">Domains & Adapters</h1>
      {isLoading && <p className="text-slate-400">Loading…</p>}
      <div className="space-y-3">
        {domains.map(d => (
          <div key={d.domain_id} className="card flex items-start gap-4">
            <Package className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-semibold text-white">{d.domain_id}</span>
                {d.loaded
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                <span className={`text-xs ${d.loaded ? 'text-emerald-400' : 'text-red-400'}`}>
                  {d.loaded ? 'Loaded' : 'Not loaded'}
                </span>
              </div>
              <p className="text-xs text-slate-400">{d.adapter_package} v{d.adapter_version}</p>
              {d.schema_uri && <p className="text-xs text-slate-500 mt-1 font-mono">{d.schema_uri}</p>}
            </div>
          </div>
        ))}
        {!isLoading && domains.length === 0 && (
          <div className="card text-center py-10 text-slate-500">No domains registered.</div>
        )}
      </div>
    </div>
  )
}
