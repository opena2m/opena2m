/**
 * Data layer — transparent mock↔live switch.
 * All pages import from here. NEVER import directly from mockData in pages.
 */
import { useSettingsStore } from '@/store/settings'
import { gw } from './api'
import {
  JOBS_INIT, DEVICES, DOMAINS, POLICIES_INIT, BUDGETS_INIT,
  AUDIT_LOG_INIT, WEBHOOKS_INIT, SIGNING_KEYS_INIT, TELEMETRY,
  JOB_TRANSITIONS, POLICY_TRACE_JOB001, PRINCIPALS,
  type JobFull, type DeviceFull, type DomainMeta, type PolicyFull,
  type BudgetFull, type AuditEntry,
} from './mockData'

export type { JobTransition, PolicyTraceStep } from './mockData'

const delay = <T>(v: T, ms = 140): Promise<T> => new Promise(r => setTimeout(() => r(v), ms))
const isMock = () => useSettingsStore.getState().mode === 'mock'
const newId = () => `J${Date.now().toString(36).toUpperCase()}`

// ── In-memory mutable mock state ──────────────────────────────────────────────
let _jobs: JobFull[]     = JOBS_INIT.map(j => ({ ...j }))
let _auditLog: AuditEntry[] = [...AUDIT_LOG_INIT]

function _addAudit(e: Omit<AuditEntry, 'id'|'prev_hash'|'signature'>) {
  _auditLog.unshift({ ...e, id: _auditLog.length + 1, prev_hash: 'sha256:computed...', signature: 'ed25519:live...' })
}

// ── Principal/Domain resolution (works in both modes) ──────────────────────────
/**
 * Resolve a principal_id to display info.
 * In mock mode uses the local PRINCIPALS array.
 * In live mode falls back gracefully (ID shown if no cache hit).
 */
export function resolvePrincipal(id: string): { display_name: string; kind: 'agent'|'human'|'system' } {
  const p = PRINCIPALS.find(p => p.principal_id === id)
  return p ?? { display_name: id, kind: 'system' }
}

/**
 * Resolve a domain_id to its full domain metadata.
 * In mock mode uses local DOMAINS. In live mode returns minimal fallback.
 */
export function resolveDomain(id: string): DomainMeta | undefined {
  return DOMAINS.find(d => d.domain_id === id)
}

// ── AIMP five verbs ───────────────────────────────────────────────────────────
export async function discoverDevices(filter?: { domains?: string[]; device_ids?: string[] }) {
  if (!isMock()) return gw.discover(filter)
  const devices = DEVICES
    .filter(d => !filter?.device_ids?.length || filter.device_ids.includes(d.device_id))
    .filter(d => !filter?.domains?.length || d.domains.some(dom => filter.domains!.some(f => dom.startsWith(f.replace('*','')))))
  return delay({
    job_id: newId(), aimp_version: '1.0', conformance_level: 'L3',
    devices: devices.map(d => ({
      device_id: d.device_id, display_name: d.display_name,
      domains: d.domains, state: d.status_json?.reachable ? (d.status_json.busy ? 'BUSY' : 'IDLE') : 'OFFLINE',
      risk_tier: d.risk_tier, conformance: d.conformance,
      capabilities_json: d.capabilities_json,
      consumables: d.consumables.map(c => ({ name: c.name, quantity: parseFloat(c.remaining), unit: c.remaining.replace(/[\d.]/g,'').trim() || 'unit', status: c.status })),
    })),
  })
}

