import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { getPolicy, dryRunPolicy, updatePolicy } from '@/lib/dataLayer'
import { PolicyTraceTree, ApprovalConfirmModal } from '@/components/shared'
import { useToastStore } from '@/store/toast'
import { resolvePrincipal } from '@/lib/dataLayer'

export default function PolicyDetail() {
  const { policyId } = useParams<{ policyId: string }>()
  const navigate = useNavigate()
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const [yaml, setYaml] = useState('')
  const [dirty, setDirty] = useState(false)
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const [drForm, setDrForm] = useState({ domain: 'manufacturing.additive.fdm.v1', device_id: 'fdm-sim-1', risk_tier: 'restricted', principal_kind: 'agent', estimated_amount: '' })
  const [drResult, setDrResult] = useState<any>(null)
  const [running, setRunning] = useState(false)

  const { data: policy, isLoading } = useQuery({ queryKey: ['policy', policyId, m], queryFn: () => getPolicy(policyId!), enabled: !!policyId })

  useEffect(() => {
    if (policy && !dirty) { setYaml((policy as any).rules_yaml ?? '') }
  }, [policy, dirty])

  const saveMut = useMutation({
    mutationFn: () => updatePolicy(policyId!, yaml),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policy', policyId] })
      qc.invalidateQueries({ queryKey: ['policies'] })
      addToast(t.policies.saved, 'success')
      setDirty(false); setShowSaveConfirm(false)
    },
    onError: (e: Error) => { addToast(`${t.policies.saveFailed}: ${e.message}`, 'error'); setShowSaveConfirm(false) },
  })

  const handleDryRun = async () => {
    setRunning(true); setDrResult(null)
    try { setDrResult(await dryRunPolicy({ ...drForm, estimated_amount: drForm.estimated_amount ? Number(drForm.estimated_amount) : undefined })) }
    finally { setRunning(false) }
  }

  const p = policy as any
  if (isLoading) return <div className="text-[var(--c-dim)] py-20 text-center">{t.common.loading}</div>
  if (!p) return <div className="text-[var(--c-red)] py-20 text-center">{t.policies.policyNotFound}</div>

  const ACTION_COLOR: Record<string, string> = { ALLOW: 'bg-emerald-950 text-emerald-300', DENY: 'bg-red-950 text-[var(--c-red)]', REQUIRE_APPROVAL: 'bg-amber-950 text-amber-300' }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/policies')} className="btn btn-ghost p-1.5"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <h1 className="section-title">{p.name}</h1>
          <p className="text-xs text-[var(--c-dim)]">v{p.version ?? 1} · {p.updated_by ? `Updated by ${resolvePrincipal(p.updated_by).display_name}` : ''}</p>
        </div>
        <span className={clsx('badge', p.enabled ? 'bg-emerald-950 text-emerald-300' : 'bg-[var(--c-surface)] text-[var(--c-dim)]')}>{p.enabled ? t.common.enabled : t.common.disabled}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* YAML Editor */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--c-text)]">{t.policies.policyYaml}</p>
            {dirty && <span className="text-[10px] text-amber-400">Unsaved changes</span>}
          </div>
          <textarea className="input mono text-xs" rows={14} value={yaml}
            onChange={e => { setYaml(e.target.value); setDirty(true) }} style={{ resize: 'vertical' }} />
          <div className="flex gap-2">
            <button className="btn btn-primary text-xs" onClick={() => setShowSaveConfirm(true)} disabled={!dirty || saveMut.isPending}>
              {saveMut.isPending ? '…' : t.policies.savePolicy}
            </button>
            <button className="btn btn-ghost text-xs" disabled={!dirty} onClick={() => { setYaml(p.rules_yaml ?? ''); setDirty(false) }}>
              {t.policies.discardChanges}
            </button>
          </div>
        </div>

        {/* Dry-run */}
        <div className="card space-y-4">
          <p className="text-xs font-semibold text-[var(--c-text)]">{t.policies.dryRunTitle}</p>
          <p className="text-[11px] text-[var(--c-dim)]">{t.policies.dryRunHint}</p>
          <div className="grid grid-cols-2 gap-2">
            {([['domain', 'Domain'], ['device_id', 'Device ID'], ['risk_tier', 'Risk tier'], ['principal_kind', 'Principal kind'], ['estimated_amount', 'Amount (USD)']] as [string, string][]).map(([k, label]) => (
              <div key={k}>
                <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{label}</label>
                <input className="input text-xs" value={(drForm as any)[k]} onChange={e => setDrForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
          </div>
          <button className="btn btn-ghost text-xs w-full justify-center" onClick={handleDryRun} disabled={running}>
            {running ? t.policies.evaluating : t.policies.runSimulation}
          </button>
          {drResult && (
            <div className="space-y-3">
              <div className={clsx('flex items-center gap-2 p-3 rounded-lg border', drResult.action === 'ALLOW' ? 'border-emerald-900/50 bg-emerald-950/30' : drResult.action === 'DENY' ? 'border-red-900/50 bg-red-950/30' : 'border-amber-900/50 bg-amber-950/30')}>
                <span className={clsx('badge text-[10px]', ACTION_COLOR[drResult.action] ?? 'bg-[var(--c-surface)]')}>{drResult.action}</span>
                <p className="text-xs text-[var(--c-text)]">{drResult.reason}</p>
              </div>
              {drResult.trace && <PolicyTraceTree steps={drResult.trace} />}
            </div>
          )}
        </div>
      </div>

      {/* Save confirm */}
      {showSaveConfirm && (
        <ApprovalConfirmModal title={t.policies.editTitle}
          action="policy.update"
          details={{ policy_id: policyId, version: (p.version ?? 0) + 1, yaml_preview: yaml.slice(0, 200) + '…' }}
          principal="human://bob@fab"
          onConfirm={() => saveMut.mutate()}
          onCancel={() => setShowSaveConfirm(false)}
          loading={saveMut.isPending} />
      )}
    </div>
  )
}
