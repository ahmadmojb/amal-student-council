import { useCallback, useEffect, useState } from 'react';
import { Ban, Printer, ShieldCheck } from 'lucide-react';
import { certificateInput, type CertificateInput, type CertificateRecord } from '../../../shared/schemas';
import { formatDateOnly, formatTimestamp, todayInSchool } from '../../../shared/dates';
import { api, ApiError } from '../../lib/api';
import { usePublicData } from '../../lib/public-data';
import { useToast } from '../../components/ui/toast';
import { ConfirmDialog } from '../../components/ui/dialog';
import { EmptyState, SkeletonLines } from '../../components/ui/states';
import { CertificateSheet } from '../certificates/CertificateSheet';
import { FormFields, issuesToErrors, type FieldErrors, type FormValues } from './FormFields';

type Row = CertificateRecord & { id: string };
const DEFAULT_ISSUER = 'مجلس الطلاب — المدرسة الثانوية الشاملة عمال يوسف شاهين، الطيبة';

export function CertificatesAdmin() {
  const toast = useToast();
  const { config, data } = usePublicData();
  const [values, setValues] = useState<FormValues>({ studentName: '', activityTitle: '', issueDate: todayInSchool(), issuer: DEFAULT_ISSUER });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [issued, setIssued] = useState<{ code: string; data: CertificateInput } | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [revoke, setRevoke] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Row[]>('/api/admin/certificates')
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  const issue = async () => {
    const parsed = certificateInput.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ code: string; record: CertificateRecord }>('/api/admin/certificates', { method: 'POST', json: parsed.data });
      setIssued({ code: r.code, data: parsed.data });
      toast('success', 'تم إصدار الشهادة. اطبعها أو احفظها الآن — الرمز لا يُعرض مرة أخرى.');
      load();
    } catch (e) {
      if (e instanceof ApiError) setErrors(issuesToErrors(e.issues));
      toast('error', e instanceof ApiError ? e.message : 'تعذّر الإصدار.');
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async () => {
    if (!revoke) return;
    setBusy(true);
    try {
      await api(`/api/admin/certificates/${revoke.id}/revoke`, { method: 'POST' });
      toast('success', 'أُلغيت الشهادة. صفحة التحقق ستعرضها كملغاة.');
      setRevoke(null);
      load();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّر الإلغاء.');
    } finally {
      setBusy(false);
    }
  };

  const preview: CertificateInput = issued?.data ?? {
    studentName: String(values.studentName ?? ''),
    activityTitle: String(values.activityTitle ?? ''),
    issueDate: String(values.issueDate ?? ''),
    issuer: String(values.issuer ?? DEFAULT_ISSUER),
  };

  return (
    <div className="stack">
      <div className="admin-head no-print">
        <div>
          <h1>شهادات المشاركة</h1>
          <p className="muted small">كل شهادة تحمل رمز تحقّق عشوائيًا آمنًا. يُخزَّن فقط بصمة الرمز (Hash)، لذا يُعرض الرمز مرة واحدة عند الإصدار.</p>
        </div>
      </div>

      <div className="cert-workspace">
        <section className="panel panel-pad stack no-print" aria-labelledby="cert-form">
          <h2 id="cert-form" className="admin-subtitle">
            <ShieldCheck aria-hidden="true" /> إصدار شهادة
          </h2>
          {issued ? (
            <div className="stack">
              <div className="notice">
                <span>
                  صدرت الشهادة. رمز التحقق: <bdi className="ltr nowrap-code"><strong>{issued.code}</strong></bdi>. اطبعها الآن (أو احفظها PDF من نافذة الطباعة).
                </span>
              </div>
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                  <Printer aria-hidden="true" /> طباعة / حفظ PDF
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setIssued(null);
                    setValues({ ...values, studentName: '' });
                  }}
                >
                  شهادة جديدة
                </button>
              </div>
            </div>
          ) : (
            <>
              <FormFields
                fields={[
                  { kind: 'text', name: 'studentName', label: 'اسم الطالب/ة', required: true },
                  { kind: 'text', name: 'activityTitle', label: 'النشاط', required: true },
                  { kind: 'date', name: 'issueDate', label: 'تاريخ الإصدار' },
                  { kind: 'text', name: 'issuer', label: 'الجهة المُصدِرة' },
                ]}
                values={values}
                errors={errors}
                onChange={(n, v) => {
                  setValues((s) => ({ ...s, [n]: v }));
                  setErrors((e) => ({ ...e, [n]: '' }));
                }}
              />
              <p className="xsmall muted">راجع المعاينة قبل الإصدار. بعد الإصدار يمكن إلغاء الشهادة فقط، لا تعديلها.</p>
              <button type="button" className="btn btn-primary" onClick={issue} disabled={busy} style={{ justifySelf: 'start' }}>
                إصدار الشهادة
              </button>
            </>
          )}
        </section>
        <section className="cert-preview-wrap" aria-label="معاينة">
          <CertificateSheet data={preview} code={issued?.code ?? null} siteUrl={config?.siteUrl ?? ''} logoUrl={data.settings?.logoUrl} />
        </section>
      </div>

      <section className="stack no-print" aria-labelledby="cert-list">
        <h2 id="cert-list" className="admin-subtitle">
          الشهادات الصادرة
        </h2>
        {rows === null ? (
          <SkeletonLines count={2} height={48} />
        ) : rows.length === 0 ? (
          <EmptyState title="لم تصدر شهادات بعد" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">الاسم</th>
                  <th scope="col">النشاط</th>
                  <th scope="col">التاريخ</th>
                  <th scope="col">آخر 4 خانات</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">
                    <span className="visually-hidden">إجراءات</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.studentName}</td>
                    <td>{r.activityTitle}</td>
                    <td className="xsmall nowrap">{formatDateOnly(r.issueDate, { weekday: false })}</td>
                    <td className="ltr num">…{r.codeHint}</td>
                    <td>{r.status === 'valid' ? <span className="badge badge-success">سارية</span> : <span className="badge badge-danger">ملغاة {r.revokedAt ? formatTimestamp(r.revokedAt, false) : ''}</span>}</td>
                    <td>
                      {r.status === 'valid' ? (
                        <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => setRevoke(r)}>
                          <Ban aria-hidden="true" /> إلغاء
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={revoke !== null}
        title="إلغاء الشهادة"
        message={<p>ستظهر شهادة «{revoke?.studentName}» في صفحة التحقق كشهادة ملغاة. لا يمكن التراجع عن الإلغاء.</p>}
        confirmLabel="إلغاء الشهادة"
        danger
        busy={busy}
        onConfirm={doRevoke}
        onCancel={() => setRevoke(null)}
      />
    </div>
  );
}
