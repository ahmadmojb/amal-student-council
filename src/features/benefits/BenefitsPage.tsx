import { useMemo, useState } from 'react';
import { Search, Ticket } from 'lucide-react';
import { PageHeader } from '../../components/ui/page';
import { EmptyState, PublicDataGate } from '../../components/ui/states';
import { Dialog } from '../../components/ui/dialog';
import { usePublicData } from '../../lib/public-data';
import { useToday } from '../../hooks/useToday';
import { benefitState, values } from '../../../shared/visibility';
import { normalizeArabic } from '../../../shared/bagrut';
import type { Benefit } from '../../../shared/schemas';
import { BenefitCard, BenefitDetails } from './BenefitCard';

export default function BenefitsPage() {
  const { data } = usePublicData();
  const today = useToday();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [open, setOpen] = useState<Benefit | null>(null);

  // Expired offers are dropped here even if still marked published (automatic expiry).
  const visible = useMemo(
    () =>
      values(data.benefits)
        .map((b) => ({ b, state: benefitState(b, today) }))
        .filter((x) => x.state === 'active' || x.state === 'upcoming' || x.state === 'unavailable')
        .sort((a, z) => Number(a.state !== 'active') - Number(z.state !== 'active') || a.b.businessName.localeCompare(z.b.businessName, 'ar')),
    [data.benefits, today],
  );
  const categories = useMemo(() => [...new Set(visible.map((x) => x.b.category))].sort((a, b) => a.localeCompare(b, 'ar')), [visible]);
  const q = normalizeArabic(query);
  const list = visible.filter(({ b }) => (!category || b.category === category) && (!q || normalizeArabic(`${b.businessName} ${b.title}`).includes(q)));

  return (
    <>
      <PageHeader title="خصومات ومزايا للطلاب" intro="عروض حقيقية اتفق عليها مجلس الطلاب مع محالّ وجهات في المنطقة، وتحقّق منها قبل النشر. العروض المنتهية تختفي تلقائيًا." />
      <div className="container stack">
        <div className="toolbar panel panel-pad" role="search">
          <div className="field search">
            <label htmlFor="bq">بحث باسم المحلّ</label>
            <Search aria-hidden="true" />
            <input id="bq" type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bc">الفئة</label>
            <select id="bc" className="select" value={category} onChange={(e) => setCategory(e.target.value)} disabled={categories.length === 0}>
              <option value="">كل الفئات</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <PublicDataGate>
          {visible.length === 0 ? (
            <EmptyState title="لا توجد عروض فعّالة حاليًا" icon={<Ticket aria-hidden="true" />}>
              يعمل المجلس على الاتفاق مع محالّ في المنطقة. ستظهر العروض هنا بعد التحقّق منها.
            </EmptyState>
          ) : list.length === 0 ? (
            <EmptyState title="لا نتائج مطابقة">جرّب كلمة أخرى أو فئة مختلفة.</EmptyState>
          ) : (
            <div className="grid grid-auto">
              {list.map(({ b, state }) => (
                <BenefitCard key={b.id} b={b} state={state} onOpen={() => setOpen(b)} />
              ))}
            </div>
          )}
        </PublicDataGate>
      </div>
      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open ? `${open.businessName} — ${open.title}` : ''}>
        {open ? <BenefitDetails b={open} /> : null}
      </Dialog>
    </>
  );
}
