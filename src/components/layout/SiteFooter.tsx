import { Link } from 'react-router-dom';
import { usePublicData } from '../../lib/public-data';
import { formatTimestamp } from '../../../shared/dates';
import { NAV_ITEMS } from './SiteHeader';

export function SiteFooter() {
  const { data } = usePublicData();
  const links = data.settings?.officialLinks ?? [];
  const updatedAt = data.meta?.updatedAt;
  return (
    <footer className="site-footer">
      <div className="footer-band" aria-hidden="true" />
      <div className="container footer-grid">
        <div className="footer-identity">
          <strong>مجلس الطلاب</strong>
          <p>المدرسة الثانوية الشاملة عمال يوسف شاهين – الطيبة</p>
          <p className="ltr footer-latin">Amal School Student Council · Taybeh</p>
        </div>
        <nav aria-label="روابط الموقع">
          <h2 className="footer-title">في الموقع</h2>
          <ul>
            <li>
              <Link to="/program">البرنامج اليومي</Link>
            </li>
            {NAV_ITEMS.filter((i) => i.to !== '/').map((i) => (
              <li key={i.to}>
                <Link to={i.to}>{i.label}</Link>
              </li>
            ))}
            <li>
              <Link to="/verify">التحقق من شهادة</Link>
            </li>
          </ul>
        </nav>
        {links.length > 0 ? (
          <nav aria-label="روابط رسمية">
            <h2 className="footer-title">روابط رسمية</h2>
            <ul>
              {links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
      <div className="container footer-meta">
        <span>© {new Date().getFullYear()} مجلس الطلاب — مدرسة عمال، الطيبة</span>
        {updatedAt ? <span>آخر تحديث للمحتوى: {formatTimestamp(updatedAt)}</span> : null}
        <Link to="/admin" className="footer-admin">
          دخول الإدارة
        </Link>
      </div>
    </footer>
  );
}
