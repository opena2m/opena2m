import axios from 'axios'

const BASE_URL = import.meta.env.VITE_GATEWAY_URL ?? ''
const TOKEN    = import.meta.env.VITE_GATEWAY_TOKEN ?? 'dev-token'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
})

export type JobState = 'PENDING'|'QUOTED'|'LOCKED'|'EXECUTING'|'AUDITING'|'FULFILLING'|'COMPLETED'|'ABORTED'|'FAILED'

// ── AIMP envelope helper ───────────────────────────────────────────────────────
const env = (job_id: string) => ({
  aimp_version: '1.0',
  job_id,
  timestamp: new Date().toISOString(),
})

const ulid = () => `J${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`

export const gw = {
  // ── Five AIMP verbs ────────────────────────────────────────────────────────
  discover: (filter?: { domains?: string[]; device_ids?: string[] }) => {
    const job_id = ulid()
    return api.post('/v1/discover', { envelope: env(job_id), device_filter: filter ?? {} }).then(r => r.data)
  },
  quote: (params: { job_id: string; device_id: string; domain: string; payload: Record<string,unknown>; asset?: { type?: string; format?: string; url?: string; hash_sha256?: string }; budget_limit?: { amount: number; currency?: string } }) =>
    api.post('/v1/quote', { envelope: env(params.job_id), ...params }).then(r => r.data),

  execute: (params: { job_id: string; quote_id: string; approval_token?: string; audit_requirements?: Record<string,unknown> }) =>
    api.post('/v1/execute', { envelope: env(params.job_id), ...params }).then(r => r.data),

  // ── Jobs ───────────────────────────────────────────────────────────────────
  listJobs: (params?: Record<string,unknown>) =>
    api.get('/v1/jobs', { params }).then(r => r.data),
  getJob: (id: string) =>
    api.get(`/v1/jobs/${id}`).then(r => r.data),
  getTelemetry: (id: string, since?: string) =>
    api.get(`/v1/jobs/${id}/telemetry`, { params: since ? { since } : {} }).then(r => r.data),
  getJobTransitions: (id: string) =>
    api.get(`/v1/jobs/${id}/transitions`).then(r => r.data),
  getPolicyTrace: (id: string) =>
    api.get(`/v1/jobs/${id}/policy-trace`).then(r => r.data),
  abortJob: (id: string, reason?: string) =>
    api.post(`/v1/jobs/${id}/abort`, { envelope: env(id), reason, recovery_mode: 'safe_home' }).then(r => r.data),
  resumeJob: (id: string, token: string, decision: 'approve'|'reject', note?: string) =>
    api.post(`/v1/jobs/${id}/resume`, { envelope: env(id), approval_token: token, decision, reviewer_note: note }).then(r => r.data),

  // ── Devices ────────────────────────────────────────────────────────────────
  listDevices: () =>  api.get('/v1/devices').then(r => r.data),
  getDevice: (id: string) => api.get(`/v1/devices/${id}`).then(r => r.data),
  createDevice: (data: Record<string,unknown>) => api.post('/v1/devices', data).then(r => r.data),
  restartDevice: (id: string) => api.post(`/v1/devices/${id}/restart`).then(r => r.data),
  toggleDevice: (id: string) => api.post(`/v1/devices/${id}/toggle`).then(r => r.data),

  // ── Domains ────────────────────────────────────────────────────────────────
  listDomains: () => api.get('/v1/domains').then(r => r.data),
  getDomain: (id: string) => api.get(`/v1/domains/${encodeURIComponent(id)}`).then(r => r.data),

  // ── Policies ──────────────────────────────────────────────────────────────
  listPolicies: () => api.get('/v1/policies').then(r => r.data),
  getPolicy: (id: string) => api.get(`/v1/policies/${id}`).then(r => r.data),
  createPolicy: (data: unknown) => api.post('/v1/policies', data).then(r => r.data),
  updatePolicy: (id: string, data: unknown) => api.put(`/v1/policies/${id}`, data).then(r => r.data),
  dryRunPolicy: (data: unknown) => api.post('/v1/policies/dry-run', data).then(r => r.data),

  // ── Budgets ────────────────────────────────────────────────────────────────
  listBudgets: () => api.get('/v1/budgets').then(r => r.data),
  getBudget: (id: string) => api.get(`/v1/budgets/${id}`).then(r => r.data),
  createBudget: (data: unknown) => api.post('/v1/budgets', data).then(r => r.data),

  // ── Audit ──────────────────────────────────────────────────────────────────
  listAudit: (params?: Record<string,unknown>) =>
    api.get('/v1/audit', { params }).then(r => r.data),
  verifyChain: (job_id?: string) =>
    api.get('/v1/audit/verify', { params: job_id ? { job_id } : {} }).then(r => r.data),

  // ── Webhooks ───────────────────────────────────────────────────────────────
  listWebhooks: () => api.get('/v1/webhooks').then(r => r.data),
  createWebhook: (data: unknown) => api.post('/v1/webhooks', data).then(r => r.data),
  deleteWebhook: (id: string) => api.delete(`/v1/webhooks/${id}`).then(r => r.data),

  // ── System / meta ──────────────────────────────────────────────────────────
  listSigningKeys: () => api.get('/v1/signing-keys').then(r => r.data),
  listUsers: () => api.get('/v1/users').then(r => r.data),
  createUser: (data: unknown) => api.post('/v1/users', data).then(r => r.data),
  health: () => api.get('/health').then(r => r.data),
  capabilities: () => api.get('/capabilities').then(r => r.data),
  post: (path: string, data?: unknown) => api.post(path, data).then(r => r.data),
}
