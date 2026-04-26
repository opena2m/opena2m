import { useQuery } from '@tanstack/react-query'
import { FileText, CheckCircle, XCircle } from 'lucide-react'
import { gw } from '@/lib/api'

function actionColor(action: string) {
  if (action === 'allow') return 'bg-emerald-900 text-emerald-300'
  if (action === 'deny') return 'bg-red-900 text-red-300'
  if (action === 'require_hitl' || action === 'require_approval') return 'bg-amber-900 text-amber-300'
  return 'bg-surface-600 text-slate-300'
}

export default function Policies() {
  const { data: policies = [], isLoading } = useQuery({ queryKey: ['policies'], queryFn: () => gw.listPolicies() })

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Policies</h1>
        <span className="text-xs text-slate-500">Priority order: lower = higher priority</span>
      </div>
      {isLoading && <p className="text-slate-400">Loading…</p>}
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-surface-600">
            <tr>
              {['Priority', 'Name', 'Conditions', 'Action', 'Enabled'].map(h => (
                <th key={h} className="table-header px-4 py-3 text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            {policies.map(p => (
              <tr key={p.policy_id} className="hover:bg-surface-700/40">
                <td className="px-4 py-3 font-mono text-slate-400 text-xs">{p.priority}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-200">{p.name}</p>
                  {p.description && <p className="text-xs text-slate-500">{p.description}</p>}
                </td>
                <td className="px-4 py-3">
                  <pre className="text-xs text-slate-400 font-mono">
                    {JSON.stringify(p.rule.conditions, null, 1)}
                  </pre>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${actionColor(p.rule.action)}`}>{p.rule.action}</span>
                </td>
                <td className="px-4 py-3">
                  {p.enabled
                    ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                    : <XCircle className="w-4 h-4 text-slate-600" />}
                </td>
              </tr>
            ))}
            {!isLoading && policies.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-500">No policies.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
