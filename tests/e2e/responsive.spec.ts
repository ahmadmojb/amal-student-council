import { mkdirSync } from 'node:fs';
import { expect, noHorizontalOverflow, PUBLIC_ROUTES, test } from './fixtures';

const VIEWPORTS = [
  [375, 812],
  [390, 844],
  [768, 1024],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
] as const;

mkdirSync('test-results/screens', { recursive: true });

for (const [w, h] of VIEWPORTS) {
  test(`no horizontal overflow at ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const route of [...PUBLIC_ROUTES, '/admin']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      expect(await noHorizontalOverflow(page), `${route} overflows at ${w}px`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/screens/${w}x${h}${route === '/' ? '-home' : route.replace(/\//g, '-')}.png`, fullPage: true });
    }
  });
}
