import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { getBudget } from '@/lib/dataLayer'
import { BudgetMeter, StateBadge, PageHeader, pct } from '@/components/shared'
import { resolvePrincipal } from '@/lib/dataLayer'

export default function BudgetDetail() {
  const { budgetId } = useParams<{ budgetId: string }>()
  const navigate = useNavigate()
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const { data, isLoading } = useQuery({ queryKey: ['budget', budgetId, m], queryFn: () => getBudget(budgetId!), enabled: !!budgetId })

  if (isLoading) return <div className="text-[var(--c-dim)] py-20 text-center">{t.common.loading}</div>
  if (!data) return <div className="text-[var(--c-red)] py-20 text-center">{t.budgets.budgetNotFound}</div>

  const b = data as any
  const principal = resolvePrincipal(b.principal_id)

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/budgets')} className="btn btn-ghost p-1.5"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <h1 className="section-title">{principal.display_name} — {b.window_kind} {t.budgets.title.toLowerCase()}</h1>
          <p className="text-xs text-[var(--c-dim)]">{b.ceiling_currency} · {b.scope_domain_id ?? t.budgets.all + ' ' + t.nav.domains.toLowerCase()}</p>
        </div>
        {b.hard_deny && <span className="badge bg-red-950 text-red-300">{t.budgets.hardDeny}</span>}
      </div>

      {/* Meter */}
      <div className="card">
        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-3xl font-bold mono text-[var(--c-text)]">{b.ceiling_currency} {b.consumed.toFixed(2)}</p>
            <p className="text-xs text-[var(--c-dim)]">{t.common.of} {b.ceiling_amount.toFixed(2)} {t.budgets.ceiling.toLowerCase()}</p>
          </div>
          <div className="text-right">
            <p className={clsx('text-xl font-bold mono', b.utilization > 0.9 ? 'text-[var(--c-red)]' : b.utilization > 0.8 ? 'text-[var(--c-amber)]' : 'text-[var(--c-green)]')}>{pct(b.utilization)}</p>
            <p className="text-xs text-[var(--c-dim)]">{t.budgets.utilization}</p>
          </div>
        </div>
        <BudgetMeter consumed={b.consumed} ceiling={b.ceiling_amount} currency={b.ceiling_currency} />
      </div>

      {/* Time-series */}
      <div className="card">
        <p className="text-xs font-semibold text-[var(--c-text)] mb-4">{t.budgets.consumptionHistory}</p>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={(b.history ?? []).map((h: any, i: number) => ({ day: i + 1, amount: h.amount }))}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--c-accent)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--c-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="amount" stroke="var(--c-accent)" fill="url(#grad)" strokeWidth={1.5} dot={false} />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'var(--c-dim)' }} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--c-dim)' }} />
            <Tooltip contentStyle={{ background: 'var(--c-panel)', border: '1px solid var(--c-border)', borderRadius: 6, fontSize: 10 }} formatter={(v: number) => [`$${v.toFixed(2)}`, 'Spend']} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Config */}
      <div className="card">
        <p className="text-xs font-semibold text-[var(--c-text)] mb-3">{t.budgets.configuration}</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            [t.budgets.principal, principal.display_name],
            [t.budgets.window,    b.window_kind],
            [t.budgets.ceiling,   `${b.ceiling_currency} ${b.ceiling_amount}`],
            [t.budgets.warnAt,    `${b.warn_at_percent}%`],
            [t.budgets.hardDeny,  b.hard_deny ? 'Yes' : 'No'],
            [t.budgets.domain,    b.scope_domain_id ?? t.budgets.all],
          ].map(([k, v]) => (
            <div key={k} className="bg-[var(--c-surface)] rounded-lg p-3">
              <p className="text-[10px] text-[var(--c-dim)] mb-1">{k}</p>
              <p className="text-xs text-[var(--c-text)] mono">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contributing jobs */}
      {b.jobs?.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--c-border)]">
            <p className="text-xs font-semibold text-[var(--c-text)]">{t.budgets.contributingJobs}</p>
          </div>
          <table className="w-full">
            <thead><tr>{['Job', t.jobs.state, t.jobs.cost].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
            <tbody>
              {b.jobs.map((j: any) => (
                <tr key={j.job_id} className="table-row">
                  <td className="table-td mono text-[11px] text-[var(--c-accent)]">{j.job_id}</td>
                  <td className="table-td"><StateBadge state={j.state} size="sm" /></td>
                  <td className="table-td mono text-xs">{j.cost_estimate != null ? `$${j.cost_estimate.toFixed(2)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
