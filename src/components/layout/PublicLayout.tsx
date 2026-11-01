import { Outlet } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';
import { usePublicData } from '../../lib/public-data';
import { useOnline } from '../../hooks/useToday';
import { OfflineNotice } from '../ui/states';

export function DemoBanner() {
  const { mode } = usePublicData();
  if (mode !== 'demo') return null;
  return (
    <div className="demo-banner" role="note">
      <FlaskConical size={16} aria-hidden="true" />
      <span>وضع تجريبي: البيانات محفوظة على هذا الخادم فقط ولا تتزامن مع قاعدة البيانات الرسمية.</span>
    </div>
  );
}

export function PublicLayout() {
  const online = useOnline();
  return (
    <>
      <a href="#main" className="skip-link">
        انتقل إلى المحتوى
      </a>
      <DemoBanner />
      <SiteHeader />
      {!online ? (
        <div className="container" style={{ paddingTop: 'var(--s4)' }}>
          <OfflineNotice />
        </div>
      ) : null}
      <main id="main" tabIndex={-1} className="site-main">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}
