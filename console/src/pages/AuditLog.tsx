import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, ShieldCheck, ShieldX, Download } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { listAudit, verifyChain } from '@/lib/dataLayer'
import { PageHeader, Drawer } from '@/components/shared'
import { resolvePrincipal } from '@/lib/dataLayer'

const ACTION_ICON: Record<string, string> = {
  'job.state_transition': '⇄',
  'job.execute': '▶',
  'job.abort': '■',
  'job.resume.continue': '▶',
  'job.resume.abort': '■',
  'vision.check_completed': '👁',
  'policy.update': '⊟',
  'budget.created': '⊕',
  'key.rotation': '🔑',
}

export default function AuditLog() {
  const t = useT(); const m = useSettingsStore(s => s.mode)
  const [jobId, setJobId] = useState('')
  const [action, setAction] = useState('')
  const [timeRange, setTimeRange] = useState('7d')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<any>(null)
  const [selected, setSelected] = useState<any>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['audit', jobId, action, m],
    queryFn: () => listAudit({ job_id: jobId || undefined, action: action || undefined, page_size: 60 }),
    refetchInterval: 12000,
  })
  const entries = (data as any)?.entries ?? []

  const handleVerify = async () => {
    setVerifying(true)
    try { setVerifyResult(await verifyChain(jobId || undefined)) }
    finally { setVerifying(false) }
  }

  const openEntry = (entry: any) => { setSelected(entry); setDrawerOpen(true) }

  const handleExport = () => {
    const lines = entries.map((e: any) => JSON.stringify(e)).join('\n')
    const blob = new Blob([lines], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `audit-${Date.now()}.jsonl`; a.click()
    URL.revokeObjectURL(url)
  }

  const ACTIONS = ['', 'job.state_transition', 'job.execute', 'job.abort', 'job.resume.continue', 'job.resume.abort', 'vision.check_completed', 'policy.update', 'budget.created', 'key.rotation']

  return (
    <div className="space-y-4 max-w-6xl">
      <PageHeader title={t.audit.title}
        right={
          <div className="flex gap-2">
            <button onClick={handleVerify} disabled={verifying} className="btn btn-ghost text-xs">
              <ScrollText className="w-3.5 h-3.5" />{verifying ? t.audit.verifying : t.common.verify}
            </button>
            <button onClick={handleExport} className="btn btn-ghost text-xs">
              <Download className="w-3.5 h-3.5" />Export signed (.jsonl)
            </button>
          </div>
        }
      />

      {/* Chain verify banner */}
      {verifyResult && (
        <div className={clsx('rounded-xl border p-4 flex items-center gap-3', verifyResult.chain_valid ? 'border-emerald-800/50 bg-emerald-950/30' : 'border-red-800/50 bg-red-950/30')}>
          {verifyResult.chain_valid ? <ShieldCheck className="w-5 h-5 text-[var(--c-green)]" /> : <ShieldX className="w-5 h-5 text-[var(--c-red)]" />}
          <div>
            <p className={clsx('text-sm font-medium', verifyResult.chain_valid ? 'text-[var(--c-green)]' : 'text-[var(--c-red)]')}>
              {verifyResult.chain_valid ? t.audit.chainValid : t.audit.chainInvalid}
            </p>
            <p className="text-xs text-[var(--c-dim)]">{verifyResult.entry_count} {t.audit.entriesChecked}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select className="input w-28" value={timeRange} onChange={e => setTimeRange(e.target.value)}>
          {['1h','6h','24h','7d','30d'].map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <input className="input flex-1 min-w-[160px]" placeholder={t.audit.filterJob} value={jobId} onChange={e => setJobId(e.target.value)} />
        <select className="input w-52" value={action} onChange={e => setAction(e.target.value)}>
          {ACTIONS.map(a => <option key={a} value={a}>{a || t.audit.allActions}</option>)}
        </select>
      </div>

      {isLoading && <p className="text-[var(--c-dim)] text-sm">{t.common.loading}</p>}

      {/* Table */}
      <div className="card p-0 overflow-hidden overflow-x-auto">
        <table className="w-full" style={{ minWidth: 680 }}>
          <thead><tr>
            {[t.audit.when, t.audit.principal, t.audit.action, t.audit.target].map(h => <th key={h} className="table-th">{h}</th>)}
          </tr></thead>
          <tbody>
            {entries.length === 0 && !isLoading && (
              <tr><td colSpan={4} className="table-td text-center text-[var(--c-dim)] text-xs py-8">{t.audit.noEntries}</td></tr>
            )}
            {entries.map((entry: any) => {
              const principal = resolvePrincipal(entry.principal_id)
              return (
                <tr key={entry.id} className="table-row cursor-pointer" onClick={() => openEntry(entry)}>
                  <td className="table-td">
                    <p className="text-[11px] text-[var(--c-text)]">{new Date(entry.at).toLocaleString()}</p>
                    <p className="mono text-[9px] text-[var(--c-dim)] mt-0.5">#{entry.id}</p>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{principal.kind === 'human' ? '👤' : principal.kind === 'agent' ? '🤖' : '⚙'}</span>
                      <span className="mono text-[11px] text-[var(--c-text)]">{principal.display_name}</span>
                    </div>
                  </td>
                  <td className="table-td">
                    <span className="flex items-center gap-1.5 mono text-xs text-[var(--c-text)]">
                      <span>{ACTION_ICON[entry.action] ?? '·'}</span>
                      {entry.action}
                    </span>
                  </td>
                  <td className="table-td">
                    <p className="text-[11px] text-[var(--c-dim)]">{entry.target_kind}</p>
                    <p className="mono text-[10px] text-[var(--c-accent)]">{entry.target_id}</p>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Drawer: audit entry detail */}
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Audit Entry" width="420px">
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['ID', String(selected.id)],
                [t.audit.action, selected.action],
                ['Target kind', selected.target_kind],
                ['Target ID', selected.target_id],
                [t.audit.principal, resolvePrincipal(selected.principal_id).display_name],
                ['At', new Date(selected.at).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="bg-[var(--c-surface)] rounded-lg p-2.5">
                  <p className="text-[9px] text-[var(--c-dim)] uppercase tracking-wider mb-0.5">{k}</p>
                  <p className="text-[11px] text-[var(--c-text)] mono break-all">{v}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider mb-1">Details</p>
              <pre className="text-[10px] text-[var(--c-dim)] mono bg-[var(--c-surface)] rounded-lg p-3 overflow-x-auto">{JSON.stringify(selected.details_json, null, 2)}</pre>
            </div>
            <div>
              <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider mb-1">Prev hash</p>
              <p className="mono text-[10px] text-[var(--c-dim)] break-all">{selected.prev_hash}</p>
            </div>
            <div>
              <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider mb-1">Signature</p>
              <p className="mono text-[10px] text-[var(--c-dim)] break-all">{selected.signature}</p>
            </div>
            <div className="flex items-center gap-2 p-3 bg-emerald-950/30 border border-emerald-900/40 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-[var(--c-green)]" />
              <p className="text-xs text-[var(--c-green)] font-medium">Signature valid (mock)</p>
            </div>
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(selected, null, 2))} className="btn btn-ghost text-xs w-full justify-center">
              Copy as JSON
            </button>
          </div>
        )}
      </Drawer>
    </div>
  )
}
