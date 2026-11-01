import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useToday';

export function PageHeader({ title, intro, children }: { title: string; intro?: ReactNode; children?: ReactNode }) {
  useDocumentTitle(title);
  return (
    <header className="page-head container">
      <h1>{title}</h1>
      {intro ? <p>{intro}</p> : null}
      {children}
    </header>
  );
}

export function SectionHead({ id, title, note, to, linkLabel }: { id?: string; title: string; note?: string; to?: string; linkLabel?: string }) {
  return (
    <div className="section-head">
      <div>
        <h2 id={id}>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
      {to ? (
        <Link className="more-link" to={to}>
          {linkLabel ?? 'عرض الكل'}
          <ChevronLeft size={16} aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

/** Wraps Latin/number fragments so they read correctly inside Arabic sentences. */
export function Ltr({ children }: { children: ReactNode }) {
  return <bdi className="ltr">{children}</bdi>;
}
