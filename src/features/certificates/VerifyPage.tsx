import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, Ban, HelpCircle, Loader2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/page';
import { api, ApiError } from '../../lib/api';
import { formatDateOnly } from '../../../shared/dates';
import type { CertificateVerification } from '../../../shared/schemas';

/** Adds <meta name="robots" content="noindex"> while this page is open. */
function useNoIndex(): void {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

export default function VerifyPage() {
  useNoIndex();
  const [params, setParams] = useSearchParams();
  const initial = params.get('code') ?? '';
  const [code, setCode] = useState(initial);
  const [result, setResult] = useState<CertificateVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (value: string) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<CertificateVerification>(`/api/verify?code=${encodeURIComponent(value.trim())}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'تعذّر التحقق.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (initial) void verify(initial);
    // Only on first load with a QR code link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setParams(code.trim() ? { code: code.trim() } : {}, { replace: true });
    void verify(code);
  };

  return (
    <>
      <PageHeader title="التحقق من شهادة" intro="أدخل رمز التحقق المطبوع على الشهادة، أو امسح رمز QR الموجود عليها." />
      <div className="container verify">
        <form className="panel panel-pad stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="code">رمز التحقق</label>
            <input
              id="code"
              className="input ltr verify-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? <Loader2 className="spin" aria-hidden="true" /> : null}
            تحقّق
          </button>
        </form>

        <div aria-live="polite">
          {error ? <div className="notice notice-danger">{error}</div> : null}
          {result?.result === 'valid' && result.certificate ? (
            <div className="verify-result verify-valid">
              <BadgeCheck aria-hidden="true" />
              <div>
                <h2>شهادة صحيحة</h2>
                <dl className="meta-list">
                  <div>
                    <dt>الاسم</dt>
                    <dd>{result.certificate.studentName}</dd>
                  </div>
                  <div>
                    <dt>النشاط</dt>
                    <dd>{result.certificate.activityTitle}</dd>
                  </div>
                  <div>
                    <dt>تاريخ الإصدار</dt>
                    <dd>{formatDateOnly(result.certificate.issueDate)}</dd>
                  </div>
                  <div>
                    <dt>الجهة المُصدِرة</dt>
                    <dd>{result.certificate.issuer}</dd>
                  </div>
                </dl>
              </div>
            </div>
          ) : null}
          {result?.result === 'revoked' ? (
            <div className="verify-result verify-revoked">
              <Ban aria-hidden="true" />
              <div>
                <h2>هذه الشهادة ملغاة</h2>
                <p className="small">ألغت الجهة المُصدِرة هذه الشهادة ولم تعد سارية.</p>
              </div>
            </div>
          ) : null}
          {result?.result === 'unknown' ? (
            <div className="verify-result verify-unknown">
              <HelpCircle aria-hidden="true" />
              <div>
                <h2>لم نعثر على شهادة بهذا الرمز</h2>
                <p className="small">تأكّد من كتابة الرمز كما هو مطبوع. إذا استمرّت المشكلة، تواصل مع مجلس الطلاب.</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
