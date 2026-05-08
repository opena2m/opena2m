/**
 * Abort — emergency stop tests.
 *
 * Verifies abort primacy: the Abort button must be:
 *   - Visible on the JobDetail page while job is in-flight
 *   - Functional (sends POST /v1/jobs/:id/abort via the console)
 *   - The job transitions to ABORTED visible in the UI
 *
 * Prerequisites: `make dev-up && make seed`
 */
import { test, expect } from '@playwright/test'
import { gotoLive, gatewayFetch, waitForJobState, testJobId } from './helpers'

async function submitAndExecuteJob(jobId: string): Promise<boolean> {
  const discR = await gatewayFetch('/v1/discover', {
    method: 'POST',
    body: JSON.stringify({
      envelope: { aimp_version: '1.0', job_id: `${jobId}-disc` },
      device_filter: { domains: ['manufacturing.print.2d.v1'] },
    }),
  })
  if (!discR.ok) return false
  const { devices } = await discR.json() as { devices: Array<{ device_id: string }> }
  if (!devices.length) return false

  const quoteR = await gatewayFetch('/v1/quote', {
    method: 'POST',
    body: JSON.stringify({
      envelope: { aimp_version: '1.0', job_id: jobId },
      device_id: devices[0].device_id,
      domain: 'manufacturing.print.2d.v1',
      payload: { pages: 50, copies: 1, color_mode: 'color', paper_size: 'A0' },
    }),
  })
  if (!quoteR.ok) return false
  const quote = await quoteR.json() as { quote_id: string }

  const execR = await gatewayFetch('/v1/execute', {
    method: 'POST',
    body: JSON.stringify({
      envelope: { aimp_version: '1.0', job_id: jobId },
      quote_id: quote.quote_id,
    }),
  })
  return execR.status === 202
}

test.describe('Abort — emergency stop via console UI', () => {
  test('abort button appears on JobDetail for in-flight job', async ({ page }) => {
    const jobId = testJobId('abort-btn')
    const ok = await submitAndExecuteJob(jobId)
    if (!ok) { test.skip(); return }

    await gotoLive(page, `/jobs/${jobId}`)
    // Abort button should be visible (job is LOCKED/EXECUTING)
    const abortBtn = page.getByRole('button', { name: /abort/i }).first()
    await expect(abortBtn).toBeVisible({ timeout: 8_000 })
  })

  test('clicking abort transitions job to ABORTED', async ({ page }) => {
    const jobId = testJobId('abort-click')
    const ok = await submitAndExecuteJob(jobId)
    if (!ok) { test.skip(); return }

    await gotoLive(page, `/jobs/${jobId}`)
    const abortBtn = page.getByRole('button', { name: /abort/i }).first()
    await expect(abortBtn).toBeVisible({ timeout: 8_000 })
    await abortBtn.click()

    // Confirm in modal if one appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|abort/i })
    if (await confirmBtn.isVisible({ timeout: 2_000 })) {
      await confirmBtn.click()
    }

    // Job detail should now show ABORTED
    await expect(page.locator('body')).toContainText('ABORTED', { timeout: 15_000 })
  })

  test('abort via API is reflected in Jobs list', async ({ page }) => {
    const jobId = testJobId('abort-api')
    const ok = await submitAndExecuteJob(jobId)
    if (!ok) { test.skip(); return }

    // Abort via REST (not UI) to test that UI reflects external state changes
    await gatewayFetch(`/v1/jobs/${jobId}/abort`, {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        reason: 'e2e test abort',
        recovery_mode: 'safe_home',
      }),
    })

    await waitForJobState(jobId, 'ABORTED', 10_000)

    // Jobs list should reflect ABORTED state
    await gotoLive(page, '/jobs')
    await expect(page.locator('body')).not.toContainText('500', { timeout: 8_000 })
    // Navigate to job detail
    await gotoLive(page, `/jobs/${jobId}`)
    await expect(page.locator('body')).toContainText('ABORTED', { timeout: 8_000 })
  })

  test('abort on already-terminal job does not show error', async ({ page }) => {
    const jobId = testJobId('abort-terminal')
    const ok = await submitAndExecuteJob(jobId)
    if (!ok) { test.skip(); return }

    // Wait for COMPLETED
    try {
      await waitForJobState(jobId, 'COMPLETED', 30_000)
    } catch {
      test.skip()
      return
    }

    // Attempt abort on COMPLETED job via the gateway (idempotent — should succeed)
    const r = await gatewayFetch(`/v1/jobs/${jobId}/abort`, {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        reason: 'e2e idempotent abort test',
        recovery_mode: 'safe_home',
      }),
    })
    // The gateway returns 200 or 409 for terminal job abort — neither crashes the page
    expect([200, 409]).toContain(r.status)

    // UI should still load fine
    await gotoLive(page, `/jobs/${jobId}`)
    await expect(page.locator('body')).not.toContainText('500', { timeout: 8_000 })
  })
})
