import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, List, Search } from 'lucide-react';
import { PageHeader } from '../../components/ui/page';
import { EmptyState, PublicDataGate } from '../../components/ui/states';
import { useStoredState, useToday } from '../../hooks/useToday';
import { usePublicData } from '../../lib/public-data';
import { values } from '../../../shared/visibility';
import { EMPTY_FILTERS, EXAM_TYPE_LABEL, TRACK_LABEL, classesOf, filterOccurrences, subjectsOf, type ExamFilters, type ExamOccurrence } from '../../../shared/bagrut';
import { EXAM_TRACKS, EXAM_TYPES, GRADES } from '../../../shared/constants';
import type { Grade } from '../../../shared/schemas';
import { dayOfWeek, formatDateOnly, monthLabel } from '../../../shared/dates';
import { ExamRow, useExamOccurrences } from './ExamRow';

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function CalendarView({ list, today }: { list: ExamOccurrence[]; today: string }) {
  const first = list[0]?.date ?? today;
  const [ym, setYm] = useState<[number, number]>([Number(first.slice(0, 4)), Number(first.slice(5, 7))]);
  const [selected, setSelected] = useState<string | null>(null);
  const [y, m] = ym;
  const byDate = useMemo(() => {
    const map = new Map<string, ExamOccurrence[]>();
    for (const o of list) map.set(o.date, [...(map.get(o.date) ?? []), o]);
    return map;
  }, [list]);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = dayOfWeek(`${y}-${pad(m)}-01`);
  const cells: Array<string | null> = [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`)];
  const move = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setYm([d.getUTCFullYear(), d.getUTCMonth() + 1]);
    setSelected(null);
  };
  const selectedList = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <div className="stack">
      <div className="calendar-head">
        <button type="button" className="btn btn-icon btn-sm" onClick={() => move(-1)} aria-label="الشهر السابق">
          <ChevronRight aria-hidden="true" />
        </button>
        <h2 aria-live="polite">{monthLabel(y, m)}</h2>
        <button type="button" className="btn btn-icon btn-sm" onClick={() => move(1)} aria-label="الشهر التالي">
          <ChevronLeft aria-hidden="true" />
        </button>
      </div>
      <div className="calendar" role="grid" aria-label={`تقويم ${monthLabel(y, m)}`}>
        <div className="calendar-row calendar-weekdays" role="row">
          {WEEKDAYS.map((d) => (
            <div key={d} role="columnheader" className="calendar-wd">
              <span className="wd-long">{d}</span>
              <span className="wd-short" aria-hidden="true">
                {d.replace('ال', '').slice(0, 2)}
              </span>
            </div>
          ))}
        </div>
        <div className="calendar-cells" role="rowgroup">
          {cells.map((date, i) =>
            date ? (
              <button
                key={date}
                type="button"
                role="gridcell"
                className={`calendar-cell${date === today ? ' is-today' : ''}${byDate.has(date) ? ' has-exam' : ''}${selected === date ? ' is-selected' : ''}`}
                aria-label={`${formatDateOnly(date)}${byDate.has(date) ? ` — ${byDate.get(date)!.length} امتحان` : ''}`}
                aria-pressed={selected === date}
                onClick={() => setSelected(selected === date ? null : date)}
              >
                <span className="cell-day num">{Number(date.slice(8))}</span>
                {(byDate.get(date) ?? []).slice(0, 3).map((o) => (
                  <span key={o.key} className={`cell-exam ${o.exam.certainty === 'final' ? 'final' : ''}`}>
                    {o.exam.nameAr}
                  </span>
                ))}
                {(byDate.get(date)?.length ?? 0) > 0 ? <span className="cell-dot" aria-hidden="true" /> : null}
              </button>
            ) : (
              <div key={`e${i}`} className="calendar-cell is-empty" aria-hidden="true" />
            ),
          )}
        </div>
      </div>
      {selected ? (
        <div className="stack" aria-live="polite">
          <h3>{formatDateOnly(selected)}</h3>
          {selectedList.length ? selectedList.map((o) => <ExamRow key={o.key} occ={o} today={today} detailed />) : <p className="small muted">لا امتحانات في هذا اليوم.</p>}
        </div>
      ) : (
        <p className="xsmall muted">اختر يومًا لعرض تفاصيل امتحاناته.</p>
      )}
    </div>
  );
}

export default function BagrutPage() {
  const today = useToday();
  const { data } = usePublicData();
  const all = useExamOccurrences();
  const exams = useMemo(() => values(data.exams), [data.exams]);
  const [prefs, setPrefs] = useStoredState<{ grade: Grade | null; className: string }>('amal.bagrut.prefs', { grade: null, className: '' });
  const [f, setF] = useState<Omit<ExamFilters, 'grade' | 'className'>>(() => ({ ...EMPTY_FILTERS }));
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const filters: ExamFilters = { ...f, grade: prefs.grade, className: prefs.className };
  const list = useMemo(() => filterOccurrences(all, filters, today), [all, today, f, prefs]); // eslint-disable-line react-hooks/exhaustive-deps
  const subjects = useMemo(() => subjectsOf(exams), [exams]);
  const classes = useMemo(() => classesOf(exams), [exams]);
  const patch = (p: Partial<typeof f>) => setF((prev) => ({ ...prev, ...p }));
  const anyProvisional = list.some((o) => o.exam.certainty === 'provisional');

  return (
    <>
      <PageHeader title="تقويم امتحانات البجروت" intro="مواعيد الامتحانات ذات الصلة بطلاب المدرسة. المواعيد المؤقّتة قد تتغيّر — تأكّد دائمًا من المدرسة ومن لوح وزارة التربية." />
      <div className="container stack">
        <div className="notice notice-warning">
          <span>
            لا يُنشر وقت الامتحان إلا بعد التحقّق منه. مواعيد الامتحانات الشفهية والأفاتار هي <strong>أيام نافذة</strong>؛ موعد كل طالب تحدّده المدرسة.
          </span>
        </div>

        <form className="panel panel-pad stack filters" role="search" aria-label="تصفية الامتحانات" onSubmit={(e) => e.preventDefault()}>
          <div className="toolbar">
            <div className="field search">
              <label htmlFor="q">بحث بالاسم (عربي/עברית) أو מספר שאלון</label>
              <Search aria-hidden="true" />
              <input id="q" className="input" type="search" value={f.query} onChange={(e) => patch({ query: e.target.value })} placeholder="مثال: رياضيات، מתמטיקה، 035481" />
            </div>
            <div className="field">
              <label htmlFor="grade">الصف</label>
              <select id="grade" className="select" value={prefs.grade ?? ''} onChange={(e) => setPrefs({ ...prefs, grade: e.target.value ? (Number(e.target.value) as Grade) : null })}>
                <option value="">كل الصفوف</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    الصف {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="class">الشعبة</label>
              <select id="class" className="select" value={prefs.className} onChange={(e) => setPrefs({ ...prefs, className: e.target.value })} disabled={classes.length === 0}>
                <option value="">كل الشعب</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="subject">الموضوع</label>
              <select id="subject" className="select" value={f.subjectKey} onChange={(e) => patch({ subjectKey: e.target.value })}>
                <option value="">كل المواضيع</option>
                {subjects.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="toolbar">
            <div className="field">
              <label htmlFor="track">المسار</label>
              <select id="track" className="select" value={f.track} onChange={(e) => patch({ track: e.target.value as ExamFilters['track'] })}>
                <option value="">كل المسارات</option>
                {EXAM_TRACKS.map((t) => (
                  <option key={t} value={t}>
                    {TRACK_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="type">نوع الامتحان</label>
              <select id="type" className="select" value={f.examType} onChange={(e) => patch({ examType: e.target.value as ExamFilters['examType'] })}>
                <option value="">كل الأنواع</option>
                {EXAM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EXAM_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="from">من تاريخ</label>
              <input id="from" className="input" type="date" value={f.from} onChange={(e) => patch({ from: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="to">حتى تاريخ</label>
              <input id="to" className="input" type="date" value={f.to} onChange={(e) => patch({ to: e.target.value })} />
            </div>
          </div>
          <div className="row filters-foot">
            <label className="check">
              <input type="checkbox" checked={f.upcomingOnly} onChange={(e) => patch({ upcomingOnly: e.target.checked })} />
              القادمة فقط
            </label>
            <label className="check">
              <input type="checkbox" checked={f.showAll} onChange={(e) => patch({ showAll: e.target.checked })} />
              اعرض كل الامتحانات ذات الصلة (تجاهل الصف والشعبة)
            </label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setF({ ...EMPTY_FILTERS });
                setPrefs({ grade: null, className: '' });
              }}
            >
              مسح التصفية
            </button>
          </div>
          <p className="xsmall muted">يُحفظ اختيار الصف والشعبة على هذا الجهاز فقط.</p>
        </form>

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <p className="small" aria-live="polite">
            {list.length} {list.length === 1 ? 'موعد' : 'مواعيد'}
            {anyProvisional ? ' — بعضها مؤقّت' : ''}
          </p>
          <div className="segmented" aria-label="طريقة العرض">
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>
              <List size={16} aria-hidden="true" /> قائمة
            </button>
            <button type="button" aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>
              <CalendarDays size={16} aria-hidden="true" /> تقويم
            </button>
          </div>
        </div>

        <PublicDataGate>
          {view === 'calendar' ? (
            <CalendarView list={list} today={today} />
          ) : list.length === 0 ? (
            <EmptyState title="لا توجد امتحانات تطابق التصفية">جرّب إلغاء بعض الخيارات أو تفعيل «اعرض كل الامتحانات ذات الصلة».</EmptyState>
          ) : (
            <div className="exam-list">
              {list.map((o) => (
                <ExamRow key={o.key} occ={o} today={today} detailed />
              ))}
            </div>
          )}
        </PublicDataGate>
      </div>
    </>
  );
}
