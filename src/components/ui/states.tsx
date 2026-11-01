import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, WifiOff } from 'lucide-react';
import { usePublicData } from '../../lib/public-data';

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="state" role="status">
      <h3>
        {icon ?? <Inbox aria-hidden="true" />}
        {title}
      </h3>
      {children ? <div className="small">{children}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'تعذّر تحميل البيانات', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="state state-error" role="alert">
      <h3>
        <AlertTriangle aria-hidden="true" />
        {title}
      </h3>
      {children ? <div className="small">{children}</div> : null}
    </div>
  );
}

export function SkeletonLines({ count = 3, height = 72 }: { count?: number; height?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

/**
 * Renders children only when public data is ready; otherwise a loading
 * placeholder or an honest error (never stale or demo data).
 */
export function PublicDataGate({ children, skeleton }: { children: ReactNode; skeleton?: ReactNode }) {
  const { state, error } = usePublicData();
  if (state === 'loading') return <>{skeleton ?? <SkeletonLines />}</>;
  if (state === 'error')
    return (
      <ErrorState>
        <p>{error}</p>
        <p className="xsmall">ستظهر البيانات تلقائيًا عند عودة الاتصال.</p>
      </ErrorState>
    );
  return <>{children}</>;
}

export function OfflineNotice() {
  return (
    <div className="notice notice-warning" role="status">
      <WifiOff aria-hidden="true" />
      <span>أنت غير متصل بالإنترنت. المعروض قد لا يكون محدّثًا، وسيتجدد تلقائيًا عند عودة الاتصال.</span>
    </div>
  );
}
