import { useEffect, useId, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { CalendarClock, Menu, X } from 'lucide-react';
import { usePublicData } from '../../lib/public-data';
import { SchoolMark } from './SchoolMark';

export const NAV_ITEMS = [
  { to: '/', label: 'الرئيسية', end: true },
  { to: '/league', label: 'الدوري' },
  { to: '/bagrut', label: 'البجروت' },
  { to: '/benefits', label: 'الخصومات' },
  { to: '/services', label: 'خدمات المدرسة' },
  { to: '/activities', label: 'النشاطات' },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const menuId = useId();
  const { data } = usePublicData();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <Link to="/" className="brand" aria-label="مجلس الطلاب — الصفحة الرئيسية">
          <SchoolMark logoUrl={data.settings?.logoUrl} />
          <span className="brand-text">
            <strong>مجلس الطلاب</strong>
            <span>مدرسة عمال الثانوية الشاملة — الطيبة</span>
          </span>
        </Link>

        <nav className="main-nav" aria-label="التنقل الرئيسي">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={'end' in item ? item.end : false}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="header-actions">
          <NavLink to="/program" className="btn btn-accent program-cta">
            <CalendarClock aria-hidden="true" />
            <span>البرنامج اليومي</span>
          </NavLink>
          <button
            type="button"
            className="btn btn-icon menu-toggle"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>

      <nav id={menuId} className="mobile-nav" aria-label="القائمة" hidden={!open}>
        <ul className="container">
          <li>
            <NavLink to="/program">البرنامج اليومي</NavLink>
          </li>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={'end' in item ? item.end : false}>
                {item.label}
              </NavLink>
            </li>
          ))}
          <li>
            <NavLink to="/verify">التحقق من شهادة</NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}
