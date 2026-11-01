import { useEffect, useState } from 'react';
import { RefreshCcw, ScrollText } from 'lucide-react';
import type { AdminOverview, AuditRow } from '../../../shared/api-types';
import { siteSettingsInput, type SiteSettings } from '../../../shared/schemas';
import { formatTimestamp } from '../../../shared/dates';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../components/ui/toast';
import { SkeletonLines } from '../../components/ui/states';
import { FormFields, issuesToErrors, type FieldErrors, type FormValues } from './FormFields';
import { ScheduleNoticesAdmin } from './sections';
import { ScheduleVideoAdmin } from './ScheduleVideoAdmin';

const ACTION_LABEL: Record<string, string> = {
  login: 'تسجيل دخول',
  'login-failed': 'محاولة دخول فاشلة',
  logout: 'تسجيل خروج',
  create: 'إنشاء',
  update: 'تعديل',
  'update+published': 'تعديل ونشر',
  'update+draft': 'تعديل (مسودة)',
  'update+archived': 'تعديل وأرشفة',
  published: 'نشر',
  draft: 'إلغاء نشر',
  archived: 'أرشفة',
  delete: 'حذف',
  result: 'إدخال نتيجة',
  'result-correction+reset': 'تصحيح نتيجة مع إعادة ضبط أدوار لاحقة',
  'bracket-create': 'إنشاء جدول',
  'bracket-replace': 'استبدال جدول',
  'final-create': 'إنشاء البطولة النهائية',
  'certificate-issue': 'إصدار شهادة',
  'certificate-revoke': 'إلغاء شهادة',
  upload: 'رفع ملف',
  republish: 'إعادة بناء البيانات العامة',
  'schedule-video-upload': 'رفع فيديو البرنامج',
  'schedule-video-replace': 'استبدال فيديو البرنامج',
  'schedule-video-deleted': 'حذف فيديو البرنامج',
  'schedule-video-expired': 'انتهاء فيديو البرنامج تلقائيًا',
};

export function useOverview() {
  const [data, setData] = useState<AdminOverview | null>(null);
  useEffect(() => {
    api<AdminOverview>('/api/admin/overview')
      .then(setData)
      .catch(() => undefined);
  }, []);
  return data;
}

/** Daily schedule video + council notices for the daily program. */
export function ProgramAdmin() {
  return (
    <div className="stack">
      <div className="admin-head">
        <div>
          <h1>البرنامج اليومي</h1>
          <p className="muted small">ارفع فيديو البرنامج المدرسي لكل يوم. يظهر لجميع الزوار وعلى شاشات الممرّ، ويُحذف تلقائيًا عند منتصف الليل.</p>
        </div>
      </div>
      <ScheduleVideoAdmin />
      <ScheduleNoticesAdmin nested />
    </div>
  );
}

export function SettingsAdmin() {
  const toast = useToast();
  const [values, setValues] = useState<FormValues | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const overview = useOverview();

  useEffect(() => {
    api<SiteSettings>('/api/admin/settings')
      .then(({ updatedAt: _u, ...rest }) => setValues(rest))
      .catch(() => toast('error', 'تعذّر تحميل الإعدادات.'));
    api<AuditRow[]>('/api/admin/audit')
      .then(setAudit)
      .catch(() => setAudit([]));
  }, [toast]);

  const save = async () => {
    const parsed = siteSettingsInput.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await api('/api/admin/settings', { method: 'PUT', json: parsed.data });
      toast('success', 'تم حفظ الإعدادات.');
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّر الحفظ.');
    } finally {
      setBusy(false);
    }
  };

  const republish = async () => {
    setBusy(true);
    try {
      const r = await api<{ published: number }>('/api/admin/republish', { method: 'POST' });
      toast('success', `أُعيد بناء البيانات العامة (${r.published} سجلًا منشورًا).`);
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّرت العملية.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="admin-head">
        <div>
          <h1>الإعدادات والنظام</h1>
          <p className="muted small">إعدادات الموقع العامة، صيانة البيانات، وسجلّ العمليات الإدارية.</p>
        </div>
      </div>

      <section className="panel panel-pad stack">
        <h2 className="admin-subtitle">إعدادات الموقع</h2>
        {!values ? (
          <SkeletonLines count={3} />
        ) : (
          <>
            <FormFields
              fields={[
                { kind: 'textarea', name: 'welcomeMessage', label: 'رسالة الترحيب في الصفحة الرئيسية', rows: 2 },
                { kind: 'media', name: 'logoUrl', label: 'الشعار المعتمد للمدرسة/المجلس', hint: 'اتركه فارغًا لاستخدام الشعار النصّي المؤقّت.' },
                { kind: 'links', name: 'officialLinks', label: 'روابط رسمية في أسفل الصفحة', hint: 'أضف فقط روابط رسمية مؤكّدة.' },
                { kind: 'number', name: 'displayRotationSeconds', label: 'مدة عرض كل إعلان على شاشة الممرّ (ثوانٍ)', min: 5, max: 120 },
              ]}
              values={values}
              errors={errors}
              onChange={(n, v) => setValues((s) => ({ ...(s ?? {}), [n]: v }))}
            />
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy} style={{ justifySelf: 'start' }}>
              حفظ الإعدادات
            </button>
          </>
        )}
      </section>

      <section className="panel panel-pad stack">
        <h2 className="admin-subtitle">النظام</h2>
        {overview ? (
          <dl className="meta-list">
            <div>
              <dt>وضع التشغيل</dt>
              <dd>{overview.mode === 'demo' ? 'تجريبي — بيانات محلية على هذا الخادم فقط' : 'إنتاج — Firebase Realtime Database'}</dd>
            </div>
            {overview.usingDemoPin ? (
              <div>
                <dt>تنبيه</dt>
                <dd className="danger-text">يُستخدم رمز الدخول التجريبي. عيّن ADMIN_PIN قبل أي استخدام حقيقي.</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <p className="small muted">تحذف إعادة البناء من البيانات العامة كل ما انتهت صلاحيته أو أُلغي نشره، وتُعيد نسخ المنشور فقط. تعمل تلقائيًا كل يوم.</p>
        <button type="button" className="btn" onClick={republish} disabled={busy} style={{ justifySelf: 'start' }}>
          <RefreshCcw aria-hidden="true" /> إعادة بناء البيانات العامة الآن
        </button>
      </section>

      <section className="stack">
        <h2 className="admin-subtitle">
          <ScrollText aria-hidden="true" /> سجلّ العمليات (آخر 200)
        </h2>
        {!audit ? (
          <SkeletonLines count={3} height={40} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">الوقت</th>
                  <th scope="col">العملية</th>
                  <th scope="col">القسم</th>
                  <th scope="col">التفاصيل</th>
                  <th scope="col">الجهاز</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="xsmall nowrap">{formatTimestamp(a.at)}</td>
                    <td className={a.action === 'login-failed' ? 'danger-text' : undefined}>{ACTION_LABEL[a.action] ?? a.action}</td>
                    <td className="xsmall">{a.collection ?? '—'}</td>
                    <td className="xsmall">{a.summary ?? ''}</td>
                    <td className="xsmall ltr muted">{a.client ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="xsmall muted">لا يُسجَّل الرمز السرّي ولا ملفات الجلسة ولا عناوين IP؛ «الجهاز» بصمة مختصرة غير قابلة للعكس.</p>
      </section>
    </div>
  );
}
