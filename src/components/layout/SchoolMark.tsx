import { useId } from 'react';

/**
 * PLACEHOLDER IDENTITY MARK — not an official school logo.
 * Replace by setting "رابط الشعار" in /admin → الإعدادات (an approved logo
 * image), or by swapping this component. See docs/branding.md.
 */
export function SchoolMark({ logoUrl, size = 44 }: { logoUrl?: string; size?: number }) {
  const clip = useId();
  if (logoUrl) {
    return <img src={logoUrl} alt="" width={size} height={size} className="school-mark-img" />;
  }
  return (
    <svg className="school-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" data-placeholder-logo="true">
      <defs>
        <clipPath id={clip}>
          <rect width="48" height="48" rx="12" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="48" height="48" fill="#0b3d56" />
        <rect y="32" width="48" height="5" fill="#5cbfe8" />
        <rect y="37" width="48" height="11" fill="#becc32" />
      </g>
      <text x="24" y="23" textAnchor="middle" fontFamily="IBM Plex Sans Arabic, sans-serif" fontWeight="700" fontSize="16" fill="#ffffff">
        عمال
      </text>
    </svg>
  );
}
