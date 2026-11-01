import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Accessibility, Clock, Copy, ExternalLink, MapPin, Search } from 'lucide-react';
import { PageHeader } from '../../components/ui/page';
import { EmptyState, PublicDataGate } from '../../components/ui/states';
import { useToast } from '../../components/ui/toast';
import { usePublicData } from '../../lib/public-data';
import { values } from '../../../shared/visibility';
import { normalizeArabic } from '../../../shared/bagrut';
import { formatTimestamp } from '../../../shared/dates';
import type { Service } from '../../../shared/schemas';

function locationText(s: Service): string {
  return [s.building && `مبنى ${s.building}`, s.floor && `الطابق ${s.floor}`, s.room && `غرفة ${s.room}`].filter(Boolean).join('، ');
}

function ServiceItem({ s, expanded, onToggle }: { s: Service; expanded: boolean; onToggle: () => void }) {
  const toast = useToast();
  const loc = locationText(s);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(s.contact);
      toast('success', 'تم نسخ معلومات التواصل');
    } catch {
      toast('error', 'تعذّر النسخ. انسخ النص يدويًا.');
    }
  };
  return (
    <li className={`service${expanded ? ' is-open' : ''}`}>
      <button type="button" className="service-summary" aria-expanded={expanded} aria-controls={`svc-${s.id}`} onClick={onToggle}>
        <span>
          <strong>{s.name}</strong>
          <span className="xsmall muted">{s.category}</span>
        </span>
        <span className="small service-loc">{loc || 'الموقع لم يُحدَّد بعد'}</span>
      </button>
      <div id={`svc-${s.id}`} className="service-body" hidden={!expanded}>
        {s.description ? <p>{s.description}</p> : null}
        <dl className="meta-list">
          {s.locationNote ? (
            <div>
              <dt>
                <MapPin size={14} aria-hidden="true" style={{ display: 'inline' }} /> كيف تصل
              </dt>
              <dd>{s.locationNote}</dd>
            </div>
          ) : null}
          {s.hours || s.availability ? (
            <div>
              <dt>
                <Clock size={14} aria-hidden="true" style={{ display: 'inline' }} /> الأوقات
              </dt>
              <dd>{[s.hours, s.availability].filter(Boolean).join(' — ')}</dd>
            </div>
          ) : null}
          {s.contact ? (
            <div>
              <dt>التواصل</dt>
              <dd className="row">
                <span>{s.contact}</span>
                <button type="button" className="btn btn-sm" onClick={copy}>
                  <Copy aria-hidden="true" /> نسخ
                </button>
              </dd>
            </div>
          ) : null}
          {s.accessibility ? (
            <div>
              <dt>
                <Accessibility size={14} aria-hidden="true" style={{ display: 'inline' }} /> إمكانية الوصول
              </dt>
              <dd>{s.accessibility}</dd>
            </div>
          ) : null}
          <div>
            <dt>آخر تحديث</dt>
            <dd>{formatTimestamp(s.updatedAt, false)}</dd>
          </div>
        </dl>
        <div className="row">
          {s.mapUrl ? (
            <a className="btn btn-sm" href={s.mapUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" /> الخريطة
            </a>
          ) : null}
          {s.floorPlanUrl ? (
            <a className="btn btn-sm" href={s.floorPlanUrl} target="_blank" rel="noopener noreferrer">
              <MapPin aria-hidden="true" /> مخطّط الطابق
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function ServicesPage() {
  const { data } = usePublicData();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const openId = params.get('open');

  const services = useMemo(() => values(data.services).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ar')), [data.services]);
  const categories = useMemo(() => [...new Set(services.map((s) => s.category))], [services]);
  const q = normalizeArabic(query);
  const list = services.filter((s) => (!category || s.category === category) && (!q || normalizeArabic(`${s.name} ${s.description} ${s.category}`).includes(q)));

  const toggle = (id: string) => {
    const next = new URLSearchParams(params);
    if (openId === id) next.delete('open');
    else next.set('open', id);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title="دليل خدمات المدرسة" intro="أين تجد الإدارة، السكرتارية، المستشار التربوي، المكتبة والمختبرات — مع الأوقات وطرق التواصل المؤكّدة فقط." />
      <div className="container stack">
        <div className="toolbar panel panel-pad" role="search">
          <div className="field search">
            <label htmlFor="sq">بحث عن خدمة</label>
            <Search aria-hidden="true" />
            <input id="sq" type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        {categories.length > 1 ? (
          <div className="tabs-scroll">
            <div className="segmented" aria-label="الفئة">
              <button type="button" aria-pressed={category === ''} onClick={() => setCategory('')}>
                الكل
              </button>
              {categories.map((c) => (
                <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <PublicDataGate>
          {services.length === 0 ? (
            <EmptyState title="دليل الخدمات قيد الإعداد">سيُنشر بعد تأكيد المواقع والأوقات وطرق التواصل من إدارة المدرسة.</EmptyState>
          ) : list.length === 0 ? (
            <EmptyState title="لا نتائج مطابقة" />
          ) : (
            <ul className="services">
              {list.map((s) => (
                <ServiceItem key={s.id} s={s} expanded={openId === s.id} onToggle={() => toggle(s.id)} />
              ))}
            </ul>
          )}
        </PublicDataGate>
      </div>
    </>
  );
}
