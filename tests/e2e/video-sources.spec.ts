import { readFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { expect, loginAsAdmin, test } from './fixtures';

const EMPTY = 'لم يتم رفع برنامج المدرسة لهذا اليوم بعد';
const WEBM = readFileSync('tests/fixtures/schedule.webm');
type Win = Window & { __wraps?: number; __marker?: string };

/** Stand-ins for external hosts so the run is deterministic and offline-safe. */
async function stubExternalHosts(context: BrowserContext): Promise<void> {
  await context.route('https://media.example.test/**', (route) => route.fulfill({ status: 200, contentType: 'video/webm', body: WEBM }));
  await context.route('https://www.youtube-nocookie.com/embed/**', (route) => {
    const priv = route.request().url().includes('PRIVATE0000');
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><body style="margin:0;background:#111;color:#fff">youtube-stub<script>parent.postMessage(JSON.stringify(${priv ? "{event:'onError',info:100}" : "{event:'onReady',info:null}"}),'*')</script>`,
    });
  });
}

async function removeActive(page: Page): Promise<void> {
  await page.goto('/admin/program');
  const del = page.getByRole('button', { name: /حذف الفيديو الآن|إزالة الرابط الآن/ });
  const none = page.getByText('لا يوجد فيديو منشور لهذا اليوم');
  await expect(del.or(none)).toBeVisible(); // wait until the admin status has loaded
  if (await del.isVisible()) {
    await del.click();
    await page.getByRole('dialog').getByRole('button', { name: 'حذف الفيديو', exact: true }).click();
    await expect(page.getByText('لا يوجد فيديو منشور لهذا اليوم')).toBeVisible();
  }
}

async function publishLink(page: Page, url: string): Promise<void> {
  await page.goto('/admin/program');
  await page.getByLabel('إضافة رابط فيديو خارجي').check();
  await page.getByLabel('رابط الفيديو', { exact: true }).fill(url);
  await page.getByRole('button', { name: 'معاينة الرابط' }).click();
  const publish = page.getByRole('button', { name: /^نشر الرابط/ });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText('تم نشر رابط فيديو البرنامج اليومي').last()).toBeVisible();
}

test('/program autoplays muted with controls, loops at least 3 times, and restarts on re-entry', async ({ page, context }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/program');
  await page.getByLabel(/اختيار فيديو البرنامج|استبدال الفيديو/).setInputFiles('tests/fixtures/schedule.webm');
  await page.getByRole('button', { name: /رفع ونشر/ }).click();
  await expect(page.getByText('تم نشر فيديو البرنامج اليومي').last()).toBeVisible();

  const visitor = await context.newPage();
  await visitor.goto('/program');
  const v = visitor.locator('video.sv-video');
  await expect(v).toHaveJSProperty('muted', true);
  await expect(v).toHaveJSProperty('loop', true);
  await expect(v).toHaveJSProperty('controls', true);
  await expect.poll(() => v.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
  await v.evaluate((el: HTMLVideoElement) => {
    const w = window as Win;
    w.__wraps = 0;
    w.__marker = 'first-visit';
    let last = 0;
    el.addEventListener('timeupdate', () => {
      if (el.currentTime + 0.2 < last) w.__wraps = (w.__wraps ?? 0) + 1;
      last = el.currentTime;
    });
    (el as HTMLVideoElement & { __marker?: string }).__marker = 'first-visit';
  });
  // 2-second fixture: three full cycles within ~8 s, without any reload.
  await expect.poll(() => visitor.evaluate(() => (window as Win).__wraps ?? 0), { timeout: 20_000 }).toBeGreaterThanOrEqual(3);
  expect(await visitor.evaluate(() => (window as Win).__marker)).toBe('first-visit'); // same page, no reload

  // Leave and come back inside the app: a fresh player starting from the beginning.
  await visitor.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('link', { name: 'البجروت' }).click();
  await visitor.getByRole('link', { name: 'البرنامج اليومي' }).first().click();
  const again = visitor.locator('video.sv-video');
  await expect.poll(() => again.evaluate((el: HTMLVideoElement & { __marker?: string }) => el.__marker ?? 'new')).toBe('new');
  await expect.poll(() => again.evaluate((el: HTMLVideoElement) => !el.paused)).toBe(true);
  expect(await again.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeLessThan(1.9);

  await removeActive(page);
  await expect(visitor.getByText(EMPTY)).toBeVisible();
});

test('external direct link: preview, publish, live on /display, replaced by YouTube embed, removed at once', async ({ page, context }) => {
  await stubExternalHosts(context);
  await loginAsAdmin(page);
  await removeActive(page);
  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto('/display');
  await expect(tv.getByText(EMPTY)).toBeVisible();

  // Rejected links explain why in Arabic and cannot be published.
  await page.goto('/admin/program');
  await page.getByLabel('إضافة رابط فيديو خارجي').check();
  for (const [url, msg] of [
    ['https://dsp.shahaf.info/Pages/Display.aspx?id=b5134001&dev=50295367', /dsp\.shahaf\.info/],
    ['http://media.example.test/a.mp4', /https/],
    ['https://example.org/page.html', /YouTube أو Vimeo/],
  ] as const) {
    await page.getByLabel('رابط الفيديو', { exact: true }).fill(url);
    await page.getByRole('button', { name: 'معاينة الرابط' }).click();
    await expect(page.getByRole('alert').filter({ hasText: msg })).toBeVisible();
    await expect(page.getByRole('button', { name: /^نشر الرابط/ })).toBeDisabled();
  }
  // A private / unavailable YouTube video: the provider error is shown and publishing stays disabled.
  await page.getByLabel('رابط الفيديو', { exact: true }).fill('https://youtu.be/PRIVATE0000');
  await page.getByRole('button', { name: 'معاينة الرابط' }).click();
  await expect(page.getByText('فيديو YouTube غير موجود أو خاص أو محذوف.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^نشر الرابط/ })).toBeDisabled();

  // Direct WebM link → native player on the open TV, no reload.
  await publishLink(page, 'https://media.example.test/program/today.webm');
  await expect(page.getByText('رابط خارجي — رابط فيديو مباشر')).toBeVisible();
  const tvVideo = tv.locator('video.sv-video');
  await expect(tvVideo).toHaveAttribute('src', 'https://media.example.test/program/today.webm');
  await expect.poll(async () => (await tvVideo.evaluate((el: HTMLVideoElement) => !el.paused)) || (await tv.getByRole('button', { name: 'تشغيل البرنامج' }).count()) > 0).toBe(true);
  await expect(tv.locator('.tv-video-heading time')).toBeVisible();

  // Replace with YouTube → official embed with muted autoplay + loop, on both pages.
  await publishLink(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  const frame = tv.locator('iframe.sv-embed');
  await expect(frame).toHaveAttribute('src', /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*autoplay=1.*mute=1.*loop=1.*playlist=dQw4w9WgXcQ/);
  await expect(tvVideo).toHaveCount(0);
  const visitor = await context.newPage();
  await visitor.goto('/program');
  await expect(visitor.locator('iframe.sv-embed')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*controls=1/);
  await expect(visitor.locator('iframe[src*="shahaf"]')).toHaveCount(0);

  // Removal reaches every open page immediately.
  await page.goto('/admin/program');
  await page.getByRole('button', { name: 'إزالة الرابط الآن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'حذف الفيديو', exact: true }).click();
  await expect(tv.getByText(EMPTY)).toBeVisible();
  await expect(visitor.getByText(EMPTY)).toBeVisible();
});

test('Bagrut shows Hebrew names and questionnaire status, searchable in Hebrew', async ({ page }) => {
  await page.goto('/bagrut');
  await page.getByLabel(/بحث بالاسم/).fill('מתמטיקה');
  const rows = page.locator('article.exam-row');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first().getByRole('heading', { name: 'الرياضيات' })).toBeVisible();
  await expect(rows.first().locator('.exam-he')).toHaveText('מתמטיקה');
  await expect(rows.first().locator('.exam-qn')).toContainText('מספר שאלון');
  await expect(rows.first().locator('.exam-qn')).toContainText('بانتظار التحقّق');
});
