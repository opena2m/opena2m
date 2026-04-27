import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Globe, Activity, Key, Webhook, Users, Settings as SettingsIcon, Lock } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { getCapabilities, listWebhooks, listSigningKeys, listUsers, createWebhook, deleteWebhook, createUser } from '@/lib/dataLayer'
import { ModeSwitcher, LangSwitcher, ApprovalConfirmModal, SimpleModal } from '@/components/shared'
import { useToastStore } from '@/store/toast'
import type { Lang } from '@/i18n'
import { translations } from '@/i18n'

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-[var(--c-border)]">
        <Icon className="w-4 h-4 text-[var(--c-dim)]" />
        <h2 className="font-semibold text-sm text-[var(--c-text)]">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const t = useT(); const { lang, setLang, mode } = useSettingsStore()
  const m = mode
  const qc = useQueryClient()
  const addToast = useToastStore(s => s.addToast)
  const [activeTab, setActiveTab] = useState('general')

  // Webhook modal
  const [showWebhook, setShowWebhook] = useState(false)
  const [whForm, setWhForm] = useState({ url: '', events: 'job.state_transition,job.completed' })

  // Rotate key confirm
  const [showRotate, setShowRotate] = useState(false)

  // Invite user modal
  const [showInvite, setShowInvite] = useState(false)
  const [invForm, setInvForm] = useState({ kind: 'agent', display_name: '', external_id: '' })

  const { data: caps } = useQuery({ queryKey: ['caps', m], queryFn: getCapabilities })
  const { data: webhooks = [] } = useQuery({ queryKey: ['webhooks', m], queryFn: listWebhooks })
  const { data: keys = [] } = useQuery({ queryKey: ['keys', m], queryFn: listSigningKeys })
  const { data: users = [] } = useQuery({ queryKey: ['users', m], queryFn: listUsers })

  const createWebhookMut = useMutation({
    mutationFn: () => createWebhook({ url: whForm.url, events_json: whForm.events.split(',').map(e => e.trim()) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); addToast(t.settings.webhookCreated, 'success'); setShowWebhook(false); setWhForm({ url: '', events: 'job.state_transition,job.completed' }) },
    onError: (e: Error) => addToast(`${t.settings.webhookFailed}: ${e.message}`, 'error'),
  })

  const deleteWebhookMut = useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); addToast('Webhook removed.', 'success') },
  })

  const rotateMut = useMutation({
    mutationFn: () => Promise.resolve({ rotated: true }),  // gateway endpoint stub
    onSuccess: () => { addToast(t.settings.rotateSuccess, 'success'); setShowRotate(false) },
    onError: (e: Error) => { addToast(`${t.settings.rotateFailed}: ${e.message}`, 'error'); setShowRotate(false) },
  })

  const inviteMut = useMutation({
    mutationFn: () => createUser(invForm),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); addToast(t.settings.inviteSuccess, 'success'); setShowInvite(false); setInvForm({ kind: 'agent', display_name: '', external_id: '' }) },
    onError: (e: Error) => addToast(`${t.settings.inviteFailed}: ${e.message}`, 'error'),
  })

  const TABS = [
    { id: 'general', label: t.settings.tabGeneral, icon: SettingsIcon },
    { id: 'auth',    label: t.settings.tabAuth,    icon: Lock },
    { id: 'webhooks',label: t.settings.tabWebhooks,icon: Webhook },
    { id: 'keys',    label: t.settings.tabKeys,    icon: Key },
    { id: 'users',   label: t.settings.tabUsers,   icon: Users },
  ]

  return (
    <div className="max-w-4xl space-y-5">
      <h1 className="section-title">{t.settings.title}</h1>
      <div className="border-b border-[var(--c-border)] flex gap-0 overflow-x-auto">
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setActiveTab(tb.id)}
            className={clsx('tab flex items-center gap-2', activeTab === tb.id && 'active')}>
            <tb.icon className="w-3.5 h-3.5" />{tb.label}
          </button>
        ))}
      </div>

      {/* ── General ── */}
      {activeTab === 'general' && (
        <div className="space-y-4">
          <Section icon={Globe} title={t.settings.language}>
            <div className="flex gap-2 flex-wrap items-center">
              {(Object.keys(translations) as Lang[]).map(l => (
                <button key={l} onClick={() => setLang(l)} className={clsx('btn', lang === l ? 'btn-primary' : 'btn-ghost')}>
                  {translations[l].lang[l]}
                </button>
              ))}
            </div>
          </Section>
          <Section icon={Activity} title={t.settings.dataSource}>
            <div className="flex items-center gap-4">
              <ModeSwitcher />
              <p className="text-xs text-[var(--c-dim)] flex-1">{t.settings.mockModeDesc}</p>
            </div>
          </Section>
          <Section icon={Activity} title={t.settings.gateway}>
            {caps ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[['AIMP Version', caps.aimp_version], [t.settings.spec, caps.conformance_level], [t.settings.version, '0.1.0'], ['Mode', m]].map(([k, v]) => (
                    <div key={k} className="bg-[var(--c-surface)] rounded-lg p-3">
                      <p className="text-[10px] text-[var(--c-dim)] mb-1">{k}</p>
                      <p className="text-xs text-[var(--c-text)] mono">{v}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-[10px] text-[var(--c-dim)] mb-2">{t.settings.features}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(caps.features ?? []).map((f: string) => <span key={f} className="mono text-[10px] bg-[var(--c-surface)] text-[var(--c-dim)] px-2 py-0.5 rounded border border-[var(--c-border)]">{f}</span>)}
                  </div>
                </div>
              </div>
            ) : <p className="text-xs text-[var(--c-dim)]">{t.common.loading}</p>}
          </Section>
        </div>
      )}

      {/* ── Auth ── */}
      {activeTab === 'auth' && (
        <Section icon={Lock} title={t.settings.apiAccess}>
          <p className="text-xs text-[var(--c-dim)]">{t.settings.oidcDesc}</p>
          <div className="space-y-2">
            {[[t.settings.oidcIssuer, 'https://auth.example.com'], [t.settings.clientId, 'opena2m-console'], [t.settings.tokenTtl, '60 min'], [t.settings.sessionTimeout, '8 h']].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2 border-b border-[var(--c-border-dim)] last:border-0">
                <span className="text-xs text-[var(--c-dim)]">{k}</span>
                <span className="mono text-xs text-[var(--c-text)]">{v}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--c-dim)]">{t.settings.apiKeyHint} <code className="text-[var(--c-accent)] mono">dev-token</code>.</p>
          <div className="bg-[var(--c-surface)] rounded-lg p-4 mono text-[10px] text-[var(--c-dim)] overflow-x-auto leading-relaxed">
            <span className="text-[var(--c-dim)]">$</span> <span className="text-[var(--c-accent)]">curl</span> {'-H'} <span className="text-[var(--c-green)]">'Authorization: Bearer dev-token'</span> \<br />
            &nbsp;&nbsp;-X POST http://localhost:8080/v1/discover
          </div>
        </Section>
      )}

      {/* ── Webhooks ── */}
      {activeTab === 'webhooks' && (
        <Section icon={Webhook} title={t.settings.webhooks}>
          {(webhooks as any[]).length === 0 && <p className="text-xs text-[var(--c-dim)]">{t.settings.noWebhooks}</p>}
          <div className="space-y-2">
            {(webhooks as any[]).map((ep: any) => (
              <div key={ep.endpoint_id} className={clsx('flex items-start gap-3 py-3 border-b border-[var(--c-border-dim)] last:border-0', ep.disabled_at && 'opacity-50')}>
                <span className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', ep.disabled_at ? 'bg-[var(--c-dim)]' : 'bg-[var(--c-green)]')} />
                <div className="flex-1 min-w-0">
                  <p className="mono text-xs text-[var(--c-text)] truncate">{ep.url}</p>
                  <p className="text-[10px] text-[var(--c-dim)] mt-0.5">{ep.events_json?.join(', ')}</p>
                  <p className="text-[10px] text-[var(--c-dim)]">{t.settings.today}: {ep.deliveries_today} sent, {ep.failures_today} failed</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button className="btn btn-ghost text-[10px] px-2 py-1" onClick={() => deleteWebhookMut.mutate(ep.endpoint_id)}>{t.common.remove}</button>
                </div>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost text-xs" onClick={() => setShowWebhook(true)}>{t.settings.addWebhook}</button>
        </Section>
      )}

      {/* ── Keys ── */}
      {activeTab === 'keys' && (
        <Section icon={Key} title={t.settings.signingKeys}>
          <p className="text-xs text-[var(--c-dim)]">{t.settings.signingKeysDesc}</p>
          <div className="space-y-3">
            {(keys as any[]).map(key => (
              <div key={key.key_id} className="bg-[var(--c-surface)] rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={clsx('badge', key.status === 'active' ? 'bg-emerald-950 text-emerald-300' : 'bg-[var(--c-surface)] text-[var(--c-dim)]')}>{key.status}</span>
                  <span className="text-[10px] text-[var(--c-dim)]">{key.created_at ? new Date(key.created_at).toLocaleDateString() : '—'}</span>
                </div>
                <p className="mono text-[10px] text-[var(--c-dim)] break-all">{key.fingerprint}</p>
                <p className="text-[10px] text-[var(--c-dim)]">Purpose: {key.purpose}</p>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost text-xs" onClick={() => setShowRotate(true)}>{t.settings.rotateKey}</button>
        </Section>
      )}

      {/* ── Users ── */}
      {activeTab === 'users' && (
        <Section icon={Users} title={t.settings.tabUsers}>
          <div className="card p-0 overflow-hidden overflow-x-auto">
            <table className="w-full">
              <thead><tr>{['Principal', 'Kind', 'Role', 'Last active'].map(h => <th key={h} className="table-th">{h}</th>)}</tr></thead>
              <tbody>
                {(users as any[]).map(u => (
                  <tr key={u.principal_id} className="table-row">
                    <td className="table-td">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{u.kind === 'human' ? '👤' : u.kind === 'agent' ? '🤖' : '⚙'}</span>
                        <span className="text-xs text-[var(--c-text)]">{u.display_name}</span>
                      </div>
                    </td>
                    <td className="table-td"><span className="badge bg-[var(--c-surface)] text-[var(--c-dim)]">{u.kind}</span></td>
                    <td className="table-td text-xs text-[var(--c-text)]">{u.role ?? '—'}</td>
                    <td className="table-td text-xs text-[var(--c-dim)]">{u.last_active ? new Date(u.last_active).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-ghost text-xs" onClick={() => setShowInvite(true)}>{t.settings.inviteUser}</button>
        </Section>
      )}

      {/* ── Modals ── */}
      <SimpleModal open={showWebhook} onClose={() => setShowWebhook(false)} title={t.settings.addWebhook.replace('+ ', '')}
        footer={<>
          <button className="btn btn-ghost flex-1 justify-center" onClick={() => setShowWebhook(false)}>{t.common.cancel}</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={() => createWebhookMut.mutate()} disabled={!whForm.url || createWebhookMut.isPending}>
            {createWebhookMut.isPending ? '…' : t.common.add}
          </button>
        </>}>
        <div className="space-y-3">
          <div><label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.settings.webhookUrl}</label>
            <input className="input" placeholder="https://hooks.example.com/aimp" value={whForm.url} onChange={e => setWhForm(f => ({ ...f, url: e.target.value }))} /></div>
          <div><label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.settings.webhookEvents}</label>
            <input className="input" value={whForm.events} onChange={e => setWhForm(f => ({ ...f, events: e.target.value }))} /></div>
        </div>
      </SimpleModal>

      {showRotate && (
        <ApprovalConfirmModal title={t.settings.rotateConfirmTitle} action="key.rotation"
          details={{ reason: t.settings.rotateConfirmDesc, current_key: (keys as any[])[0]?.fingerprint ?? '—' }}
          principal="human://alice@fab" danger
          onConfirm={() => rotateMut.mutate()} onCancel={() => setShowRotate(false)} loading={rotateMut.isPending} />
      )}

      <SimpleModal open={showInvite} onClose={() => setShowInvite(false)} title={t.settings.inviteTitle}
        footer={<>
          <button className="btn btn-ghost flex-1 justify-center" onClick={() => setShowInvite(false)}>{t.common.cancel}</button>
          <button className="btn btn-primary flex-1 justify-center" onClick={() => inviteMut.mutate()} disabled={!invForm.display_name || inviteMut.isPending}>
            {inviteMut.isPending ? '…' : t.common.create}
          </button>
        </>}>
        <div className="space-y-3">
          <div><label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.settings.inviteKind}</label>
            <select className="input" value={invForm.kind} onChange={e => setInvForm(f => ({ ...f, kind: e.target.value }))}>
              {['agent', 'human', 'system'].map(k => <option key={k} value={k}>{k}</option>)}
            </select></div>
          <div><label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.settings.inviteName}</label>
            <input className="input" value={invForm.display_name} onChange={e => setInvForm(f => ({ ...f, display_name: e.target.value }))} /></div>
          <div><label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.settings.inviteExtId}</label>
            <input className="input" placeholder="agent://my-org/my-agent" value={invForm.external_id} onChange={e => setInvForm(f => ({ ...f, external_id: e.target.value }))} /></div>
        </div>
      </SimpleModal>
    </div>
  )
}
