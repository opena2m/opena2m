import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { DollarSign, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { listBudgets, createBudget } from '@/lib/dataLayer'
import { BudgetMeter, PageHeader, Empty, pct, SimpleModal } from '@/components/shared'
import { useToastStore } from '@/store/toast'
import { resolvePrincipal } from '@/lib/dataLayer'

export default function Budgets() {
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ principal_id: '', ceiling_amount: '', window_kind: 'daily', warn_at_percent: '80', hard_deny: true })

  const { data: budgets = [], isLoading } = useQuery({ queryKey: ['budgets', m], queryFn: listBudgets })

  const createMut = useMutation({
    mutationFn: () => createBudget(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      addToast(t.budgets.created, 'success')
      setShowCreate(false)
      setForm({ principal_id: '', ceiling_amount: '', window_kind: 'daily', warn_at_percent: '80', hard_deny: true })
    },
    onError: (e: Error) => addToast(`${t.budgets.createFailed}: ${e.message}`, 'error'),
  })

  const fld = (k: string, label: string, rest?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div key={k}>
      <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{label}</label>
      <input className="input" value={(form as any)[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} {...rest} />
    </div>
  )

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader title={t.budgets.title}
        right={<button className="btn btn-primary text-xs" onClick={() => setShowCreate(true)}><Plus className="w-3.5 h-3.5" />{t.budgets.newBudget}</button>} />

      {isLoading && <p className="text-[var(--c-dim)] text-sm">{t.common.loading}</p>}
      {!isLoading && (budgets as any[]).length === 0 && <Empty icon="⊕" title={t.budgets.noBudgets} />}

      <div className="space-y-3">
        {(budgets as any[]).map(b => {
          const principal = resolvePrincipal(b.principal_id)
          return (
            <div key={b.budget_id} className={clsx('card cursor-pointer hover:border-[var(--c-accent)] transition-colors', b.utilization > 0.9 && 'border-red-900/50')}
              onClick={() => navigate(`/budgets/${b.budget_id}`)}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-[var(--c-dim)]" />
                    {principal.display_name}
                  </p>
                  <p className="text-xs text-[var(--c-dim)] mt-0.5">{b.window_kind} · {b.scope_domain_id ?? t.budgets.all + ' domains'}</p>
                </div>
                <div className="text-right">
                  <p className={clsx('text-lg font-bold mono', b.utilization > 0.9 ? 'text-[var(--c-red)]' : b.utilization > 0.8 ? 'text-[var(--c-amber)]' : 'text-[var(--c-green)]')}>{pct(b.utilization)}</p>
                  {b.hard_deny && <span className="badge bg-red-950 text-red-300 text-[9px]">{t.budgets.hardDeny}</span>}
                </div>
              </div>
              <BudgetMeter consumed={b.consumed} ceiling={b.ceiling_amount} currency={b.ceiling_currency} />
              <div className="flex justify-between text-[10px] text-[var(--c-dim)] mt-2">
                <span>{t.budgets.resets}: {new Date(b.window_resets_at).toLocaleDateString()}</span>
                <span>{t.budgets.warnAt} {b.warn_at_percent}%</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Create Budget Modal */}
      <SimpleModal open={showCreate} onClose={() => setShowCreate(false)} title={t.budgets.createTitle}
        footer={<>
          <button className="btn btn-ghost flex-1 justify-center" onClick={() => setShowCreate(false)}>{t.common.cancel}</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? '…' : t.common.create}
          </button>
        </>}>
        <div className="space-y-3">
          {fld('principal_id', t.budgets.principal, { placeholder: t.budgets.principalPlaceholder })}
          {fld('ceiling_amount', t.budgets.ceilingLabel, { type: 'number', min: '0', step: '1' })}
          <div>
            <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.budgets.windowLabel}</label>
            <select className="input" value={form.window_kind} onChange={e => setForm(f => ({ ...f, window_kind: e.target.value }))}>
              {['daily','weekly','monthly','total'].map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          {fld('warn_at_percent', t.budgets.warnLabel, { type: 'number', min: '0', max: '100' })}
          <div className="flex items-center gap-3">
            <input type="checkbox" id="hd" checked={form.hard_deny} onChange={e => setForm(f => ({ ...f, hard_deny: e.target.checked }))} className="w-4 h-4" />
            <label htmlFor="hd" className="text-xs text-[var(--c-text)]">{t.budgets.hardDenyLabel}</label>
          </div>
        </div>
      </SimpleModal>
    </div>
  )
}