export async function quoteJob(params: {
  job_id: string; device_id: string; domain: string
  payload: Record<string,unknown>
  asset?: { type?: string; format?: string; url?: string; hash_sha256?: string }
  budget_limit?: { amount: number; currency?: string }
}) {
  if (!isMock()) return gw.quote(params)
  const device = DEVICES.find(d => d.device_id === params.device_id)
  const domain = DOMAINS.find(d => d.domain_id === params.domain)
  if (!device) throw new Error('Device not found')
  if (!domain) throw new Error('Domain not found')
  if (!device.status_json?.reachable) throw new Error('Device is offline')
  const copies = Number((params.payload as any).copies ?? (params.payload as any).quantity ?? 1)
  const baseCost = domain.risk_tier_default === 'restricted' ? 1.80 : 0.50
  const estimatedCost = +(baseCost + copies * 0.40).toFixed(2)
  if (params.budget_limit && estimatedCost > params.budget_limit.amount) {
    return delay({ job_id: params.job_id, state: 'QUOTED', quote_id: `Q${Date.now()}`, estimated_cost: { currency: 'USD', amount: estimatedCost, breakdown: {} }, exceeds_budget: true, risk_tier: domain.risk_tier_default, requires_approval: false, valid_until: new Date(Date.now() + 3600000).toISOString() })
  }
  const requiresApproval = domain.risk_tier_default === 'restricted' || domain.risk_tier_default === 'hazardous'
  const quoteId = `Q${Date.now().toString(36).toUpperCase()}`
  const newJob: JobFull = {
    job_id: params.job_id, quote_id: quoteId,
    device_id: params.device_id, domain_id: params.domain,
    principal_id: 'P001', state: 'QUOTED', progress: 0,
    payload_json: params.payload, audit_requirements_json: null,
    asset_json: params.asset ? { url: params.asset.url ?? '', hash: params.asset.hash_sha256 ?? '', size_bytes: 0 } : null,
    cost_estimate: estimatedCost, cost_actual: null, cost_currency: 'USD',
    tracking_json: null, error_json: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1,
  }
  _jobs.unshift(newJob)
  _addAudit({ at: new Date().toISOString(), principal_id: 'P001', action: 'job.quote', target_kind: 'job', target_id: params.job_id, details_json: { quote_id: quoteId, estimated_cost: estimatedCost } })
  return delay({
    job_id: params.job_id, state: 'QUOTED', quote_id: quoteId,
    estimated_cost: { currency: 'USD', amount: estimatedCost, breakdown: { material: +(baseCost * 0.3).toFixed(2), machine_time: +(baseCost * 0.4).toFixed(2), service_fee: +(baseCost * 0.3).toFixed(2) } },
    resource_consumption: { machine_time_seconds: 600 },
    valid_until: new Date(Date.now() + 3600000).toISOString(),
    exceeds_budget: false, risk_tier: domain.risk_tier_default, requires_approval: requiresApproval,
  })
}

export async function executeJob(params: {
  job_id: string; quote_id: string; approval_token?: string
  audit_requirements?: { snapshot_interval_seconds?: number; sensors?: string[]; ai_vision_checks?: string[]; pause_for_human_at?: string[] }
}) {
  if (!isMock()) return gw.execute(params)
  const job = _jobs.find(j => j.job_id === params.job_id)
  if (!job) throw new Error('Job not found')
  if (job.state !== 'QUOTED') throw new Error(`Cannot execute job in state ${job.state}`)
  if (params.audit_requirements) job.audit_requirements_json = params.audit_requirements as any
  job.state = 'LOCKED'; job.version += 1; job.updated_at = new Date().toISOString()
  _addAudit({ at: new Date().toISOString(), principal_id: 'P001', action: 'job.execute', target_kind: 'job', target_id: params.job_id, details_json: { quote_id: params.quote_id, approval_token: params.approval_token ?? null } })
  // Transition to EXECUTING after brief delay (simulated adapter start)
  setTimeout(() => {
    const j = _jobs.find(j => j.job_id === params.job_id)
    if (j && j.state === 'LOCKED') { j.state = 'EXECUTING'; j.version += 1; j.updated_at = new Date().toISOString() }
  }, 1500)
  return delay({ job_id: params.job_id, state: 'LOCKED', transition_eta: new Date(Date.now() + 2000).toISOString() })
}

// ── Jobs ───────────────────────────────────────────────────────────────────────
export async function listJobs(params?: { state?: string; device_id?: string; domain?: string; page?: number; page_size?: number }) {
  if (!isMock()) return gw.listJobs(params)
  let jobs = [..._jobs]
  if (params?.state)     jobs = jobs.filter(j => j.state === params.state)
  if (params?.device_id) jobs = jobs.filter(j => j.device_id === params.device_id)
  if (params?.domain)    jobs = jobs.filter(j => j.domain_id === params.domain)
  jobs.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  const page = params?.page ?? 1, size = params?.page_size ?? 20
  return delay({ jobs: jobs.slice((page - 1) * size, page * size) as any[], total: jobs.length, page, page_size: size })
}

export async function getJob(id: string) {
  if (!isMock()) return gw.getJob(id)
  const job = _jobs.find(j => j.job_id === id)
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 })
  return delay({ ...job } as any)
}

