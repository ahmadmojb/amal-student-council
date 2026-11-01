import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, loginAsAdmin, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

test('wrong PIN is rejected', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('رمز الدخول').fill('wrong-pin');
  await page.getByRole('button', { name: 'دخول' }).click();
  await expect(page.getByText('الرمز غير صحيح.')).toBeVisible();
});

test('announcement: validate, preview, publish, appears publicly, delete with confirmation', async ({ page, context }) => {
  await loginAsAdmin(page);
  await page.getByRole('link', { name: 'الإعلانات', exact: true }).click();
  await page.getByRole('button', { name: 'إضافة إعلان' }).click();
  await page.getByRole('button', { name: 'حفظ ونشر' }).click();
  await expect(page.getByText('هذا الحقل مطلوب').first()).toBeVisible();

  const title = `اختبار إعلان ${Date.now()}`;
  await page.getByLabel('العنوان').fill(title);
  await page.getByLabel('نص الإعلان').fill('هذا إعلان تجريبي من اختبار آلي.');
  await page.getByLabel('الأولوية').selectOption('urgent');
  await page.getByRole('button', { name: 'معاينة' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'حفظ ونشر' }).click();
  await expect(page.getByText('تم نشر إعلان.').last()).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/admin-announcements.png', fullPage: true });

  const pub = await context.newPage();
  await pub.goto('/');
  await expect(pub.getByRole('heading', { name: title })).toBeVisible();
  await expect(pub.getByText('إعلان عاجل')).toBeVisible();

  // Real-time: unpublishing removes it from the open public page without reload.
  await page.getByRole('row', { name: new RegExp(title) }).getByRole('button', { name: 'إلغاء النشر' }).click();
  await expect(pub.getByRole('heading', { name: title })).toBeHidden();

  await page.getByRole('button', { name: new RegExp(`حذف ${title.slice(0, 20)}`) }).click();
  await expect(page.getByRole('dialog', { name: 'حذف إعلان' })).toBeVisible();
  await page.getByRole('button', { name: 'حذف نهائي' }).click();
  await expect(page.getByText('تم الحذف.').last()).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(title) })).toHaveCount(0);
});

test('league: teams, bracket, results, public bracket', async ({ page, context }) => {
  await loginAsAdmin(page);
  await page.getByRole('link', { name: 'الدوري', exact: true }).click();
  for (const n of ['1', '2', '3']) {
    await page.getByRole('button', { name: 'إضافة فريق' }).click();
    await page.getByLabel('الصف/الشعبة').fill(`12/${n}`);
    await page.getByLabel('المرحلة').selectOption('12');
    await page.getByLabel('اسم الفريق المعروض').fill(`فريق تجريبي 12/${n}`);
    await page.getByRole('button', { name: 'حفظ ونشر' }).click();
    await expect(page.getByText('تم نشر فريق.').last()).toBeVisible();
  }
  await page.getByRole('tab', { name: 'إنشاء الجداول' }).click();
  await page.getByRole('button', { name: 'الصف 12' }).click();
  await page.getByRole('button', { name: /إنشاء الجدول|استبدال الجدول الحالي/ }).click();
  if (await page.getByRole('button', { name: 'حذف وإنشاء من جديد' }).isVisible()) await page.getByRole('button', { name: 'حذف وإنشاء من جديد' }).click();
  await expect(page.getByText(/تم إنشاء جدول الصف 12/).last()).toBeVisible();

  await page.getByRole('tab', { name: 'المباريات والنتائج' }).click();
  await page.getByRole('button', { name: 'الصف 12' }).click();
  await page.getByRole('button', { name: 'نشر كل مباريات هذه المرحلة' }).click();
  await page.getByRole('button', { name: 'النتيجة' }).first().click();
  await page.getByLabel('حالة المباراة').selectOption('completed');
  await page.locator('#rs-home').fill('2');
  await page.locator('#rs-away').fill('1');
  await page.getByRole('button', { name: 'حفظ النتيجة' }).click();
  await expect(page.getByText('تم حفظ النتيجة.').last()).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/admin-league-matches.png', fullPage: true });

  const pub = await context.newPage();
  await pub.goto('/league?view=bracket&grade=12');
  await expect(pub.getByLabel('جدول خروج المغلوب — الصف 12')).toBeVisible();
  await expect(pub.locator('.bracket-team.won')).not.toHaveCount(0);
  await pub.screenshot({ path: 'test-results/screens/league-bracket.png', fullPage: true });
  await pub.goto('/league?view=results');
  await expect(pub.locator('.match-row').first()).toContainText('2');
});

test('certificate: issue, print preview, verify, revoke', async ({ page, context }) => {
  await loginAsAdmin(page);
  await page.getByRole('link', { name: 'الشهادات', exact: true }).click();
  await page.getByLabel('اسم الطالب/ة').fill('سلمى محمد');
  await page.getByLabel('النشاط').fill('يوم القراءة المدرسي');
  await expect(page.locator('.cert-name')).toHaveText('سلمى محمد');
  await page.getByRole('button', { name: 'إصدار الشهادة' }).click();
  const code = (await page.locator('.cert-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
  await expect(page.locator('.cert-qr svg')).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/admin-certificate.png', fullPage: true });

  // Real exported PDF via the browser print pipeline (Arabic shaping by the browser).
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true });
  expect(pdf.byteLength).toBeGreaterThan(10_000);
  mkdirSync('test-results/screens', { recursive: true });
  writeFileSync('test-results/screens/certificate.pdf', pdf);
  await page.emulateMedia({ media: 'screen' });

  const pub = await context.newPage();
  await pub.goto(`/verify?code=${code}`);
  await expect(pub.getByText('شهادة صحيحة')).toBeVisible();
  await pub.screenshot({ path: 'test-results/screens/verify-valid.png', fullPage: true });
  await expect(pub.getByText('سلمى محمد')).toBeVisible();

  await page.getByRole('row', { name: /سلمى محمد/ }).getByRole('button', { name: 'إلغاء' }).click();
  await page.getByRole('button', { name: 'إلغاء الشهادة' }).click();
  await pub.reload();
  await expect(pub.getByText('هذه الشهادة ملغاة')).toBeVisible();
});

test('logout ends the session', async ({ page }) => {
  await loginAsAdmin(page);
  await page.getByRole('button', { name: 'خروج' }).click();
  await expect(page.getByLabel('رمز الدخول')).toBeVisible();
  const res = await page.request.get('/api/admin/overview', { headers: { 'x-amal-request': '1' } });
  expect(res.status()).toBe(401);
});
