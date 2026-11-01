import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Award, BookOpenCheck, CalendarClock, FlaskConical, LayoutDashboard, Loader2, LogOut, MapPin, Megaphone, Settings, Ticket, Trophy, Users } from 'lucide-react';
import type { AdminSession } from '../../../shared/api-types';
import { api, ApiError } from '../../lib/api';
import { useDocumentTitle } from '../../hooks/useToday';
import { SchoolMark } from '../../components/layout/SchoolMark';
import { useToast } from '../../components/ui/toast';
import { ActivitiesAdmin, AnnouncementsAdmin, BagrutAdmin, BenefitsAdmin, ServicesAdmin } from './sections';
import { LeagueAdmin } from './LeagueAdmin';
import { CertificatesAdmin } from './CertificatesAdmin';
import { ProgramAdmin, SettingsAdmin, useOverview } from './SystemAdmin';
import '../../styles/admin.css';

const NAV = [
  { to: '/admin', label: 'نظرة عامة', icon: LayoutDashboard, end: true },
  { to: '/admin/announcements', label: 'الإعلانات', icon: Megaphone },
  { to: '/admin/program', label: 'البرنامج اليومي', icon: CalendarClock },
  { to: '/admin/league', label: 'الدوري', icon: Trophy },
  { to: '/admin/bagrut', label: 'البجروت', icon: BookOpenCheck },
  { to: '/admin/benefits', label: 'الخصومات', icon: Ticket },
  { to: '/admin/services', label: 'الخدمات', icon: MapPin },
  { to: '/admin/activities', label: 'النشاطات', icon: Users },
  { to: '/admin/certificates', label: 'الشهادات', icon: Award },
  { to: '/admin/settings', label: 'الإعدادات والسجلّ', icon: Settings },
] as const;