export async function getTelemetry(id: string) {
  if (!isMock()) return gw.getTelemetry(id)
  const job = _jobs.find(j => j.job_id === id)
  if (!job) throw Object.assign(new Error('Job not found'), { status: 404 })
  const tel = TELEMETRY[id] ?? { sensors: [], history: {}, media: [], vision_checks: [] }
  return delay({
    job_id: id, state: job.state, progress: job.progress,
    updated_at: job.updated_at, domain: job.domain_id, device_id: job.device_id,
    sensors: tel.sensors, history: tel.history, media: tel.media, vision_checks: tel.vision_checks,
    human_action_required: job.state === 'AUDITING' ? {
      review_id: `review-${id}`, reason: 'Mid-build checkpoint at 50% — human approval required.',
      instructions: 'Review the latest camera snapshot and sensor data. Approve to resume, or reject to abort.',
      checkpoint: 'mid_build_50_percent', approve_url: `/review/${id}`,
    } : null,
    error_code: job.error_json?.code, error_message: job.error_json?.message,
  } as any)
}

export async function getJobTransitions(id: string) {
  if (!isMock()) { try { return await gw.getJobTransitions(id) } catch { return [] } }
  return delay(JOB_TRANSITIONS[id] ?? [])
}

export async function getPolicyTrace(id: string) {
  if (!isMock()) { try { return await gw.getPolicyTrace(id) } catch { return [] } }
  return delay(id === 'JOB001' ? POLICY_TRACE_JOB001 : [])
}

export async function abortJob(id: string, reason?: string) {
  if (!isMock()) return gw.abortJob(id, reason)
  const job = _jobs.find(j => j.job_id === id)
  if (job && !['COMPLETED','ABORTED','FAILED'].includes(job.state)) {
    job.state = 'ABORTED'; job.updated_at = new Date().toISOString()
    _addAudit({ at: new Date().toISOString(), principal_id: 'P002', action: 'job.abort', target_kind: 'job', target_id: id, details_json: { reason: reason ?? 'Operator abort' } })
  }
  return delay({ job_id: id, state: 'ABORTED' })
}

export async function resumeJob(id: string, token: string, decision: 'CONTINUE'|'ADJUST'|'ABORT', note?: string, adjustParams?: Record<string,unknown>) {
  if (!isMock()) return gw.resumeJob(id, token, decision === 'ABORT' ? 'reject' : 'approve', note)
  const job = _jobs.find(j => j.job_id === id)
  if (job && job.state === 'AUDITING') {
    job.state = decision === 'ABORT' ? 'ABORTED' : 'EXECUTING'
    job.version += 1; job.updated_at = new Date().toISOString()
    _addAudit({ at: new Date().toISOString(), principal_id: 'P002', action: `job.resume.${decision.toLowerCase()}`, target_kind: 'job', target_id: id, details_json: { decision, note, adjustParams, signed_by: 'human://bob@fab', job_version: job.version } })
  }
  return delay({ job_id: id, state: decision === 'ABORT' ? 'ABORTED' : 'EXECUTING' })
}

export function tickProgress() {
  _jobs = _jobs.map(j => {
    if (j.state === 'EXECUTING' && j.progress < 0.99)
      return { ...j, progress: Math.min(j.progress + 0.003, 0.99), updated_at: new Date().toISOString() }
    return j
  })
}

// ── Devices ───────────────────────────────────────────────────────────────────
export async function listDevices() {
  if (!isMock()) return gw.listDevices() as any
  return delay(DEVICES.map(d => ({ ...d })))
}
export async function getDevice(id: string) {
  if (!isMock()) return gw.getDevice(id) as any
  const d = DEVICES.find(d => d.device_id === id)
  if (!d) throw Object.assign(new Error('Device not found'), { status: 404 })
  return delay({ ...d })
}
export async function createDevice(data: Record<string,unknown>) {
  if (!isMock()) return gw.createDevice(data)
  const newDev = {
    device_id: String(data.device_id), display_name: String(data.display_name ?? data.device_id),
    vendor: String(data.vendor ?? 'Unknown'), model: String(data.model ?? 'Unknown'),
    firmware: String(data.firmware ?? '0.1.0'),
    location_json: { site: String(data.site ?? 'Unknown'), country: String(data.country ?? 'US') },
    risk_tier: String(data.risk_tier ?? 'routine'), conformance: 'L1',
    status_json: { reachable: false, busy: false, queue_length: 0, current_job_id: null },
    capabilities_json: {}, domains: [String(data.domain ?? '')].filter(Boolean),
    created_at: new Date().toISOString(), disabled_at: null,
    stats24h: { jobs: 0, success_pct: 0, avg_min: 0, uptime_pct: 0 }, consumables: [],
  }
  DEVICES.push(newDev as any)
  _addAudit({ at: new Date().toISOString(), principal_id: 'P003', action: 'device.registered', target_kind: 'device', target_id: newDev.device_id, details_json: data })
  return delay(newDev)
}
export async function restartAdapter(deviceId: string) {
  if (!isMock()) return gw.restartDevice(deviceId)
  _addAudit({ at: new Date().toISOString(), principal_id: 'P002', action: 'device.restart', target_kind: 'device', target_id: deviceId, details_json: { requested_by: 'human://bob@fab' } })
  return delay({ device_id: deviceId, restarting: true })
}
export async function toggleDevice(deviceId: string) {
  if (!isMock()) return gw.toggleDevice(deviceId)
  const dev = DEVICES.find(d => d.device_id === deviceId) as any
  if (dev) dev.disabled_at = dev.disabled_at ? null : new Date().toISOString()
  _addAudit({ at: new Date().toISOString(), principal_id: 'P002', action: 'device.toggle', target_kind: 'device', target_id: deviceId, details_json: {} })
  return delay({ device_id: deviceId, toggled: true })
}

