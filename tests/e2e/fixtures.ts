import { test as base, expect, type Page } from '@playwright/test';

export const ADMIN_PIN = 'e2e-admin-pin-2026';
export const PUBLIC_ROUTES = ['/', '/program', '/league', '/bagrut', '/benefits', '/services', '/activities', '/verify'];

/** Collects console errors from our own origin. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const url = msg.location().url ?? '';
      errors.push(`${msg.text()} @ ${url}`);
    });
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    await provide(errors);
  },
});
export { expect };

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin');
  await page.getByLabel('رمز الدخول').fill(ADMIN_PIN);
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByRole('heading', { name: 'نظرة عامة' })).toBeVisible();
}

export async function noHorizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
