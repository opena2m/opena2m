import { useQuery } from '@tanstack/react-query'
import { Settings as SettingsIcon, Webhook, Key, Activity } from 'lucide-react'
import { gw } from '@/lib/api'

export default function Settings() {
  const { data: caps } = useQuery({ queryKey: ['capabilities'], queryFn: () => gw.capabilities() })
  const { data: webhooks = [] } = useQuery({ queryKey: ['webhooks'], queryFn: () => gw.listWebhooks() })

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-5 h-5 text-slate-400" />
        <h1 className="text-xl font-bold text-white">Settings</h1>
      </div>

      {/* Gateway info */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-white">Gateway</h2>
        </div>
        {caps && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-400">AIMP Version:</span> <span className="text-slate-200">{caps.aimp_version}</span></div>
            <div><span className="text-slate-400">Conformance:</span> <span className="text-slate-200">{caps.conformance_level}</span></div>
            <div className="col-span-2">
              <span className="text-slate-400">Features: </span>
              <span className="text-slate-300 text-xs font-mono">{(caps.features ?? []).join(', ')}</span>
            </div>
            <div className="col-span-2">
              <span className="text-slate-400">Domains: </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {(caps.domains ?? []).map((d: string) => (
                  <span key={d} className="text-xs bg-surface-600 text-slate-300 px-2 py-0.5 rounded-full font-mono">{d}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Webhooks */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Webhook className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-white">Webhook Endpoints</h2>
        </div>
        {(webhooks as { endpoint_id: string; url: string; events: string[]; enabled: boolean }[]).length === 0 && (
          <p className="text-slate-500 text-sm">No webhook endpoints configured.</p>
        )}
        {(webhooks as { endpoint_id: string; url: string; events: string[]; enabled: boolean }[]).map(ep => (
          <div key={ep.endpoint_id} className="flex items-center gap-3 py-2 border-b border-surface-600 last:border-0">
            <span className={`w-2 h-2 rounded-full ${ep.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <span className="text-sm text-slate-200 font-mono flex-1 truncate">{ep.url}</span>
            <span className="text-xs text-slate-400">{ep.events.join(', ')}</span>
          </div>
        ))}
      </div>

      {/* API Key info */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-4 h-4 text-slate-400" />
          <h2 className="font-semibold text-white">API Access</h2>
        </div>
        <p className="text-sm text-slate-400 mb-3">
          Use Bearer token authentication for all API calls. In dev mode, use <code className="font-mono text-brand-400">dev-token</code>.
        </p>
        <div className="bg-surface-700 rounded-lg p-3 font-mono text-xs text-slate-300">
          {`curl -H 'Authorization: Bearer dev-token' http://localhost:8080/v1/discover \\`}<br />
          {`  -d '{"envelope":{"aimp_version":"1.0","job_id":"test-01"}}'`}
        </div>
      </div>
    </div>
  )
}
