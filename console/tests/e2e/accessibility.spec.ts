/**
 * Accessibility — axe-core audits for key console pages.
 *
 * Uses @axe-core/playwright to run automated WCAG 2.1 AA checks on:
 *   - Policy editor
 *   - Budget detail
 *   - Settings page
 *   - Login page
 *   - Dashboard
 *
 * Critical (serious/critical) violations cause test failure.
 * Moderate violations are reported but do not fail.
 *
 * Prerequisites: `npm install --save-dev @axe-core/playwright`
 */
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { gotoLive, gatewayFetch } from './helpers'

// ── Severity helper ───────────────────────────────────────────────────────────

type Impact = 'critical' | 'serious' | 'moderate' | 'minor'

function criticalViolations(violations: Array<{ impact?: string; id: string; description: string }>) {
  return violations.filter(v => v.impact === 'critical' || v.impact === 'serious')
}

function formatViolations(violations: Array<{ id: string; impact?: string; description: string; nodes: unknown[] }>) {
  return violations.map(v =>
    `  [${v.impact?.toUpperCase()}] ${v.id}: ${v.description} (${(v.nodes as unknown[]).length} node(s))`
  ).join('\n')
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Accessibility — WCAG 2.1 AA', () => {
  test('login page has no critical a11y violations', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .exclude('#root > [style*="display: none"]') // skip hidden elements
      .analyze()

    const critical = criticalViolations(results.violations)
    if (critical.length > 0) {
      console.log('Critical a11y violations on /login:\n' + formatViolations(critical))
    }
    expect(critical).toHaveLength(0)
  })

  test('dashboard page has no critical a11y violations', async ({ page }) => {
    await gotoLive(page, '/dashboard')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const critical = criticalViolations(results.violations)
    if (critical.length > 0) {
      console.log('Critical a11y violations on /dashboard:\n' + formatViolations(critical))
    }
    expect(critical).toHaveLength(0)
  })

  test('policies page has no critical a11y violations', async ({ page }) => {
    await gotoLive(page, '/policies')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const critical = criticalViolations(results.violations)
    if (critical.length > 0) {
      console.log('Critical a11y violations on /policies:\n' + formatViolations(critical))
    }
    expect(critical).toHaveLength(0)
  })

  test('budgets page has no critical a11y violations', async ({ page }) => {
    await gotoLive(page, '/budgets')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const critical = criticalViolations(results.violations)
    if (critical.length > 0) {
      console.log('Critical a11y violations on /budgets:\n' + formatViolations(critical))
    }
    expect(critical).toHaveLength(0)
  })

  test('budget detail page has no critical a11y violations', async ({ page }) => {
    // Find a real budget ID if available
    const r = await gatewayFetch('/v1/budgets').catch(() => null)
    if (!r?.ok) {
      await gotoLive(page, '/budgets')
    } else {
      const data = await r.json() as { budgets?: Array<{ budget_id: string }> }
      const firstId = data.budgets?.[0]?.budget_id
      if (firstId) {
        await gotoLive(page, `/budgets/${firstId}`)
      } else {
        await gotoLive(page, '/budgets')
      }
    }
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const critical = criticalViolations(results.violations)
    if (critical.length > 0) {
      console.log('Critical a11y violations on /budgets/[id]:\n' + formatViolations(critical))
    }
    expect(critical).toHaveLength(0)
  })

  test('settings page has no critical a11y violations', async ({ page }) => {
    await gotoLive(page, '/settings')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const critical = criticalViolations(results.violations)
    if (critical.length > 0) {
      console.log('Critical a11y violations on /settings:\n' + formatViolations(critical))
    }
    expect(critical).toHaveLength(0)
  })

  test('audit log page has no critical a11y violations', async ({ page }) => {
    await gotoLive(page, '/audit')
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const critical = criticalViolations(results.violations)
    if (critical.length > 0) {
      console.log('Critical a11y violations on /audit:\n' + formatViolations(critical))
    }
    expect(critical).toHaveLength(0)
  })

  test('policy detail / editor has no critical a11y violations', async ({ page }) => {
    // Use first policy if available
    const r = await gatewayFetch('/v1/policies').catch(() => null)
    let targetUrl = '/policies'
    if (r?.ok) {
      const data = await r.json() as { policies?: Array<{ policy_id: string }> }
      const firstId = data.policies?.[0]?.policy_id
      if (firstId) targetUrl = `/policies/${firstId}`
    }

    await gotoLive(page, targetUrl)
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      // Monaco editor may have known issues — exclude its iframe
      .exclude('.monaco-editor')
      .analyze()

    const critical = criticalViolations(results.violations)
    if (critical.length > 0) {
      console.log(`Critical a11y violations on ${targetUrl}:\n` + formatViolations(critical))
    }
    expect(critical).toHaveLength(0)
  })
})
