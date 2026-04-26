import axios from 'axios'

const BASE_URL = import.meta.env.VITE_GATEWAY_URL ?? ''
const TOKEN = import.meta.env.VITE_GATEWAY_TOKEN ?? 'dev-token'

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobState =
  | 'PENDING' | 'QUOTED' | 'LOCKED' | 'EXECUTING'
  | 'AUDITING' | 'FULFILLING' | 'COMPLETED' | 'ABORTED' | 'FAILED'

export interface Job {
  job_id: string
  state: JobState
  progress: number
  domain?: string
  device_id?: string
  principal_id?: string
  error_code?: string
  error_message?: string
  created_at: string
  updated_at: string
  completed_at?: string
}

export interface JobList { jobs: Job[]; total: number; page: number; page_size: number }

export interface TelemetryData {
  job_id: string
  state: JobState
  progress: number
  updated_at: string
  domain?: string
  device_id?: string
  sensor_readings: SensorReading[]
  media: MediaRef[]
  vision_checks: VisionCheck[]
  human_action_required?: HumanAction | null
  error_code?: string
  error_message?: string
}

export interface SensorReading { channel: string; value: unknown; unit?: string; at: string }
export interface MediaRef { channel: string; kind: string; url: string; captured_at: string; expires_at?: string }
export interface VisionCheck { check_name: string; passed: boolean; confidence?: number; detail?: string; at: string }
export interface HumanAction { review_id: string; reason: string; instructions?: string; checkpoint?: string; deadline?: string; approve_url?: string }

export interface Device {
  device_id: string
  display_name?: string
  vendor?: string
  model?: string
  firmware?: string
  risk_tier?: string
  conformance?: string
  domains: string[]
  status?: { reachable?: boolean; busy?: boolean; queue_length?: number }
  capabilities?: Record<string, unknown>
  created_at?: string
}

export interface Domain {
  domain_id: string
  schema_uri?: string
  adapter_package?: string
  adapter_version?: string
  loaded?: boolean
  registered_at?: string
}

export interface Policy {
  policy_id: string
  name: string
  description?: string
  priority: number
  enabled: boolean
  rule: { conditions: Record<string, unknown>; action: string }
}

export interface Budget {
  budget_id: string
  name: string
  currency: string
  ceiling: number
  consumed: number
  warn_threshold: number
  period?: string
  utilization: number
}

export interface AuditEntry {
  id: number
  job_id?: string
  event_type: string
  principal_id?: string
  payload?: Record<string, unknown>
  entry_hash?: string
  signature?: string
  at: string
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export const gw = {
  // Jobs
  listJobs: (params?: Record<string, unknown>) =>
    api.get<JobList>('/v1/jobs', { params }).then(r => r.data),
  getJob: (id: string) => api.get<Job>(`/v1/jobs/${id}`).then(r => r.data),
  getTelemetry: (id: string, since?: string) =>
    api.get<TelemetryData>(`/v1/jobs/${id}/telemetry`, { params: since ? { since } : {} }).then(r => r.data),
  abortJob: (id: string, reason?: string) =>
    api.post(`/v1/jobs/${id}/abort`, {
      envelope: { aimp_version: '1.0', job_id: id, timestamp: new Date().toISOString() },
      reason,
      recovery_mode: 'safe_home',
    }).then(r => r.data),
  resumeJob: (id: string, token: string, decision: 'approve' | 'reject', note?: string) =>
    api.post(`/v1/jobs/${id}/resume`, {
      envelope: { aimp_version: '1.0', job_id: id, timestamp: new Date().toISOString() },
      approval_token: token,
      decision,
      reviewer_note: note,
    }).then(r => r.data),

  // Devices
  listDevices: () => api.get<Device[]>('/v1/devices').then(r => r.data),
  getDevice: (id: string) => api.get<Device>(`/v1/devices/${id}`).then(r => r.data),
  createDevice: (data: Partial<Device> & { device_id: string }) =>
    api.post('/v1/devices', data).then(r => r.data),

  // Domains
  listDomains: () => api.get<Domain[]>('/v1/domains').then(r => r.data),
  getDomain: (id: string) => api.get<Domain>(`/v1/domains/${encodeURIComponent(id)}`).then(r => r.data),

  // Policies
  listPolicies: () => api.get<Policy[]>('/v1/policies').then(r => r.data),
  createPolicy: (data: unknown) => api.post('/v1/policies', data).then(r => r.data),
  dryRunPolicy: (data: unknown) => api.post('/v1/policies/dry-run', data).then(r => r.data),

  // Budgets
  listBudgets: () => api.get<Budget[]>('/v1/budgets').then(r => r.data),
  createBudget: (data: unknown) => api.post('/v1/budgets', data).then(r => r.data),

  // Audit
  listAudit: (params?: Record<string, unknown>) =>
    api.get<{ entries: AuditEntry[]; page: number; page_size: number }>('/v1/audit', { params }).then(r => r.data),
  verifyChain: (job_id?: string) =>
    api.get('/v1/audit/verify', { params: job_id ? { job_id } : {} }).then(r => r.data),

  // Health
  health: () => api.get('/health').then(r => r.data),
  capabilities: () => api.get('/capabilities').then(r => r.data),

  // Webhooks
  listWebhooks: () => api.get('/v1/webhooks').then(r => r.data),
  createWebhook: (data: unknown) => api.post('/v1/webhooks', data).then(r => r.data),
}
