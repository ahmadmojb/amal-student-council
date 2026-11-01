import { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { EXAM_TYPE_LABEL, TRACK_LABEL, expandOccurrences, type ExamOccurrence } from '../../../shared/bagrut';
import { daysBetween, formatDateOnly, relativeDays } from '../../../shared/dates';
import { values } from '../../../shared/visibility';
import { usePublicData } from '../../lib/public-data';

export function useExamOccurrences(): ExamOccurrence[] {
  const { data } = usePublicData();
  return useMemo(() => expandOccurrences(values(data.exams).filter((e) => e.visibility === 'published')), [data.exams]);
}

export function CertaintyBadge({ certainty }: { certainty: 'provisional' | 'final' }) {
  return certainty === 'final' ? <span className="badge badge-success">نهائي</span> : <span className="badge badge-warning">مؤقّت — غير نهائي</span>;
}

export function ExamRow({ occ, today, detailed = false }: { occ: ExamOccurrence; today: string; detailed?: boolean }) {
  const { exam, date } = occ;
  const n = daysBetween(today, date);
  return (
    <article className="exam-row" aria-labelledby={`exam-${occ.key}`}>
      <div className="exam-date" aria-hidden="true">
        <span className="exam-day num">{Number(date.slice(8, 10))}</span>
        <span className="exam-month">{formatDateOnly(date, { weekday: false, year: false }).replace(/^\d+\s*/, '')}</span>
      </div>
      <div className="exam-main">
        <h3 id={`exam-${occ.key}`}>{exam.nameAr}</h3>
        {exam.officialName ? (
          <p className="exam-he" lang="he" dir="rtl">
            {exam.officialName}
          </p>
        ) : null}
        <p className="exam-qn" lang="he" dir="rtl">
          <span>מספר שאלון: </span>
          {exam.questionnaireNumbers?.length ? (
            exam.questionnaireNumbers.map((n, i) => (
              <span key={n}>
                {i > 0 ? '، ' : null}
                <bdi className="num" dir="ltr">
                  {n}
                </bdi>
              </span>
            ))
          ) : (
            <span className="exam-qn-pending" lang="ar" dir="rtl">
              بانتظار التحقّق من لوح الوزارة
            </span>
          )}
        </p>
        <p className="small">
          <time dateTime={date}>{formatDateOnly(date)}</time>
          {n >= 0 ? <span className="exam-countdown">{relativeDays(n)}</span> : null}
        </p>
        <div className="row exam-tags">
          <span className="badge badge-info">{EXAM_TYPE_LABEL[exam.examType]}</span>
          <CertaintyBadge certainty={exam.certainty} />
          {exam.dateMode === 'window' ? (
            <span className="badge badge-outline">
              نافذة امتحان — يوم {occ.index} من {occ.total}
            </span>
          ) : null}
          {exam.verifiedTime ? <span className="badge badge-lime num">الساعة {exam.verifiedTime}</span> : null}
        </div>
        {detailed ? (
          <dl className="meta-list exam-details">
            <div>
              <dt>لمن هذا الامتحان</dt>
              <dd>
                {exam.tracks.length ? exam.tracks.map((t) => TRACK_LABEL[t]).join('، ') : 'غير محدّد'}
                {exam.grades.length ? ` — الصفوف ${exam.grades.join('، ')}` : ''}
                {exam.classes.length ? ` — الشعب ${exam.classes.join('، ')}` : ''}
                {!exam.eligibilityConfirmed && !exam.tracks.includes('unconfirmed') ? <span className="badge badge-outline exam-unconfirmed">الأهلية غير مؤكّدة</span> : null}
              </dd>
            </div>
            {exam.eligibilityNote ? (
              <div>
                <dt>ملاحظة</dt>
                <dd>{exam.eligibilityNote}</dd>
              </div>
            ) : null}
            <div>
              <dt>الوقت</dt>
              <dd>{exam.verifiedTime ? <span className="num">{exam.verifiedTime}</span> : 'لم يُعلن وقت مؤكَّد بعد'}</dd>
            </div>
            <div>
              <dt>المصدر</dt>
              <dd>
                {exam.sourceUrl ? (
                  <a href={exam.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {exam.sourceNote || 'المصدر الرسمي'} <ExternalLink size={14} aria-hidden="true" style={{ display: 'inline' }} />
                  </a>
                ) : (
                  exam.sourceNote || '—'
                )}
              </dd>
            </div>
            <div>
              <dt>آخر تحقّق</dt>
              <dd>{exam.lastVerifiedOn ? formatDateOnly(exam.lastVerifiedOn) : 'لم يُتحقّق بعد من المصدر الرسمي'}</dd>
            </div>
          </dl>
        ) : null}
      </div>
    </article>
  );
}
