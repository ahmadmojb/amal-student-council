import { ExternalLink, MapPin, Tag } from 'lucide-react';
import type { Benefit } from '../../../shared/schemas';
import type { BenefitState } from '../../../shared/visibility';
import { formatDateOnly } from '../../../shared/dates';

export function discountText(b: Benefit): string {
  if (b.discountValue === null) return '';
  if (b.discountKind === 'percent') return `خصم ${b.discountValue}%`;
  if (b.discountKind === 'fixed') return `خصم ${b.discountValue} ₪`;
  return '';
}

const STATE_BADGE: Partial<Record<BenefitState, [string, string]>> = {
  upcoming: ['badge-info', 'يبدأ قريبًا'],
  unavailable: ['badge-warning', 'غير متاح مؤقتًا'],
};

export function BenefitCard({ b, state, onOpen }: { b: Benefit; state: BenefitState; onOpen?: () => void }) {
  const discount = discountText(b);
  const badge = STATE_BADGE[state];
  return (
    <article className="benefit panel" aria-labelledby={`benefit-${b.id}`}>
      <div className="benefit-top">
        {b.logoUrl ? <img src={b.logoUrl} alt="" className="benefit-logo" loading="lazy" width={56} height={56} /> : <div className="benefit-logo benefit-logo-empty" aria-hidden="true"><Tag /></div>}
        <div>
          <p className="xsmall muted">{b.category}</p>
          <h3 id={`benefit-${b.id}`}>{b.businessName}</h3>
        </div>
      </div>
      {discount ? <p className="benefit-discount">{discount}</p> : null}
      <p className="benefit-title">{b.title}</p>
      {b.originalPrice !== null && b.discountedPrice !== null ? (
        <p className="small">
          <s className="muted num">{b.originalPrice} ₪</s> <strong className="num">{b.discountedPrice} ₪</strong>
        </p>
      ) : null}
      <div className="row">
        {badge ? <span className={`badge ${badge[0]}`}>{badge[1]}</span> : null}
        {b.expiresOn ? <span className="badge badge-outline">حتى {formatDateOnly(b.expiresOn, { weekday: false })}</span> : null}
        {b.branch ? (
          <span className="badge badge-outline">
            <MapPin aria-hidden="true" />
            {b.branch}
          </span>
        ) : null}
      </div>
      {onOpen ? (
        <button type="button" className="btn btn-sm benefit-open" onClick={onOpen}>
          التفاصيل وطريقة الاستفادة
        </button>
      ) : null}
    </article>
  );
}

export function BenefitDetails({ b }: { b: Benefit }) {
  return (
    <div className="stack">
      <p>{b.description}</p>
      <dl className="meta-list">
        {b.location ? (
          <div>
            <dt>العنوان</dt>
            <dd>{b.location}</dd>
          </div>
        ) : null}
        {b.startsOn ? (
          <div>
            <dt>يبدأ</dt>
            <dd>{formatDateOnly(b.startsOn)}</dd>
          </div>
        ) : null}
        {b.expiresOn ? (
          <div>
            <dt>ينتهي</dt>
            <dd>{formatDateOnly(b.expiresOn)}</dd>
          </div>
        ) : null}
        {b.redemption ? (
          <div>
            <dt>طريقة الاستفادة</dt>
            <dd>{b.redemption}</dd>
          </div>
        ) : null}
        {b.couponCode ? (
          <div>
            <dt>رمز الخصم</dt>
            <dd>
              <code className="ltr coupon">{b.couponCode}</code>
            </dd>
          </div>
        ) : null}
        {b.terms ? (
          <div>
            <dt>الشروط</dt>
            <dd>{b.terms}</dd>
          </div>
        ) : null}
        {b.verifiedOn ? (
          <div>
            <dt>تحقّق المجلس</dt>
            <dd>{formatDateOnly(b.verifiedOn)}</dd>
          </div>
        ) : null}
      </dl>
      {b.qrImageUrl ? <img src={b.qrImageUrl} alt={`رمز QR لعرض ${b.businessName}`} className="benefit-qr" /> : null}
      <div className="row">
        {b.directionsUrl ? (
          <a className="btn" href={b.directionsUrl} target="_blank" rel="noopener noreferrer">
            <MapPin aria-hidden="true" /> الاتجاهات
          </a>
        ) : null}
        {b.officialUrl ? (
          <a className="btn" href={b.officialUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" /> الموقع الرسمي
          </a>
        ) : null}
      </div>
    </div>
  );
}