// ── Domains ───────────────────────────────────────────────────────────────────
export async function listDomains() {
  if (!isMock()) return gw.listDomains() as any
  return delay(DOMAINS.map(d => ({ ...d })))
}
export async function getDomain(id: string) {
  if (!isMock()) return gw.getDomain(id) as any
  const d = DOMAINS.find(d => d.domain_id === id)
  if (!d) throw Object.assign(new Error('Domain not found'), { status: 404 })
  return delay({ ...d })
}

// ── Policies ──────────────────────────────────────────────────────────────────
export async function listPolicies() {
  if (!isMock()) return gw.listPolicies() as any
  return delay(POLICIES_INIT.map(p => ({ ...p })))
}
export async function getPolicy(id: string) {
  if (!isMock()) return gw.getPolicy(id) as any
  const p = POLICIES_INIT.find(p => p.policy_id === id)
  if (!p) throw Object.assign(new Error('Policy not found'), { status: 404 })
  return delay({ ...p })
}
export async function createPolicy(yaml: string) {
  if (!isMock()) return gw.createPolicy({ rules_yaml: yaml })
  const nameMatch = yaml.match(/^id:\s*(.+)/m)
  const newPolicy: PolicyFull = { policy_id: `POL${Date.now()}`, name: nameMatch?.[1]?.trim() ?? 'new-policy', enabled: true, rules_yaml: yaml, version: 1, updated_at: new Date().toISOString(), updated_by: 'P003', matches_today: 0 }
  POLICIES_INIT.push(newPolicy); return delay(newPolicy)
}
export async function updatePolicy(id: string, yaml: string) {
  if (!isMock()) return gw.updatePolicy(id, { rules_yaml: yaml })
  const idx = POLICIES_INIT.findIndex(p => p.policy_id === id)
  if (idx !== -1) { POLICIES_INIT[idx] = { ...POLICIES_INIT[idx], rules_yaml: yaml, version: (POLICIES_INIT[idx].version ?? 1) + 1, updated_at: new Date().toISOString() }; _addAudit({ at: new Date().toISOString(), principal_id: 'P003', action: 'policy.update', target_kind: 'policy', target_id: id, details_json: {} }) }
  return delay({ policy_id: id, updated: true })
}
export async function dryRunPolicy(data: { domain: string; device_id: string; risk_tier?: string; principal_kind?: string; estimated_amount?: number }) {
  if (!isMock()) return gw.dryRunPolicy(data)
  const tier = data.risk_tier ?? 'routine'
  let action = 'ALLOW', reason = "No DENY rule matched; default allow.", matched = 'POL004'
  if (tier === 'hazardous')    { action = 'DENY';             reason = "Matched policy 'default-deny-hazardous'"; matched = 'POL001' }
  else if (tier === 'restricted') { action = 'REQUIRE_APPROVAL'; reason = "Matched policy 'restricted-needs-hitl'";  matched = 'POL002' }
  if (data.estimated_amount && data.estimated_amount > 100) { action = 'DENY'; reason = "Budget ceiling exceeded: hard deny"; matched = 'BUD001' }
  return delay({ action, reason, matched_policy: matched, trace: POLICY_TRACE_JOB001 })
}

