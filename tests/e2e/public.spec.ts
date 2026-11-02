import AxeBuilder from '@axe-core/playwright';
import { expect, PUBLIC_ROUTES, test } from './fixtures';

test.describe('public site', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`renders ${route} in Arabic RTL without console errors`, async ({ page, consoleErrors }) => {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('note').filter({ hasText: 'وضع تجريبي' })).toBeVisible();
      await page.waitForTimeout(500);
      expect(consoleErrors).toEqual([]);
    });
  }

  test('homepage has all eight content areas', async ({ page }) => {
    await page.goto('/');
    for (const name of ['مجلس الطلاب', 'إعلانات مهمّة', 'برنامج اليوم', 'دوري كرة القدم المدرسي', 'امتحانات البجروت القادمة', 'خصومات للطلاب', 'خدمات المدرسة', 'من نشاطات المجلس']) {
      await expect(page.getByRole('heading', { name, exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole('complementary', { name: 'لوحة اليوم' })).toBeVisible();
    // Provisional exams are labelled as such.
    await expect(page.getByText('مؤقّت — غير نهائي').first()).toBeVisible();
    // Empty states instead of invented content.
    // (Admin tests may already have published matches; either state is valid, invented data is not.)
    await expect(page.getByText('لم تُنشر مباريات بعد').or(page.locator('.match-row').first())).toBeVisible();
    await expect(page.getByText('لا توجد عروض فعّالة حاليًا')).toBeVisible();
  });

  test('main navigation and active state', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('link', { name: 'البجروت' }).click();
    await expect(page).toHaveURL(/\/bagrut$/);
    await expect(page.getByRole('navigation', { name: 'التنقل الرئيسي' }).getByRole('link', { name: 'البجروت' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'البرنامج اليومي' }).first().click();
    await expect(page.getByRole('heading', { name: 'البرنامج المدرسي اليومي' })).toBeVisible();
  });

  test('mobile menu opens, navigates and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: 'فتح القائمة' });
    await toggle.click();
    await expect(page.getByRole('button', { name: 'إغلاق القائمة' })).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('navigation', { name: 'القائمة' }).getByRole('link', { name: 'الدوري' }).click();
    await expect(page).toHaveURL(/\/league$/);
    await expect(page.getByRole('navigation', { name: 'القائمة' })).toBeHidden();
  });

  test('bagrut search, filters, preferences and calendar', async ({ page }) => {
    await page.goto('/bagrut');
    await page.getByLabel('القادمة فقط').uncheck();
    const rows = page.locator('.exam-row');
    const total = await rows.count();
    expect(total).toBe(18); // 10 written days + 5 English + 3 Hebrew window days
    await page.getByLabel(/بحث بالاسم/).fill('رياضيات');
    await expect(rows).toHaveCount(2);
    await page.getByLabel(/بحث بالاسم/).fill('');
    await page.getByLabel('نوع الامتحان').selectOption('oral');
    await expect(rows).toHaveCount(3);
    await page.getByLabel('نوع الامتحان').selectOption('');
    await page.getByLabel('المسار').selectOption('islamic_heritage');
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: 'مسح التصفية' }).click();
    await page.getByLabel('الصف', { exact: true }).selectOption('11');
    await page.reload();
    await expect(page.getByLabel('الصف', { exact: true })).toHaveValue('11');
    await page.getByRole('button', { name: 'تقويم' }).click();
    await expect(page.getByRole('grid')).toBeVisible();
    await expect(page.getByText('نافذة امتحان').first()).toBeHidden();
  });

  test('league views show honest empty states', async ({ page }) => {
    await page.goto('/league');
    for (const tab of ['القادمة', 'النتائج', 'جداول خروج المغلوب', 'الترتيب', 'الأبطال', 'البطولة النهائية']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    }
    await expect(page.getByText('مقترحة — بانتظار موافقة المدرسة')).toBeVisible();
  });

  test('verify page reports unknown codes and is noindex', async ({ page }) => {
    await page.goto('/verify?code=AAAAA-AAAAA-AAAAA-AAAAA');
    await expect(page.getByText('لم نعثر على شهادة بهذا الرمز')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('unknown routes show the 404 page', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { name: 'الصفحة غير موجودة' })).toBeVisible();
  });

  for (const route of ['/', '/bagrut', '/league', '/verify', '/admin']) {
    test(`no serious accessibility violations on ${route}`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('iframe').analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    });
  }
});
