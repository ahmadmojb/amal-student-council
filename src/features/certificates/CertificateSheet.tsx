/**
 * Print-ready Arabic certificate (A4 landscape).
 * Printed through the browser (window.print → "Save as PDF"), so Arabic
 * shaping, ligatures and RTL ordering are handled by the browser's text
 * engine — no PDF library that could break or reverse Arabic text.
 */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { formatDateOnly } from '../../../shared/dates';
import type { CertificateInput } from '../../../shared/schemas';
import { SchoolMark } from '../../components/layout/SchoolMark';

export function verifyUrl(code: string, siteUrl: string): string {
  const base = siteUrl || window.location.origin;
  return `${base}/verify?code=${encodeURIComponent(code)}`;
}

export function CertificateSheet({ data, code, siteUrl, logoUrl }: { data: CertificateInput; code: string | null; siteUrl: string; logoUrl?: string }) {
  const [qr, setQr] = useState<string>('');
  useEffect(() => {
    if (!code) {
      setQr('');
      return;
    }
    QRCode.toString(verifyUrl(code, siteUrl), { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0b3d56', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [code, siteUrl]);

  return (
    <article className="cert" aria-label="معاينة الشهادة">
      <div className="cert-frame">
        <header className="cert-head">
          <SchoolMark size={72} logoUrl={logoUrl} />
          <div>
            <p className="cert-school">المدرسة الثانوية الشاملة عمال يوسف شاهين – الطيبة</p>
            <p className="cert-council">مجلس الطلاب</p>
          </div>
        </header>
        <h1 className="cert-title">شهادة مشاركة</h1>
        <p className="cert-lead">يتقدّم مجلس الطلاب بالشكر والتقدير إلى</p>
        <p className="cert-name">{data.studentName || 'اسم الطالب/ة'}</p>
        <p className="cert-lead">على مشاركته/ا في</p>
        <p className="cert-activity">{data.activityTitle || 'عنوان النشاط'}</p>
        <footer className="cert-foot">
          <div className="cert-meta">
            <p>
              <span className="cert-label">تاريخ الإصدار</span>
              <span>{data.issueDate ? formatDateOnly(data.issueDate, { weekday: false }) : '—'}</span>
            </p>
            <p>
              <span className="cert-label">الجهة المُصدِرة</span>
              <span>{data.issuer}</span>
            </p>
            <p className="cert-sign">التوقيع: ____________________</p>
          </div>
          <div className="cert-verify">
            {qr ? <div className="cert-qr" dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="cert-qr cert-qr-empty">QR</div>}
            <p className="cert-code ltr">{code ?? 'XXXXX-XXXXX-XXXXX-XXXXX'}</p>
            <p className="cert-hint">للتحقق: امسح الرمز أو افتح صفحة «التحقق من شهادة» في موقع المجلس</p>
          </div>
        </footer>
      </div>
    </article>
  );
}
