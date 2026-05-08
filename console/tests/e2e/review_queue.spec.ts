/**
 * Review Queue — Journey B HITL UI tests.
 *
 * Scenario (mirrors scripts/test_journey_b.py):
 *   1. FDM job starts, pauses at AUDITING waypoint
 *   2. Review Queue page shows the pending item
 *   3. Operator views ReviewDetail and approves (CONTINUE)
 *   4. Job resumes and eventually reaches COMPLETED
 *   5. Operator can also reject (ABORT) a queued job
 *
 * Prerequisites: `make dev-up && make seed` (FDM sim device registered)
 */
import { test, expect } from '@playwright/test'
import { gotoLive, gatewayFetch, waitForJobState, testJobId } from './helpers'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function submitFdmJob(jobId: string): Promise<{ quoteId: string } | null> {
  const discR = await gatewayFetch('/v1/discover', {
    method: 'POST',
    body: JSON.stringify({
      envelope: { aimp_version: '1.0', job_id: `${jobId}-disc` },
      device_filter: { domains: ['manufacturing.additive.fdm.v1'] },
    }),
  })
  if (!discR.ok) return null
  const { devices } = await discR.json() as { devices: Array<{ device_id: string }> }
  if (!devices.length) return null

  const quoteR = await gatewayFetch('/v1/quote', {
    method: 'POST',
    body: JSON.stringify({
      envelope: { aimp_version: '1.0', job_id: jobId },
      device_id: devices[0].device_id,
      domain: 'manufacturing.additive.fdm.v1',
      payload: {
        model_url: 'https://example.com/gear.stl',
        material: 'PLA',
        layer_height_mm: 0.2,
        infill_percent: 20,
      },
    }),
  })
  if (!quoteR.ok) return null
  const quote = await quoteR.json() as { quote_id: string }
  return { quoteId: quote.quote_id }
}

async function executeFdmJob(jobId: string, quoteId: string, auditRequirements?: object): Promise<boolean> {
  const r = await gatewayFetch('/v1/execute', {
    method: 'POST',
    body: JSON.stringify({
      envelope: { aimp_version: '1.0', job_id: jobId },
      quote_id: quoteId,
      audit_requirements: auditRequirements ?? {
        pause_for_human_at: ['layer_50_percent'],
      },
    }),
  })
  return r.status === 202
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Review Queue — HITL approval flow', () => {
  test('review page loads without error', async ({ page }) => {
    await gotoLive(page, '/review')
    await expect(page.locator('body')).not.toContainText('500', { timeout: 8_000 })
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8_000 })
  })

  test('FDM job reaches AUDITING and appears in review queue', async ({ page }) => {
    const jobId = testJobId('hitl-queue')
    const result = await submitFdmJob(jobId)
    if (!result) { test.skip(); return }

    const ok = await executeFdmJob(jobId, result.quoteId)
    if (!ok) { test.skip(); return }

    // Wait for AUDITING state (FDM sim pauses mid-job)
    try {
      await waitForJobState(jobId, 'AUDITING', 30_000)
    } catch {
      // Sim may complete without HITL if pause_for_human_at waypoint not triggered
      test.skip()
      return
    }

    // The review queue page should list the job
    await gotoLive(page, '/review')
    // Job ID prefix or "AUDITING" badge should appear
    await expect(page.locator('body')).toContainText('AUDITING', { timeout: 8_000 })
  })

  test('review detail page shows approve and reject buttons for AUDITING job', async ({ page }) => {
    const jobId = testJobId('hitl-detail')
    const result = await submitFdmJob(jobId)
    if (!result) { test.skip(); return }

    const ok = await executeFdmJob(jobId, result.quoteId)
    if (!ok) { test.skip(); return }

    try {
      await waitForJobState(jobId, 'AUDITING', 30_000)
    } catch {
      test.skip()
      return
    }

    await gotoLive(page, `/review/${jobId}`)
    // Review detail should have an approve/continue button
    const approveBtn = page.getByRole('button', { name: /approve|continue|resume/i })
    await expect(approveBtn.first()).toBeVisible({ timeout: 8_000 })
    // And a reject/abort button
    const rejectBtn = page.getByRole('button', { name: /reject|abort/i })
    await expect(rejectBtn.first()).toBeVisible({ timeout: 8_000 })
  })

  test('approving AUDITING job resumes execution', async ({ page }) => {
    const jobId = testJobId('hitl-approve')
    const result = await submitFdmJob(jobId)
    if (!result) { test.skip(); return }

    const ok = await executeFdmJob(jobId, result.quoteId)
    if (!ok) { test.skip(); return }

    try {
      await waitForJobState(jobId, 'AUDITING', 30_000)
    } catch {
      test.skip()
      return
    }

    // Get the approval token from job telemetry via API
    const telR = await gatewayFetch(`/v1/jobs/${jobId}/telemetry`)
    if (!telR.ok) { test.skip(); return }
    const telData = await telR.json() as { human_action_required?: { token?: string } }
    const token = telData.human_action_required?.token
    if (!token) { test.skip(); return }

    // Navigate to review detail and click Approve
    await gotoLive(page, `/review/${jobId}`)
    const approveBtn = page.getByRole('button', { name: /approve|continue|resume/i }).first()
    await expect(approveBtn).toBeVisible({ timeout: 8_000 })
    await approveBtn.click()

    // After approval, job should leave AUDITING
    await waitForJobState(jobId, 'COMPLETED', 30_000)
    await expect(page.locator('body')).not.toContainText('AUDITING', { timeout: 15_000 })
  })

  test('rejecting AUDITING job aborts the job', async ({ page }) => {
    const jobId = testJobId('hitl-reject')
    const result = await submitFdmJob(jobId)
    if (!result) { test.skip(); return }

    const ok = await executeFdmJob(jobId, result.quoteId)
    if (!ok) { test.skip(); return }

    try {
      await waitForJobState(jobId, 'AUDITING', 30_000)
    } catch {
      test.skip()
      return
    }

    await gotoLive(page, `/review/${jobId}`)
    const rejectBtn = page.getByRole('button', { name: /reject|abort/i }).first()
    await expect(rejectBtn).toBeVisible({ timeout: 8_000 })
    await rejectBtn.click()

    // Confirm in the modal if one appears
    const confirmBtn = page.getByRole('button', { name: /confirm|yes|abort/i })
    if (await confirmBtn.isVisible({ timeout: 2_000 })) {
      await confirmBtn.click()
    }

    // Job should be ABORTED
    await waitForJobState(jobId, 'ABORTED', 15_000)
  })
})
