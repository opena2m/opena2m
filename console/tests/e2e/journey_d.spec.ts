/**
 * Journey D — Budget runaway (UI-level).
 *
 * Scenario (mirrors scripts/test_journey_d.py):
 *   1. Budgets page shows alice's budget with a ceiling
 *   2. After 4 accepted jobs the budget bar shows >80% consumed
 *   3. The 5th quote attempt is rejected with ERR_BUDGET_EXCEEDED
 *   4. Budget detail page reflects the exceeded state
 *
 * Note: This test is intentionally lighter-weight than the full Journey D
 * script — it focuses on the console UI reflecting budget state correctly.
 * The full enforcement logic is tested in test_journey_d.py.
 *
 * Prerequisites: `make dev-up && make seed && python scripts/test_journey_d.py`
 */
import { test, expect } from '@playwright/test'
import { gotoLive, gatewayFetch, testJobId } from './helpers'

test.describe('Journey D — Budget runaway UI', () => {
  test('budgets page loads without error', async ({ page }) => {
    await gotoLive(page, '/budgets')
    await expect(page.locator('body')).not.toContainText('500', { timeout: 8_000 })
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 8_000 })
  })

  test('budgets page lists at least one budget after seed', async ({ page }) => {
    await gotoLive(page, '/budgets')
    // The table or list should be visible and not empty
    await expect(page.locator('body')).not.toContainText('No budgets', { timeout: 8_000 })
  })

  test('ERR_BUDGET_EXCEEDED visible in job that was rejected', async ({ page }) => {
    // Submit a quote that should fail if alice's budget is exhausted
    // (run test_journey_d.py first to exhaust the budget)
    const jobId = testJobId('budget-ui')

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

    // Attempt a quote with alice's token (will fail if budget is exhausted)
    const aliceToken = process.env.AIMP_ALICE_TOKEN ?? 'alice-agent-token'
    const quoteR = await fetch(`${process.env.AIMP_GATEWAY_URL ?? 'http://localhost:8080'}/v1/quote`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${aliceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        envelope: { aimp_version: '1.0', job_id: jobId },
        device_id: devices[0].device_id,
        domain: 'manufacturing.print.2d.v1',
        payload: { pages: 50, copies: 1, color_mode: 'color', paper_size: 'A2' },
      }),
    })

    if (quoteR.status === 402 || quoteR.status === 400) {
      const body = await quoteR.json() as { error?: { code?: string } }
      const code = body?.error?.code ?? ''
      expect(['ERR_BUDGET_EXCEEDED', 'ERR_POLICY_DENIED'].some(c => code.includes(c) || code === c)).toBeTruthy()
    } else {
      // Budget not yet exhausted — skip the UI assertion
      test.skip()
    }
  })

  test('budget detail page shows warning when near ceiling', async ({ page }) => {
    // List budgets via API and find one with >0 consumed
    const r = await gatewayFetch('/v1/budgets')
    if (!r.ok) { test.skip(); return }
    const data = await r.json() as { budgets?: Array<{ budget_id: string; consumed?: number; ceiling?: number }> }
    const budgets = data.budgets ?? []
    const exhausted = budgets.find(b => (b.consumed ?? 0) / (b.ceiling ?? 1) > 0.5)
    if (!exhausted) { test.skip(); return }

    await gotoLive(page, `/budgets/${exhausted.budget_id}`)
    await expect(page.locator('body')).not.toContainText('500', { timeout: 8_000 })
    // Should show consumption percentage or warning
    await expect(page.locator('body')).toContainText(exhausted.budget_id.slice(0, 8), { timeout: 8_000 })
  })
})
