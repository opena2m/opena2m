import { useQuery } from '@tanstack/react-query'
import { DollarSign } from 'lucide-react'
import { gw } from '@/lib/api'
import { pct } from '@/lib/utils'

export default function Budgets() {
  const { data: budgets = [], isLoading } = useQuery({ queryKey: ['budgets'], queryFn: () => gw.listBudgets() })

  return (
    <div className="max-w-5xl space-y-5">
      <h1 className="text-xl font-bold text-white">Budgets</h1>
      {isLoading && <p className="text-slate-400">Loading…</p>}
      {budgets.length === 0 && !isLoading && (
        <div className="card text-center py-10 text-slate-500">No budgets configured.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {budgets.map(b => (
          <div key={b.budget_id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-white">{b.name}</span>
              </div>
              <span className={`badge ${b.utilization > 0.9 ? 'bg-red-900 text-red-300' : b.utilization > 0.7 ? 'bg-amber-900 text-amber-300' : 'bg-emerald-900 text-emerald-300'}`}>
                {pct(b.utilization)}
              </span>
            </div>
            <div className="h-3 bg-surface-600 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${b.utilization > 0.9 ? 'bg-red-500' : b.utilization > 0.7 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(b.utilization * 100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-slate-400">
              <span>{b.currency} {b.consumed.toFixed(2)} consumed</span>
              <span>Ceiling: {b.ceiling.toFixed(2)}</span>
            </div>
            {b.period && <p className="text-xs text-slate-500">Period: {b.period}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
