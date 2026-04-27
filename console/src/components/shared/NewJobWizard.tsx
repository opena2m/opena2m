import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Search, DollarSign, Play, ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { useT } from '@/i18n'
import { discoverDevices, quoteJob, executeJob } from '@/lib/dataLayer'
import { useToastStore } from '@/store/toast'
import { RiskBadge, SimpleModal } from '@/components/shared'

interface Props { open: boolean; onClose: () => void }

type Step = 'discover' | 'quote' | 'execute' | 'done'

// Payload schemas per domain (simplified form)
const DOMAIN_FIELDS: Record<string, { key: string; label: string; type: string; default?: string; required?: boolean }[]> = {
  'manufacturing.print.2d.v1': [
    { key: 'asset_url', label: 'Asset URL (PNG/PDF)',   type: 'text', default: 'https://assets.example.com/poster.png', required: true },
    { key: 'paper_size', label: 'Paper size', type: 'select', default: 'A4' },
    { key: 'copies',    label: 'Copies (1–100)',        type: 'number', default: '1' },
    { key: 'color_mode', label: 'Color mode',           type: 'select', default: 'color' },
  ],
  'manufacturing.additive.fdm.v1': [
    { key: 'gcode_url',          label: 'G-code URL',           type: 'text',   default: 'https://assets.example.com/part.gcode', required: true },
    { key: 'material',           label: 'Material',             type: 'select', default: 'PLA' },
    { key: 'layer_height_mm',    label: 'Layer height (mm)',     type: 'number', default: '0.2' },
    { key: 'infill_percent',     label: 'Infill %',             type: 'number', default: '20' },
    { key: 'nozzle_temp_celsius',label: 'Nozzle temp (°C)',      type: 'number', default: '210' },
    { key: 'bed_temp_celsius',   label: 'Bed temp (°C)',         type: 'number', default: '60' },
  ],
}

const SELECT_OPTS: Record<string, string[]> = {
  paper_size: ['A4','A3','A2','A1','Letter','Legal'],
  color_mode: ['color','grayscale','black_and_white'],
  material:   ['PLA','PETG','ABS','TPU','ASA'],
}

const PAUSE_OPTS = ['mid_build_50_percent', 'first_layer_done', 'before_support_removal']

