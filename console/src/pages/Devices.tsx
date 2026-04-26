import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Monitor } from 'lucide-react'
import { gw } from '@/lib/api'
import { riskColor } from '@/lib/utils'

export default function Devices() {
  const { data: devices = [], isLoading } = useQuery({ queryKey: ['devices'], queryFn: () => gw.listDevices() })

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-xl font-bold text-white">Devices</h1>
      {isLoading && <p className="text-slate-400">Loading…</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {devices.map(d => (
          <Link key={d.device_id} to={`/devices/${d.device_id}`}
            className="card hover:border-brand-700 transition-colors">
            <div className="flex items-start gap-3">
              <Monitor className="w-5 h-5 text-slate-400 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-white">{d.display_name ?? d.device_id}</span>
                  <span className={`badge ${riskColor(d.risk_tier)}`}>{d.risk_tier ?? 'routine'}</span>
                  {d.conformance && <span className="badge bg-surface-600 text-slate-300">{d.conformance}</span>}
                </div>
                <p className="text-xs text-slate-400 font-mono">{d.device_id}</p>
                {d.vendor && <p className="text-xs text-slate-500 mt-1">{d.vendor} · {d.model}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {d.domains.map(dom => (
                    <span key={dom} className="text-xs bg-surface-600 text-slate-300 px-2 py-0.5 rounded-full">{dom}</span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        ))}
        {!isLoading && devices.length === 0 && (
          <div className="col-span-2 card text-center py-12 text-slate-500">
            No devices registered. Run <code className="font-mono">make seed</code>.
          </div>
        )}
      </div>
    </div>
  )
}
