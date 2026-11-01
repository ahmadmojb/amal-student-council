import { expect, loginAsAdmin, test } from './fixtures';
import { formatDateOnly, todayInSchool, weekdayOf } from '../../shared/dates';

const EMPTY = 'لم يتم رفع برنامج المدرسة لهذا اليوم بعد';
const label = () => {
  const d = todayInSchool(new Date());
  return `يوم ${weekdayOf(d)} | ${formatDateOnly(d, { weekday: false })}`;
};

test('admin uploads the daily video; /program and an open /display update live; delete restores the empty state', async ({ page, context }) => {
  // Open the TV first so the update has to arrive through the live subscription.
  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto('/display');
  await expect(tv.getByText(EMPTY)).toBeVisible();

  await loginAsAdmin(page);
  await page.goto('/admin/program');
  await expect(page.getByRole('heading', { name: /إدارة فيديو البرنامج المدرسي اليومي/ })).toBeVisible();

  // Invalid file: rejected in the browser with an Arabic message.
  await page.getByLabel('اختيار فيديو البرنامج').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText('صيغة غير مدعومة')).toBeVisible();
  const uploadBtn = page.getByRole('button', { name: 'رفع ونشر الفيديو' });
  await expect(uploadBtn).toBeDisabled();

  // Valid WebM: preview must load, then upload with progress.
  await page.getByLabel('اختيار فيديو البرنامج').setInputFiles('tests/fixtures/schedule.webm');
  await expect(page.locator('.sv-admin-preview video')).toBeVisible();
  await expect(uploadBtn).toBeEnabled();
  await uploadBtn.click();
  await expect(page.getByText('تم نشر فيديو البرنامج اليومي').last()).toBeVisible();
  await expect(page.getByText('منشور لجميع الزوار')).toBeVisible();
  await expect(page.getByText('(منتصف الليل في نهاية اليوم)')).toBeVisible();

  // TV: updated without reload, correct heading + date, muted looping inline autoplay.
  await expect(tv.getByRole('heading', { name: 'البرنامج المدرسي اليومي' })).toBeVisible();
  await expect(tv.locator('.tv-video-heading time')).toHaveText(label());
  const tvVideo = tv.locator('video.sv-video');
  await expect(tvVideo).toHaveJSProperty('muted', true);
  await expect(tvVideo).toHaveJSProperty('loop', true);
  await expect(tvVideo).toHaveAttribute('playsinline', '');
  // Either autoplay works, or the fallback play button is offered.
  await expect
    .poll(async () => (await tvVideo.evaluate((v: HTMLVideoElement) => !v.paused)) || (await tv.getByRole('button', { name: 'تشغيل البرنامج' }).count()) > 0)
    .toBe(true);
  await expect(tv.getByRole('navigation')).toHaveCount(0);
  // The video stays below the header and inside the screen.
  const top = await tv.locator('.tv-top').boundingBox();
  const frame = await tv.locator('.tv-video .sv-frame').boundingBox();
  expect(frame && top && frame.y >= top.y + top.height && frame.y + frame.height <= 1080).toBe(true);
  expect(await tv.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await tv.screenshot({ path: 'test-results/screens/display-video-1920x1080.png' });

  // /program shows the same video with the same date.
  const visitor = await context.newPage();
  await visitor.goto('/program');
  await expect(visitor.locator('.sv-date time')).toHaveText(label());
  const src = await tvVideo.getAttribute('src');
  await expect(visitor.locator('video.sv-video')).toHaveAttribute('src', src ?? '');
  await expect(visitor.locator('iframe')).toHaveCount(0);
  await visitor.screenshot({ path: 'test-results/screens/program-video.png' });

  // Manual delete: both pages switch to the empty state live.
  await page.getByRole('button', { name: 'حذف الفيديو الآن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'حذف الفيديو', exact: true }).click();
  await expect(tv.getByText(EMPTY)).toBeVisible();
  await expect(visitor.getByText(EMPTY)).toBeVisible();
});

test('TV falls back to a play button when autoplay is blocked', async ({ page, context }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/program');
  await page.getByLabel(/اختيار فيديو البرنامج|استبدال الفيديو/).setInputFiles('tests/fixtures/schedule.webm');
  await page.getByRole('button', { name: /رفع ونشر/ }).click();
  await expect(page.getByText('تم نشر فيديو البرنامج اليومي').last()).toBeVisible();

  const tv = await context.newPage();
  await tv.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    };
  });
  await tv.goto('/display');
  await expect(tv.getByRole('button', { name: 'تشغيل البرنامج' })).toBeVisible();

  await page.getByRole('button', { name: 'حذف الفيديو الآن' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'حذف الفيديو', exact: true }).click();
  await expect(tv.getByText(EMPTY)).toBeVisible();
});