function Login({ session, onLoggedIn }: { session: AdminSession; onLoggedIn: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useDocumentTitle('دخول الإدارة');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/admin/login', { method: 'POST', json: { pin } });
      setPin('');
      onLoggedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تسجيل الدخول.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-login">
      <form className="panel panel-pad stack" onSubmit={submit} aria-labelledby="login-title">
        <div className="row">
          <SchoolMark size={48} />
          <div>
            <h1 id="login-title">لوحة إدارة مجلس الطلاب</h1>
            <p className="xsmall muted">للمسؤولين المخوّلين فقط.</p>
          </div>
        </div>
        {session.mode === 'demo' ? (
          <div className="notice notice-warning">
            <FlaskConical aria-hidden="true" />
            <span>
              وضع تجريبي.
              {session.demoPin ? (
                <>
                  {' '}
                  رمز الدخول التجريبي: <strong className="ltr">demo-1234</strong> (يعمل في الوضع التجريبي فقط).
                </>
              ) : null}
            </span>
          </div>
        ) : null}
        <div className="field">
          <label htmlFor="pin">رمز الدخول</label>
          <input
            id="pin"
            className="input ltr"
            type="password"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'pin-err' : undefined}
            required
          />
          {error ? (
            <span id="pin-err" className="field-error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !pin}>
          {busy ? <Loader2 className="spin" aria-hidden="true" /> : null}
          دخول
        </button>
        <Link to="/" className="small">
          العودة إلى الموقع
        </Link>
      </form>
    </main>
  );
}

function Overview() {
  const overview = useOverview();
  useDocumentTitle('لوحة الإدارة');
  const labels: Record<string, [string, string]> = {
    announcements: ['الإعلانات', '/admin/announcements'],
    scheduleNotices: ['ملاحظات البرنامج', '/admin/program'],
    teams: ['الفرق', '/admin/league'],
    matches: ['المباريات', '/admin/league'],
    exams: ['امتحانات البجروت', '/admin/bagrut'],
    benefits: ['الخصومات', '/admin/benefits'],
    services: ['الخدمات', '/admin/services'],
    activities: ['النشاطات', '/admin/activities'],
  };
  return (
    <div className="stack">
      <div className="admin-head">
        <div>
          <h1>نظرة عامة</h1>
          <p className="muted small">ملخّص المحتوى. المسودات لا تظهر للزوار حتى تُنشر.</p>
        </div>
      </div>
      {overview?.mode === 'demo' ? (
        <div className="notice notice-warning">
          <FlaskConical aria-hidden="true" />
          <span>الوضع التجريبي: التعديلات محفوظة على هذا الخادم فقط ولا تصل إلى قاعدة البيانات الرسمية أو إلى أجهزة تتصل بخوادم أخرى.</span>
        </div>
      ) : null}
      <div className="overview-grid">
        {overview
          ? Object.entries(overview.counts).map(([k, c]) => (
              <Link key={k} to={labels[k]?.[1] ?? '/admin'} className="overview-card">
                <span className="overview-title">{labels[k]?.[0] ?? k}</span>
                <span className="overview-num num">{c.published}</span>
                <span className="xsmall muted">
                  منشور، {c.draft} مسودة، {c.archived} مؤرشف
                </span>
              </Link>
            ))
          : null}
        {overview ? (
          <Link to="/admin/certificates" className="overview-card">
            <span className="overview-title">الشهادات</span>
            <span className="overview-num num">{overview.certificates}</span>
            <span className="xsmall muted">شهادة صادرة</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminApp() {
  const toast = useToast();
  const location = useLocation();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const check = useCallback(() => {
    api<AdminSession>('/api/admin/session')
      .then(setSession)
      .catch(() => setSession({ authenticated: false, mode: 'demo', demoPin: false }));
  }, []);
  useEffect(check, [check]);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Any 401 from an admin call (expired session) sends the user back to login.
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (e.reason instanceof ApiError && e.reason.status === 401) check();
    };
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, [check]);

  // Re-check the session periodically so an expired session is noticed.
  useEffect(() => {
    if (!session?.authenticated || !session.expiresAt) return;
    const ms = Math.max(5_000, session.expiresAt - Date.now() + 1_000);
    const id = window.setTimeout(() => {
      toast('error', 'انتهت الجلسة. سجّل الدخول من جديد.');
      check();
    }, Math.min(ms, 2 ** 31 - 1));
    return () => window.clearTimeout(id);
  }, [session, check, toast]);

  if (!session) {
    return (
      <div className="admin-login">
        <Loader2 className="spin" aria-label="جارٍ التحميل" />
      </div>
    );
  }
  if (!session.authenticated) return <Login session={session} onLoggedIn={check} />;

  const logout = async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => undefined);
    check();
  };

  return (
    <div className="admin">
      <a href="#admin-main" className="skip-link">
        انتقل إلى المحتوى
      </a>
      <aside className={`admin-side${menuOpen ? ' is-open' : ''}`} aria-label="أقسام الإدارة">
        <div className="admin-brand">
          <SchoolMark size={36} />
          <div>
            <strong>الإدارة</strong>
            <span className="xsmall">مجلس الطلاب</span>
          </div>
          <button type="button" className="btn btn-sm admin-menu-toggle" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
            القائمة
          </button>
        </div>
        {session.mode === 'demo' ? (
          <p className="admin-demo">
            <FlaskConical size={14} aria-hidden="true" /> وضع تجريبي
          </p>
        ) : null}
        <nav className="admin-nav">
          <ul>
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={'end' in n ? n.end : false}>
                  <n.icon aria-hidden="true" />
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="admin-side-foot">
          <Link to="/" className="btn btn-sm btn-ghost">
            عرض الموقع
          </Link>
          <button type="button" className="btn btn-sm" onClick={logout}>
            <LogOut aria-hidden="true" /> خروج
          </button>
        </div>
      </aside>
      <main id="admin-main" className="admin-main" tabIndex={-1}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="announcements" element={<AnnouncementsAdmin />} />
          <Route path="program" element={<ProgramAdmin />} />
          <Route path="league" element={<LeagueAdmin />} />
          <Route path="bagrut" element={<BagrutAdmin />} />
          <Route path="benefits" element={<BenefitsAdmin />} />
          <Route path="services" element={<ServicesAdmin />} />
          <Route path="activities" element={<ActivitiesAdmin />} />
          <Route path="certificates" element={<CertificatesAdmin />} />
          <Route path="settings" element={<SettingsAdmin />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