export default function NewJobWizard({ open, onClose }: Props) {
  const t = useT()
  const navigate = useNavigate()
  const addToast = useToastStore(s => s.addToast)

  const [step, setStep] = useState<Step>('discover')
  const [domainFilter, setDomainFilter] = useState('')
  const [discovered, setDiscovered] = useState<any[]>([])
  const [selectedDevice, setSelectedDevice] = useState<any>(null)
  const [selectedDomain, setSelectedDomain] = useState('')
  const [payload, setPayload] = useState<Record<string, string>>({})
  const [budgetLimit, setBudgetLimit] = useState('50')
  const [hitlEnabled, setHitlEnabled] = useState(false)
  const [pauseAt, setPauseAt] = useState<string[]>(['mid_build_50_percent'])
  const [quoteResult, setQuoteResult] = useState<any>(null)
  const [jobId] = useState(() => `J${Date.now().toString(36).toUpperCase()}-CONSOLE`)
  const [finalJobId, setFinalJobId] = useState('')

  const reset = useCallback(() => {
    setStep('discover'); setDiscovered([]); setSelectedDevice(null); setSelectedDomain('')
    setPayload({}); setQuoteResult(null); setFinalJobId('')
  }, [])

  const handleClose = () => { reset(); onClose() }

  // ── Step 1: Discover ─────────────────────────────────────────────────────
  const discoverMut = useMutation({
    mutationFn: () => discoverDevices(domainFilter ? { domains: [domainFilter] } : undefined),
    onSuccess: (data: any) => {
      setDiscovered(data.devices ?? [])
    },
    onError: (e: Error) => addToast(`${t.wizard.discoverFailed}: ${e.message}`, 'error'),
  })

  const handleSelectDevice = (device: any, domain: string) => {
    setSelectedDevice(device); setSelectedDomain(domain)
    // Pre-fill payload defaults
    const fields = DOMAIN_FIELDS[domain] ?? []
    const defaults: Record<string, string> = {}
    fields.forEach(f => { if (f.default) defaults[f.key] = f.default })
    setPayload(defaults)
    setStep('quote')
  }

  // ── Step 2: Quote ─────────────────────────────────────────────────────────
  const quoteMut = useMutation({
    mutationFn: () => quoteJob({
      job_id: jobId,
      device_id: selectedDevice.device_id,
      domain: selectedDomain,
      payload: normalisePayload(payload, selectedDomain),
      budget_limit: budgetLimit ? { amount: Number(budgetLimit), currency: 'USD' } : undefined,
    }),
    onSuccess: (data: any) => { setQuoteResult(data); setStep('execute') },
    onError: (e: Error) => addToast(`${t.wizard.quoteFailed}: ${e.message}`, 'error'),
  })

  // ── Step 3: Execute ───────────────────────────────────────────────────────
  const executeMut = useMutation({
    mutationFn: () => executeJob({
      job_id: quoteResult.job_id,
      quote_id: quoteResult.quote_id,
      audit_requirements: hitlEnabled ? {
        snapshot_interval_seconds: 60,
        ai_vision_checks: selectedDomain.includes('fdm') ? ['detect_spaghetti_failure'] : ['detect_print_quality'],
        pause_for_human_at: pauseAt,
      } : { snapshot_interval_seconds: 120 },
    }),
    onSuccess: (data: any) => {
      setFinalJobId(data.job_id ?? quoteResult.job_id)
      setStep('done')
      addToast(t.wizard.executeSuccess, 'success')
    },
    onError: (e: Error) => addToast(`${t.wizard.executeFailed}: ${e.message}`, 'error'),
  })

  const fields = DOMAIN_FIELDS[selectedDomain] ?? []

  return (
    <SimpleModal open={open} onClose={handleClose} title={t.wizard.title} width="600px"
      footer={
        step === 'done' ? (
          <div className="flex gap-3 w-full">
            <button className="btn btn-ghost flex-1 justify-center" onClick={handleClose}>{t.common.close}</button>
            <button className="btn btn-primary flex-1 justify-center" onClick={() => { handleClose(); navigate(`/jobs/${finalJobId}`) }}>
              {t.wizard.viewJob} →
            </button>
          </div>
        ) : step === 'execute' ? (
          <div className="flex gap-3 w-full">
            <button className="btn btn-ghost" onClick={() => setStep('quote')}><ChevronLeft className="w-4 h-4" />{t.wizard.back}</button>
            <button className="btn btn-primary flex-1 justify-center" onClick={() => executeMut.mutate()} disabled={executeMut.isPending || quoteResult?.exceeds_budget}>
              {executeMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {executeMut.isPending ? t.wizard.executing : t.wizard.execute}
            </button>
          </div>
        ) : step === 'quote' ? (
          <div className="flex gap-3 w-full">
            <button className="btn btn-ghost" onClick={() => setStep('discover')}><ChevronLeft className="w-4 h-4" />{t.wizard.back}</button>
            <button className="btn btn-primary flex-1 justify-center" onClick={() => quoteMut.mutate()} disabled={quoteMut.isPending}>
              {quoteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
              {quoteMut.isPending ? t.wizard.quoting : t.wizard.getQuote}
            </button>
          </div>
        ) : (
          <button className="btn btn-primary flex-1 justify-center" onClick={() => discoverMut.mutate()} disabled={discoverMut.isPending}>
            {discoverMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {discoverMut.isPending ? t.wizard.discovering : t.wizard.discover}
          </button>
        )
      }
    >
      {/* Progress stepper */}
      <div className="flex items-center gap-0 mb-5 -mx-1">
        {(['discover','quote','execute','done'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-all',
              step === s ? 'bg-[var(--c-accent)] text-white' :
              ['discover','quote','execute','done'].indexOf(step) > i ? 'bg-emerald-600 text-white' : 'bg-[var(--c-border)] text-[var(--c-dim)]')}>
              {['discover','quote','execute','done'].indexOf(step) > i ? '✓' : i + 1}
            </div>
            <span className={clsx('text-[10px] ml-1 capitalize', step === s ? 'text-[var(--c-accent)]' : 'text-[var(--c-dim)]')}>
              {t.wizard[s as keyof typeof t.wizard] ?? s}
            </span>
            {i < 3 && <div className="flex-1 h-px bg-[var(--c-border)] mx-2" />}
          </div>
        ))}
      </div>

      {/* ── Step: Discover ─────────────────────────────────────────────────── */}
      {step === 'discover' && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--c-dim)]">{t.wizard.discoverHint}</p>
          <div>
            <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.wizard.domainFilter}</label>
            <input className="input" placeholder="manufacturing.print.2d.v1 (leave blank for all)"
              value={domainFilter} onChange={e => setDomainFilter(e.target.value)} />
          </div>
          {discovered.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider">{t.wizard.devicesFound} ({discovered.length})</p>
              {discovered.map(dev => (
                <div key={dev.device_id} className="space-y-1.5">
                  {dev.domains.map((dom: string) => (
                    <button key={dom} onClick={() => handleSelectDevice(dev, dom)}
                      className={clsx('w-full text-left card hover:border-[var(--c-accent)] transition-colors flex items-center gap-3 py-2.5',
                        dev.state === 'OFFLINE' && 'opacity-40 cursor-not-allowed')}
                      disabled={dev.state === 'OFFLINE'}>
                      <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', dev.state === 'IDLE' ? 'bg-[var(--c-green)]' : dev.state === 'BUSY' ? 'bg-amber-400' : 'bg-[var(--c-red)]')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--c-text)]">{dev.display_name}</p>
                        <p className="mono text-[10px] text-[var(--c-dim)] truncate">{dom}</p>
                      </div>
                      <RiskBadge tier={dev.risk_tier} />
                      <span className="badge bg-blue-950 text-blue-300 text-[9px]">{dev.conformance}</span>
                      <span className="text-[10px] text-[var(--c-dim)]">{dev.state}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--c-dim)]" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
          {discoverMut.isSuccess && discovered.length === 0 && (
            <p className="text-[var(--c-dim)] text-xs text-center py-4">{t.wizard.noDevices}</p>
          )}
        </div>
      )}

      {/* ── Step: Quote ───────────────────────────────────────────────────── */}
      {step === 'quote' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-[var(--c-surface)] rounded-lg">
            <span className={clsx('w-2 h-2 rounded-full', selectedDevice?.state === 'IDLE' ? 'bg-[var(--c-green)]' : 'bg-amber-400')} />
            <div>
              <p className="text-xs font-semibold text-[var(--c-text)]">{selectedDevice?.display_name}</p>
              <p className="mono text-[10px] text-[var(--c-dim)]">{selectedDomain}</p>
            </div>
            <RiskBadge tier={selectedDevice?.risk_tier} />
          </div>
          <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider">{t.wizard.jobPayload}</p>
          <div className="grid grid-cols-2 gap-2">
            {fields.map(f => (
              <div key={f.key}>
                <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{f.label}{f.required && <span className="text-[var(--c-red)] ml-0.5">*</span>}</label>
                {f.type === 'select' ? (
                  <select className="input text-xs" value={payload[f.key] ?? f.default ?? ''} onChange={e => setPayload(p => ({ ...p, [f.key]: e.target.value }))}>
                    {(SELECT_OPTS[f.key] ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input className="input text-xs" type={f.type} value={payload[f.key] ?? ''} onChange={e => setPayload(p => ({ ...p, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
          </div>
          <div>
            <label className="text-[10px] text-[var(--c-dim)] mb-1 block">{t.wizard.budgetLimit} (USD)</label>
            <input className="input text-xs w-40" type="number" value={budgetLimit} onChange={e => setBudgetLimit(e.target.value)} />
          </div>
        </div>
      )}

      {/* ── Step: Execute ─────────────────────────────────────────────────── */}
      {step === 'execute' && quoteResult && (
        <div className="space-y-4">
          {/* Quote summary */}
          <div className={clsx('rounded-xl border p-4 space-y-3', quoteResult.exceeds_budget ? 'border-red-800/60 bg-red-950/30' : 'border-emerald-800/60 bg-emerald-950/30')}>
            <div className="flex items-center gap-2">
              {quoteResult.exceeds_budget
                ? <AlertTriangle className="w-4 h-4 text-[var(--c-red)]" />
                : <CheckCircle className="w-4 h-4 text-[var(--c-green)]" />}
              <p className={clsx('text-sm font-semibold', quoteResult.exceeds_budget ? 'text-[var(--c-red)]' : 'text-[var(--c-green)]')}>
                {quoteResult.exceeds_budget ? t.wizard.exceedsBudget : t.wizard.quoteReady}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                [t.wizard.estimatedCost,    `$${quoteResult.estimated_cost?.amount?.toFixed(2) ?? '—'} ${quoteResult.estimated_cost?.currency ?? 'USD'}`],
                [t.wizard.riskTier,         quoteResult.risk_tier],
                [t.wizard.requiresApproval, quoteResult.requires_approval ? 'Yes' : 'No'],
                [t.wizard.validUntil,       quoteResult.valid_until ? new Date(quoteResult.valid_until).toLocaleTimeString() : '—'],
              ].map(([k, v]) => (
                <div key={k} className="bg-black/20 rounded-lg p-2">
                  <p className="text-[9px] text-[var(--c-dim)] uppercase tracking-wider mb-0.5">{k}</p>
                  <p className="text-xs text-[var(--c-text)] mono">{v}</p>
                </div>
              ))}
            </div>
          </div>

          {quoteResult.requires_approval && (
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-300">
              ⚠ {t.wizard.approvalNote}
            </div>
          )}

          {/* HITL / audit controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="hitl-enable" checked={hitlEnabled} onChange={e => setHitlEnabled(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="hitl-enable" className="text-xs text-[var(--c-text)]">{t.wizard.enableHitl}</label>
            </div>
            {hitlEnabled && (
              <div className="pl-7 space-y-2">
                <p className="text-[10px] text-[var(--c-dim)]">{t.wizard.pauseAt}</p>
                {PAUSE_OPTS.map(opt => (
                  <div key={opt} className="flex items-center gap-2">
                    <input type="checkbox" id={opt} checked={pauseAt.includes(opt)}
                      onChange={e => setPauseAt(prev => e.target.checked ? [...prev, opt] : prev.filter(p => p !== opt))}
                      className="w-3.5 h-3.5" />
                    <label htmlFor={opt} className="mono text-[10px] text-[var(--c-dim)]">{opt}</label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Cost breakdown */}
          {quoteResult.estimated_cost?.breakdown && Object.keys(quoteResult.estimated_cost.breakdown).length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-[var(--c-dim)] uppercase tracking-wider">{t.wizard.breakdown}</p>
              {Object.entries(quoteResult.estimated_cost.breakdown).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="text-[var(--c-dim)] capitalize">{k.replace(/_/g,' ')}</span>
                  <span className="mono text-[var(--c-text)]">${Number(v).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step: Done ────────────────────────────────────────────────────── */}
      {step === 'done' && (
        <div className="flex flex-col items-center py-8 gap-4 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-950 border border-emerald-800/60 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-[var(--c-green)]" />
          </div>
          <div>
            <p className="text-lg font-bold text-[var(--c-text)]">{t.wizard.jobCreated}</p>
            <p className="mono text-xs text-[var(--c-accent)] mt-1">{finalJobId}</p>
            <p className="text-[var(--c-dim)] text-xs mt-2">{t.wizard.jobCreatedDesc}</p>
          </div>
        </div>
      )}
    </SimpleModal>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalisePayload(raw: Record<string, string>, domain: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const fields = DOMAIN_FIELDS[domain] ?? []
  fields.forEach(f => {
    const v = raw[f.key]
    if (v === undefined || v === '') return
    out[f.key] = f.type === 'number' ? Number(v) : v
  })
  return out
}
