/**
 * Shared helpers for OpenA2M Playwright E2E tests.
 */
import { type Page, type BrowserContext } from '@playwright/test'

export const GATEWAY_URL = process.env.AIMP_GATEWAY_URL ?? 'http://localhost:8080'
export const DEV_TOKEN    = process.env.AIMP_DEV_TOKEN  ?? 'dev-token'

/**
 * Navigate to the console, switch to live mode, and inject the dev bearer token
 * into localStorage so every page loads against the real gateway.
 */
export async function loginDev(page: Page) {
  // Set localStorage before navigating so the app sees it on first load
  await page.goto('/login')
  await page.evaluate(
    ({ token }) => localStorage.setItem('opena2m_token', token),
    { token: DEV_TOKEN }
  )
  // Also set the settings store to live mode so dataLayer uses the real API
  await page.evaluate(() => {
    const raw = localStorage.getItem('opena2m-settings')
    const s = raw ? JSON.parse(raw) : {}
    s.state = { ...(s.state ?? {}), mode: 'live' }
    localStorage.setItem('opena2m-settings', JSON.stringify(s))
  })
}

/**
 * Inject the dev token and navigate directly to a URL (no login page visit).
 */
export async function gotoLive(page: Page, path: string) {
  await page.goto(path)
  await page.evaluate(
    ({ token }) => {
      localStorage.setItem('opena2m_token', token)
      const raw = localStorage.getItem('opena2m-settings')
      const s = raw ? JSON.parse(raw) : {}
      s.state = { ...(s.state ?? {}), mode: 'live' }
      localStorage.setItem('opena2m-settings', JSON.stringify(s))
    },
    { token: DEV_TOKEN }
  )
  await page.goto(path)
}

/**
 * Call the gateway REST API directly from the test runner (Node.js context).
 * Useful for seeding state before a UI assertion.
 */
export async function gatewayFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const { default: fetch } = await import('node-fetch')
  return fetch(`${GATEWAY_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${DEV_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> ?? {}),
    },
    ...options,
  }) as unknown as Response
}

/** Wait until a gateway job reaches a target state (polls /v1/jobs/:id). */
export async function waitForJobState(
  jobId: string,
  targetState: string,
  maxWaitMs = 30_000
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const r = await gatewayFetch(`/v1/jobs/${jobId}`)
    if (r.ok) {
      const d = await r.json() as { state?: string }
      if (d.state === targetState) return
      if (['COMPLETED', 'ABORTED', 'FAILED'].includes(d.state ?? '')) {
        if (d.state !== targetState) {
          throw new Error(`Job ${jobId} reached ${d.state}, expected ${targetState}`)
        }
        return
      }
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`Job ${jobId} did not reach ${targetState} within ${maxWaitMs}ms`)
}

/** Generate a unique job ID for test isolation. */
export function testJobId(prefix = 'e2e'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}