// ── Budgets ───────────────────────────────────────────────────────────────────
export async function listBudgets() {
  if (!isMock()) return gw.listBudgets() as any
  return delay(BUDGETS_INIT.map(b => ({ ...b, utilization: b.consumed / b.ceiling_amount })))
}
export async function getBudget(id: string) {
  if (!isMock()) return gw.getBudget(id) as any
  const b = BUDGETS_INIT.find(b => b.budget_id === id)
  if (!b) throw Object.assign(new Error('Budget not found'), { status: 404 })
  return delay({ ...b, utilization: b.consumed / b.ceiling_amount, jobs: _jobs.filter(j => j.principal_id === b.principal_id).slice(0, 10) })
}
export async function createBudget(data: Record<string,unknown>) {
  if (!isMock()) return gw.createBudget(data)
  const newB: BudgetFull = { budget_id: `BUD${Date.now()}`, principal_id: String(data.principal_id ?? ''), scope_domain_id: null, ceiling_amount: Number(data.ceiling_amount ?? 0), ceiling_currency: 'USD', window_kind: String(data.window_kind ?? 'daily'), warn_at_percent: Number(data.warn_at_percent ?? 80), hard_deny: Boolean(data.hard_deny), consumed: 0, window_starts_at: new Date().toISOString(), window_resets_at: new Date(Date.now() + 86400000).toISOString(), history: [] }
  BUDGETS_INIT.push(newB); _addAudit({ at: new Date().toISOString(), principal_id: 'P003', action: 'budget.created', target_kind: 'budget', target_id: newB.budget_id, details_json: data })
  return delay({ ...newB, utilization: 0 })
}

// ── Audit ──────────────────────────────────────────────────────────────────────
export async function listAudit(params?: { job_id?: string; action?: string; page_size?: number; page?: number }) {
  if (!isMock()) return gw.listAudit(params)
  let entries = [..._auditLog]
  if (params?.job_id) entries = entries.filter(e => e.target_id === params.job_id)
  if (params?.action)  entries = entries.filter(e => e.action === params.action)
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const page = params?.page ?? 1, size = params?.page_size ?? 60
  return delay({ entries: entries.slice((page - 1) * size, page * size), page, page_size: size })
}
export async function verifyChain(job_id?: string) {
  if (!isMock()) return gw.verifyChain(job_id)
  const entries = job_id ? _auditLog.filter(e => e.target_id === job_id) : _auditLog
  return delay({ chain_valid: true, entry_count: entries.length, public_key_pem: '--- MOCK ED25519 PUB KEY ---', results: [] })
}

// ── System ─────────────────────────────────────────────────────────────────────
export async function getHealth() {
  if (!isMock()) return gw.health()
  return delay({ status: 'ok', version: '0.1.0', spec: 'AIMP 1.0.0-draft' })
}
export async function getCapabilities() {
  if (!isMock()) return gw.capabilities()
  return delay({ aimp_version: '1.0', conformance_level: 'L3', domains: DOMAINS.map(d => d.domain_id), features: ['discover','quote','execute','telemetry','abort','resume','webhooks','sse','audit_log','hitl','budget_enforcement','vision_checks','signed_audit'] })
}
export async function listWebhooks() {
  if (!isMock()) return gw.listWebhooks()
  return delay(WEBHOOKS_INIT.map(w => ({ ...w })))
}
export async function createWebhook(data: { url: string; events_json: string[] }) {
  if (!isMock()) return gw.createWebhook(data)
  const ep = { endpoint_id: `WH${Date.now()}`, url: data.url, events_json: data.events_json, disabled_at: null, deliveries_today: 0, failures_today: 0, last_delivery: null }
  WEBHOOKS_INIT.push(ep as any); return delay(ep)
}
export async function deleteWebhook(id: string) {
  if (!isMock()) return gw.deleteWebhook(id)
  const idx = WEBHOOKS_INIT.findIndex((w: any) => w.endpoint_id === id)
  if (idx !== -1) WEBHOOKS_INIT.splice(idx, 1)
  return delay({ deleted: true })
}
export async function listSigningKeys() {
  if (!isMock()) { try { return await gw.listSigningKeys() } catch { return SIGNING_KEYS_INIT } }
  return delay(SIGNING_KEYS_INIT.map(k => ({ ...k })))
}
export async function listUsers() {
  if (!isMock()) { try { return await gw.listUsers() } catch { return PRINCIPALS.filter(p => p.kind !== 'system') } }
  return delay(PRINCIPALS.filter(p => p.kind !== 'system').map(p => ({ ...p })))
}
export async function createUser(data: { kind: string; display_name: string; external_id?: string }) {
  if (!isMock()) return gw.createUser(data)
  const newUser = { principal_id: `P${Date.now()}`, kind: data.kind as any, display_name: data.display_name, external_id: data.external_id ?? null, created_at: new Date().toISOString(), role: data.kind === 'human' ? 'Reviewer' : 'Agent', last_active: new Date().toISOString() }
  PRINCIPALS.push(newUser); return delay(newUser)
}
