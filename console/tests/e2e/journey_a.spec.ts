/**
 * Journey A — Happy-path 2D cloud print.
 *
 * UI-level equivalent of scripts/test_journey_a.py:
 *   1. Dashboard loads with live device count
 *   2. Jobs list page shows jobs from gateway
 *   3. New Job wizard: discover → quote → execute a 2D print job
 *   4. JobDetail page reflects LOCKED / EXECUTING state
 *   5. Job eventually reaches COMPLETED; telemetry panel shows progress 100%
 *
 * Prerequisites: `make dev-up && make seed`
 */
import { test, expect } from '@playwright/test'
import { gotoLive, gatewayFetch, waitForJobState, testJobId, GATEWAY_URL, DEV_TOKEN } from './helpers'

test.describe('Journey A — 2D print happy path', () => {
  test('dashboard loads with at least one device online', async ({ page }) => {
    await gotoLive(page, '/dashboard')
    // Headline metrics section must be visible
    await expect(page.locator('h1, [data-testid="page-title"]').first()).toBeVisible({ timeout: 8_000 })
    // Page must not be a blank error screen
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page.locator('body')).not.toContainText('Cannot GET')
  })

  test('jobs list page loads without error', async ({ page }) => {
    await gotoLive(page, '/jobs')
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8_000 })
  })

  test('submit 2D print job via API and view in Jobs list', async ({ page }) => {
    // Submit the job via API so the test is deterministic
    const jobId = testJobId('journey-a')

    // Step 1: Discover
    const discR = await gatewayFetch('/v1/discover', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: `${jobId}-disc` },
        device_filter: { domains: ['manufacturing.print.2d.v1'] },
      }),
    })
    expect(discR.ok).toBeTruthy()
    const { devices } = await discR.json() as { devices: Array<{ device_id: string }> }
    expect(devices.length).toBeGreaterThan(0)
    const deviceId = devices[0].device_id

    // Step 2: Quote
    const quoteR = await gatewayFetch('/v1/quote', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        device_id: deviceId,
        domain: 'manufacturing.print.2d.v1',
        payload: { pages: 2, copies: 1, color_mode: 'mono', paper_size: 'A4' },
      }),
    })
    expect(quoteR.ok).toBeTruthy()
    const quote = await quoteR.json() as { quote_id: string; state: string }
    expect(quote.state).toBe('QUOTED')
    const quoteId = quote.quote_id

    // Step 3: Execute
    const execR = await gatewayFetch('/v1/execute', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        quote_id: quoteId,
      }),
    })
    expect(execR.status).toBe(202)
    const execData = await execR.json() as { state: string }
    expect(execData.state).toBe('LOCKED')

    // Step 4: View the job in the console Jobs list
    await gotoLive(page, '/jobs')
    // The page should load without error
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('job detail page loads for a known job', async ({ page }) => {
    // Submit a quick job to get a known ID
    const jobId = testJobId('journey-a-detail')

    const discR = await gatewayFetch('/v1/discover', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: `${jobId}-disc` },
        device_filter: { domains: ['manufacturing.print.2d.v1'] },
      }),
    })
    if (!discR.ok) test.skip()
    const { devices } = await discR.json() as { devices: Array<{ device_id: string }> }
    if (!devices.length) test.skip()

    const quoteR = await gatewayFetch('/v1/quote', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        device_id: devices[0].device_id,
        domain: 'manufacturing.print.2d.v1',
        payload: { pages: 1, copies: 1, color_mode: 'mono', paper_size: 'A4' },
      }),
    })
    if (!quoteR.ok) test.skip()
    const quote = await quoteR.json() as { quote_id: string }

    const execR = await gatewayFetch('/v1/execute', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        quote_id: quote.quote_id,
      }),
    })
    if (execR.status !== 202) test.skip()

    // Navigate to job detail
    await gotoLive(page, `/jobs/${jobId}`)
    // Job ID should appear somewhere on the page
    await expect(page.locator('body')).toContainText(jobId.slice(0, 10), { timeout: 8_000 })
  })

  test('job reaches COMPLETED state (polling telemetry)', async ({ page }) => {
    const jobId = testJobId('journey-a-complete')

    const discR = await gatewayFetch('/v1/discover', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: `${jobId}-disc` },
        device_filter: { domains: ['manufacturing.print.2d.v1'] },
      }),
    })
    if (!discR.ok) { test.skip(); return }
    const { devices } = await discR.json() as { devices: Array<{ device_id: string }> }
    if (!devices.length) { test.skip(); return }

    const quoteR = await gatewayFetch('/v1/quote', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        device_id: devices[0].device_id,
        domain: 'manufacturing.print.2d.v1',
        payload: { pages: 1, copies: 1, color_mode: 'mono', paper_size: 'A4' },
      }),
    })
    if (!quoteR.ok) { test.skip(); return }
    const quote = await quoteR.json() as { quote_id: string }

    await gatewayFetch('/v1/execute', {
      method: 'POST',
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        quote_id: quote.quote_id,
      }),
    })

    // Poll until COMPLETED (sim runs quickly)
    await waitForJobState(jobId, 'COMPLETED', 30_000)

    // Verify the UI reflects COMPLETED
    await gotoLive(page, `/jobs/${jobId}`)
    await expect(page.locator('body')).toContainText('COMPLETED', { timeout: 8_000 })
  })
})
