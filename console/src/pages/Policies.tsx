import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, Plus } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { listPolicies, createPolicy } from '@/lib/dataLayer'
import { PageHeader, Empty, SimpleModal } from '@/components/shared'
import { useToastStore } from '@/store/toast'
import { resolvePrincipal } from '@/lib/dataLayer'

const ACTION_STYLE: Record<string, string> = {
  ALLOW: 'bg-emerald-950 text-emerald-300', DENY: 'bg-red-950 text-[var(--c-red)]',
  REQUIRE_APPROVAL: 'bg-amber-950 text-amber-300', REQUIRE_HITL: 'bg-amber-950 text-amber-300',
}
const DEFAULT_YAML = `id: new-policy
enabled: true
description: "Describe what this policy does"
when:
  risk_tier: routine
decision: ALLOW`

export default function Policies() {
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const [showCreate, setShowCreate] = useState(false)
  const [yaml, setYaml] = useState(DEFAULT_YAML)

  const { data: policies = [], isLoading } = useQuery({ queryKey: ['policies', m], queryFn: listPolicies })

  const createMut = useMutation({
    mutationFn: () => createPolicy(yaml),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['policies'] })
      addToast(t.policies.saved, 'success')
      setShowCreate(false)
      setYaml(DEFAULT_YAML)
      if (res?.policy_id) navigate(`/policies/${res.policy_id}`)
    },
    onError: (e: Error) => addToast(`${t.policies.saveFailed}: ${e.message}`, 'error'),
  })

  const extractAction = (rulesYaml: string) => {
    const m = rulesYaml.match(/decision:\s*(\w+)/i); return m ? m[1].toUpperCase() : ''
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader title={t.policies.title} sub={t.policies.priorityHint}
        right={<button className="btn btn-primary text-xs" onClick={() => setShowCreate(true)}><Plus className="w-3.5 h-3.5" />{t.policies.newPolicy}</button>} />

      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full" style={{ minWidth: 560 }}>
          <thead><tr>
            {[t.policies.name, t.common.enabled, t.policies.matchesToday, t.policies.action, t.policies.updatedBy].map(h => <th key={h} className="table-th">{h}</th>)}
          </tr></thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="table-td text-center text-[var(--c-dim)] text-xs py-6">{t.common.loading}</td></tr>}
            {(policies as any[]).map(p => {
              const action = extractAction(p.rules_yaml ?? '')
              return (
                <tr key={p.policy_id} className="table-row cursor-pointer" onClick={() => navigate(`/policies/${p.policy_id}`)}>
                  <td className="table-td">
                    <p className="text-xs font-medium text-[var(--c-text)]">{p.name}</p>
                  </td>
                  <td className="table-td">{p.enabled ? <CheckCircle className="w-4 h-4 text-[var(--c-green)]" /> : <XCircle className="w-4 h-4 text-[var(--c-dim)]" />}</td>
                  <td className="table-td mono text-xs text-[var(--c-text)]">{p.matches_today ?? 0}</td>
                  <td className="table-td"><span className={clsx('badge', ACTION_STYLE[action] ?? 'bg-[var(--c-surface)] text-[var(--c-dim)]')}>{action || '—'}</span></td>
                  <td className="table-td text-xs text-[var(--c-dim)]">{p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'} {p.updated_by ? `by ${resolvePrincipal(p.updated_by).display_name}` : ''}</td>
                </tr>
              )
            })}
            {!isLoading && (policies as any[]).length === 0 && <tr><td colSpan={5} className="table-td text-center text-[var(--c-dim)] text-xs py-6">{t.policies.noPolicies}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Create Policy Modal */}
      <SimpleModal open={showCreate} onClose={() => setShowCreate(false)} title={t.policies.createTitle}
        footer={<>
          <button className="btn btn-ghost flex-1 justify-center" onClick={() => setShowCreate(false)}>{t.common.cancel}</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? '…' : t.common.create}
          </button>
        </>}>
        <div className="space-y-3">
          <p className="text-xs text-[var(--c-dim)]">{t.policies.dryRunHint}</p>
          <div>
            <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.policies.policyYaml}</label>
            <textarea className="input mono text-xs" rows={12} value={yaml} onChange={e => setYaml(e.target.value)} style={{ resize: 'vertical' }} />
          </div>
        </div>
      </SimpleModal>
    </div>
  )
}
