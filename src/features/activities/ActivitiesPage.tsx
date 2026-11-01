import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, FileText, Search, Video } from 'lucide-react';
import { PageHeader } from '../../components/ui/page';
import { EmptyState, PublicDataGate } from '../../components/ui/states';
import { usePublicData } from '../../lib/public-data';
import { values } from '../../../shared/visibility';
import { normalizeArabic } from '../../../shared/bagrut';
import { formatDateOnly } from '../../../shared/dates';
import type { Activity } from '../../../shared/schemas';
import { ActivityCard } from './ActivityCard';

function ActivityDetail({ a }: { a: Activity }) {
  const [photo, setPhoto] = useState(0);
  const current = a.photos[photo];
  return (
    <article className="container activity-detail stack">
      <Link to="/activities" className="more-link">
        <ChevronRight size={16} aria-hidden="true" /> كل النشاطات
      </Link>
      <header>
        <div className="row">
          <span className="badge badge-lime">{a.category}</span>
          <time dateTime={a.date} className="small muted">
            {formatDateOnly(a.date)}
          </time>
        </div>
        <h1 className="activity-title">{a.title}</h1>
        {a.gradeOrClass || a.relatedEvent ? <p className="muted small">{[a.gradeOrClass, a.relatedEvent].filter(Boolean).join(' — ')}</p> : null}
      </header>
      {current ? (
        <figure className="gallery">
          <img src={current.url} alt={current.alt} />
          {a.photos.length > 1 ? (
            <div className="gallery-thumbs" role="group" aria-label="صور النشاط">
              {a.photos.map((p, i) => (
                <button key={p.url} type="button" aria-pressed={i === photo} aria-label={`الصورة ${i + 1}${p.alt ? `: ${p.alt}` : ''}`} onClick={() => setPhoto(i)}>
                  <img src={p.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          ) : null}
        </figure>
      ) : null}
      <div className="activity-body">
        <p>{a.description}</p>
        {a.achievements ? (
          <>
            <h2>النتائج والإنجازات</h2>
            <p>{a.achievements}</p>
          </>
        ) : null}
      </div>
      <div className="row">
        {a.videoUrl ? (
          <a className="btn" href={a.videoUrl} target="_blank" rel="noopener noreferrer">
            <Video aria-hidden="true" /> مشاهدة الفيديو
          </a>
        ) : null}
        {a.attachmentUrl ? (
          <a className="btn" href={a.attachmentUrl} target="_blank" rel="noopener noreferrer">
            <FileText aria-hidden="true" /> {a.attachmentName || 'المرفق'}
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function ActivitiesPage() {
  const { id } = useParams();
  const { data, state } = usePublicData();
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('');
  const [category, setCategory] = useState('');

  const all = useMemo(() => values(data.activities).sort((a, b) => b.date.localeCompare(a.date)), [data.activities]);
  const years = useMemo(() => [...new Set(all.map((a) => a.date.slice(0, 4)))], [all]);
  const categories = useMemo(() => [...new Set(all.map((a) => a.category))].sort((a, b) => a.localeCompare(b, 'ar')), [all]);

  if (id) {
    const a = all.find((x) => x.id === id);
    if (a) return <ActivityDetail a={a} />;
    if (state !== 'loading')
      return (
        <>
          <PageHeader title="النشاط غير موجود" intro="ربما أُزيل أو لم يُنشر بعد." />
          <div className="container">
            <Link to="/activities" className="btn">
              كل النشاطات
            </Link>
          </div>
        </>
      );
  }

  const q = normalizeArabic(query);
  const list = all.filter((a) => (!year || a.date.startsWith(year)) && (!category || a.category === category) && (!q || normalizeArabic(`${a.title} ${a.description} ${a.relatedEvent}`).includes(q)));

  return (
    <>
      <PageHeader title="أرشيف نشاطات المجلس" intro="مبادرات مجلس الطلاب وفعالياته وإنجازاته، تُنشر بعد موافقة المدرسة." />
      <div className="container stack">
        <div className="toolbar panel panel-pad" role="search">
          <div className="field search">
            <label htmlFor="aq">بحث</label>
            <Search aria-hidden="true" />
            <input id="aq" type="search" className="input" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ay">السنة</label>
            <select id="ay" className="select" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">كل السنوات</option>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ac">الفئة</label>
            <select id="ac" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">كل الفئات</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <PublicDataGate>
          {all.length === 0 ? (
            <EmptyState title="لم تُنشر نشاطات بعد">سيضيف المجلس نشاطاته وإنجازاته هنا.</EmptyState>
          ) : list.length === 0 ? (
            <EmptyState title="لا نتائج مطابقة" />
          ) : (
            <div className="grid grid-auto">
              {list.map((a) => (
                <ActivityCard key={a.id} a={a} />
              ))}
            </div>
          )}
        </PublicDataGate>
      </div>
    </>
  );
}
