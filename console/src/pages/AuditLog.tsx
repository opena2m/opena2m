import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText, ShieldCheck, ShieldX } from 'lucide-react'
import { gw } from '@/lib/api'

export default function AuditLog() {
  const [jobId, setJobId] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<{ chain_valid: boolean; entry_count: number } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['audit', jobId],
    queryFn: () => gw.listAudit({ job_id: jobId || undefined, page_size: 50 }),
    refetchInterval: 10000,
  })
  const entries = data?.entries ?? []

  const handleVerify = async () => {
    setVerifying(true)
    try {
      const result = await gw.verifyChain(jobId || undefined)
      setVerifyResult(result)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ScrollText className="w-5 h-5 text-slate-400" />
          <h1 className="text-xl font-bold text-white">Audit Log</h1>
        </div>
        <button onClick={handleVerify} disabled={verifying}
          className="btn-ghost flex items-center gap-2 text-sm">
          {verifying ? 'Verifying…' : 'Verify Chain'}
        </button>
      </div>

      {verifyResult && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${verifyResult.chain_valid ? 'border-emerald-700 bg-emerald-900/20' : 'border-red-700 bg-red-900/20'}`}>
          {verifyResult.chain_valid
            ? <ShieldCheck className="w-5 h-5 text-emerald-400" />
            : <ShieldX className="w-5 h-5 text-red-400" />}
          <div>
            <p className={`font-medium ${verifyResult.chain_valid ? 'text-emerald-300' : 'text-red-300'}`}>
              {verifyResult.chain_valid ? 'Chain integrity verified' : 'Chain integrity FAILED'}
            </p>
            <p className="text-xs text-slate-400">{verifyResult.entry_count} entries checked</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <input className="input w-64" placeholder="Filter by job ID…"
          value={jobId} onChange={e => setJobId(e.target.value)} />
      </div>

      {isLoading && <p className="text-slate-400">Loading…</p>}

      <div className="space-y-2">
        {entries.map(entry => (
          <div key={entry.id} className="card py-3 flex gap-4">
            <div className="w-32 text-xs text-slate-500 font-mono flex-shrink-0">
              <div>{new Date(entry.at).toLocaleDateString()}</div>
              <div>{new Date(entry.at).toLocaleTimeString()}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-semibold text-slate-200 bg-surface-700 px-2 py-0.5 rounded">
                  {entry.event_type}
                </span>
                {entry.job_id && (
                  <span className="text-xs text-slate-400 font-mono truncate max-w-[200px]">{entry.job_id}</span>
                )}
                {entry.principal_id && (
                  <span className="text-xs text-slate-500">{entry.principal_id}</span>
                )}
              </div>
              {entry.payload && (
                <pre className="text-xs text-slate-400 font-mono overflow-x-auto max-h-32 whitespace-pre-wrap">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              )}
              {entry.entry_hash && (
                <p className="text-xs text-slate-600 font-mono mt-1 truncate">#{entry.entry_hash}</p>
              )}
            </div>
          </div>
        ))}
        {!isLoading && entries.length === 0 && (
          <div className="card text-center py-10 text-slate-500">No audit entries yet.</div>
        )}
      </div>
    </div>
  )
}
