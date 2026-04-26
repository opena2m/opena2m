import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { gw } from '@/lib/api'
import { riskColor } from '@/lib/utils'

export default function DeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>()
  const navigate = useNavigate()
  const { data: device, isLoading } = useQuery({
    queryKey: ['device', deviceId],
    queryFn: () => gw.getDevice(deviceId!),
    enabled: !!deviceId,
  })

  if (isLoading) return <div className="text-slate-400 py-10 text-center">Loading…</div>
  if (!device) return <div className="text-red-400 py-10 text-center">Device not found.</div>

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/devices')} className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{device.display_name ?? device.device_id}</h1>
          <p className="font-mono text-sm text-slate-400">{device.device_id}</p>
        </div>
        <span className={`badge ml-auto ${riskColor(device.risk_tier)}`}>{device.risk_tier ?? 'routine'}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[
          { k: 'Vendor', v: device.vendor ?? '—' },
          { k: 'Model', v: device.model ?? '—' },
          { k: 'Firmware', v: device.firmware ?? '—' },
          { k: 'Conformance', v: device.conformance ?? '—' },
        ].map(({ k, v }) => (
          <div key={k} className="card py-3">
            <p className="text-xs text-slate-500 mb-1">{k}</p>
            <p className="text-sm text-slate-200">{v}</p>
          </div>
        ))}
      </div>
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-200 mb-3">Supported Domains</h3>
        <div className="flex flex-wrap gap-2">
          {(device.domains ?? []).map(d => (
            <span key={d} className="text-xs bg-surface-600 text-slate-300 px-3 py-1 rounded-full font-mono">{d}</span>
          ))}
        </div>
      </div>
      {device.capabilities && (
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-200 mb-3">Capabilities</h3>
          <pre className="text-xs text-slate-400 font-mono overflow-x-auto">
            {JSON.stringify(device.capabilities, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
