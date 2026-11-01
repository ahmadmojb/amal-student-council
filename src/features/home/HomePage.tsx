import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, CalendarClock, MapPin, MonitorPlay, Trophy, Ticket, Users } from 'lucide-react';
import { useDocumentTitle, useNow, useToday } from '../../hooks/useToday';
import { usePublicData } from '../../lib/public-data';
import { daysBetween, formatClock, relativeDays, SCHOOL_TZ } from '../../../shared/dates';
import { benefitState, isScheduleNoticeLive, values } from '../../../shared/visibility';
import { SectionHead } from '../../components/ui/page';
import { EmptyState, PublicDataGate } from '../../components/ui/states';
import { AnnouncementItem, useLiveAnnouncements } from './Announcements';
import { useLeague, LEAGUE_STATUS_LABEL } from '../league/useLeague';
import { MatchRow } from '../league/MatchRow';
import { ExamRow, useExamOccurrences } from '../bagrut/ExamRow';
import { BenefitCard } from '../benefits/BenefitCard';
import { ActivityCard } from '../activities/ActivityCard';

function TodayHeading() {
  const now = useNow(30_000);
  const weekday = new Intl.DateTimeFormat('ar-u-nu-latn', { timeZone: SCHOOL_TZ, weekday: 'long' }).format(now);
  const date = new Intl.DateTimeFormat('ar-u-nu-latn', { timeZone: SCHOOL_TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  return (
    <div className="today-heading">
      <span className="today-weekday">{weekday}</span>
      <span className="today-date">
        {date}
        <span className="today-clock num" aria-label={`الساعة ${formatClock(now)}`}>
          {formatClock(now)}
        </span>
      </span>
    </div>
  );
}

/** "Today board": the four things a student checks first, in one glance. */
function TodayBoard() {
  const today = useToday();
  const { state } = usePublicData();
  const occurrences = useExamOccurrences();
  const league = useLeague();
  const announcements = useLiveAnnouncements();
  const nextExam = occurrences.find((o) => o.date >= today);
  const nextMatch = league.live[0] ?? league.upcoming.find((m) => m.date && m.date >= today);
  const urgent = announcements.filter((a) => a.priority === 'urgent').length;
  const ready = state === 'ready';

  return (
    <aside className="today-board" aria-label="لوحة اليوم">
      <TodayHeading />
      <ul className="today-list">
        <li>
          <Link to="/program" className="today-item">
            <CalendarClock aria-hidden="true" />
            <span>
              <strong>البرنامج اليومي</strong>
              <span>فيديو برنامج اليوم من إدارة المجلس</span>
            </span>
          </Link>
        </li>
        <li>
          <Link to="/bagrut" className="today-item">
            <BookOpenCheck aria-hidden="true" />
            <span>
              <strong>أقرب امتحان بجروت</strong>
              <span>{!ready ? '…' : nextExam ? `${nextExam.exam.nameAr} — ${relativeDays(daysBetween(today, nextExam.date))}` : 'لا امتحانات قادمة منشورة'}</span>
            </span>
          </Link>
        </li>
        <li>
          <Link to="/league" className="today-item">
            <Trophy aria-hidden="true" />
            <span>
              <strong>{nextMatch?.status === 'live' ? 'مباراة جارية الآن' : 'المباراة القادمة'}</strong>
              <span>{!ready ? '…' : nextMatch ? `${league.teamName(nextMatch.homeTeamId)} ضد ${league.teamName(nextMatch.awayTeamId)}` : 'لا مباريات مؤكّدة بعد'}</span>
            </span>
          </Link>
        </li>
        {urgent > 0 ? (
          <li>
            <a href="#announcements" className="today-item today-urgent">
              <span className="today-dot" aria-hidden="true" />
              <span>
                <strong>{urgent === 1 ? 'إعلان عاجل' : `${urgent} إعلانات عاجلة`}</strong>
                <span>اقرأها في قسم الإعلانات</span>
              </span>
            </a>
          </li>
        ) : null}
      </ul>
    </aside>
  );
}

function Hero() {
  const { data } = usePublicData();
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero-grid">
        <div className="hero-copy">
          <p className="hero-school">المدرسة الثانوية الشاملة عمال يوسف شاهين – الطيبة</p>
          <h1 id="hero-title">مجلس الطلاب</h1>
          <p className="hero-welcome">{data.settings?.welcomeMessage ?? 'هنا تجد إعلانات المجلس، برنامج اليوم، مواعيد البجروت، والدوري المدرسي — في مكان واحد.'}</p>
          <nav className="hero-links" aria-label="اختصارات">
            <Link to="/program" className="btn btn-primary">
              <CalendarClock aria-hidden="true" /> برنامج اليوم
            </Link>
            <Link to="/bagrut" className="btn">
              <BookOpenCheck aria-hidden="true" /> مواعيد البجروت
            </Link>
            <Link to="/league" className="btn">
              <Trophy aria-hidden="true" /> الدوري
            </Link>
            <Link to="/services" className="btn">
              <MapPin aria-hidden="true" /> أين أجد…؟
            </Link>
          </nav>
        </div>
        <TodayBoard />
      </div>
    </section>
  );
}

function AnnouncementsSection() {
  const list = useLiveAnnouncements();
  return (
    <section className="home-section container" aria-labelledby="announcements">
      <SectionHead id="announcements" title="إعلانات مهمّة" note="ما ينشره مجلس الطلاب والمدرسة، الأحدث والأهم أولًا." />
      <PublicDataGate>
        {list.length === 0 ? (
          <EmptyState title="لا توجد إعلانات حاليًا">ستظهر هنا إعلانات المجلس فور نشرها.</EmptyState>
        ) : (
          <div className="announcements">
            {list.slice(0, 4).map((a) => (
              <AnnouncementItem key={a.id} a={a} />
            ))}
          </div>
        )}
      </PublicDataGate>
    </section>
  );
}

function ProgramSection() {
  const { data } = usePublicData();
  const today = useToday();
  const notices = useMemo(() => values(data.scheduleNotices).filter((n) => isScheduleNoticeLive(n, today)).sort((a, b) => a.order - b.order), [data.scheduleNotices, today]);
  return (
    <section className="home-section container" aria-labelledby="program-home">
      <div className="program-teaser">
        <div>
          <h2 id="program-home">برنامج اليوم</h2>
          <p>
            يرفع مجلس الطلاب فيديو البرنامج المدرسي كل صباح، ويظهر هنا وعلى شاشات الممرّ حتى نهاية اليوم.</p>
          <div className="row" style={{ marginTop: 'var(--s4)' }}>
            <Link to="/program" className="btn btn-accent">
              <CalendarClock aria-hidden="true" /> افتح البرنامج اليومي
            </Link>
            <Link to="/display" className="btn btn-ghost">
              <MonitorPlay aria-hidden="true" /> عرض شاشة الممرّ
            </Link>
          </div>
        </div>
        <div className="program-notes">
          <h3>ملاحظات المجلس حول برنامج اليوم</h3>
          {notices.length === 0 ? (
            <p className="small muted">لا توجد ملاحظات لهذا اليوم.</p>
          ) : (
            <ul>
              {notices.slice(0, 3).map((n) => (
                <li key={n.id}>
                  <strong>{n.title}</strong>
                  {n.body ? <span>{n.body}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function LeagueSection() {
  const league = useLeague();
  const today = useToday();
  const next = league.live[0] ?? league.upcoming.find((m) => m.date >= today) ?? league.upcoming[0];
  const recent = league.results.slice(0, 3);
  const hasData = league.matches.length > 0;
  return (
    <section className="home-section container" aria-labelledby="league-home">
      <SectionHead id="league-home" title="دوري كرة القدم المدرسي" note={`حالة الدوري: ${LEAGUE_STATUS_LABEL[league.config.leagueStatus]}`} to="/league" linkLabel="صفحة الدوري" />
      <PublicDataGate>
        {!hasData ? (
          <EmptyState title="لم تُنشر مباريات بعد" icon={<Trophy aria-hidden="true" />}>
            سيظهر هنا جدول المباريات والنتائج فور اعتماده من المجلس.
          </EmptyState>
        ) : (
          <div className="league-home">
            <div>
              <h3 className="sub-title">{next?.status === 'live' ? 'جارية الآن' : 'المباراة القادمة'}</h3>
              {next ? <MatchRow m={next} teamName={league.teamName} /> : <p className="small muted">لا مباريات قادمة مؤكّدة.</p>}
            </div>
            <div>
              <h3 className="sub-title">آخر النتائج</h3>
              {recent.length ? (
                <div className="stack">
                  {recent.map((m) => (
                    <MatchRow key={m.id} m={m} teamName={league.teamName} />
                  ))}
                </div>
              ) : (
                <p className="small muted">لم تُسجَّل نتائج بعد.</p>
              )}
            </div>
          </div>
        )}
      </PublicDataGate>
    </section>
  );
}

function BagrutSection() {
  const occurrences = useExamOccurrences();
  const today = useToday();
  const upcoming = occurrences.filter((o) => o.date >= today).slice(0, 4);
  return (
    <section className="home-section container" aria-labelledby="bagrut-home">
      <SectionHead id="bagrut-home" title="امتحانات البجروت القادمة" note="المواعيد المؤقّتة مُعلَّمة بوضوح حتى يتم التحقّق منها." to="/bagrut" linkLabel="التقويم الكامل" />
      <PublicDataGate>
        {upcoming.length === 0 ? (
          <EmptyState title="لا امتحانات قادمة منشورة" />
        ) : (
          <div className="exam-list">
            {upcoming.map((o) => (
              <ExamRow key={o.key} occ={o} today={today} />
            ))}
          </div>
        )}
      </PublicDataGate>
    </section>
  );
}

function BenefitsSection() {
  const { data } = usePublicData();
  const today = useToday();
  const active = useMemo(() => values(data.benefits).filter((b) => benefitState(b, today) === 'active').slice(0, 3), [data.benefits, today]);
  return (
    <section className="home-section container" aria-labelledby="benefits-home">
      <SectionHead id="benefits-home" title="خصومات للطلاب" note="عروض اتفق عليها المجلس وتحقّق منها." to="/benefits" />
      <PublicDataGate>
        {active.length === 0 ? (
          <EmptyState title="لا توجد عروض فعّالة حاليًا" icon={<Ticket aria-hidden="true" />}>
            يعمل المجلس على الاتفاق مع محالّ في المنطقة. ستظهر العروض هنا بعد التحقّق منها.
          </EmptyState>
        ) : (
          <div className="grid grid-auto">
            {active.map((b) => (
              <BenefitCard key={b.id} b={b} state="active" />
            ))}
          </div>
        )}
      </PublicDataGate>
    </section>
  );
}

function ServicesSection() {
  const { data } = usePublicData();
  const services = useMemo(() => values(data.services).sort((a, b) => a.order - b.order).slice(0, 8), [data.services]);
  return (
    <section className="home-section container" aria-labelledby="services-home">
      <SectionHead id="services-home" title="خدمات المدرسة" note="أين تجد السكرتارية، المستشار، المكتبة وغيرها." to="/services" />
      <PublicDataGate>
        {services.length === 0 ? (
          <EmptyState title="دليل الخدمات قيد الإعداد">سيُنشر بعد تأكيد المواقع والأوقات من إدارة المدرسة.</EmptyState>
        ) : (
          <ul className="service-chips">
            {services.map((s) => (
              <li key={s.id}>
                <Link to={`/services?open=${s.id}`}>
                  <strong>{s.name}</strong>
                  {s.room || s.building ? <span className="xsmall muted">{[s.building, s.room && `غرفة ${s.room}`].filter(Boolean).join('، ')}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PublicDataGate>
    </section>
  );
}

function ActivitiesSection() {
  const { data } = usePublicData();
  const recent = useMemo(
    () => values(data.activities).sort((a, b) => Number(b.featured) - Number(a.featured) || b.date.localeCompare(a.date)).slice(0, 3),
    [data.activities],
  );
  return (
    <section className="home-section container" aria-labelledby="activities-home">
      <SectionHead id="activities-home" title="من نشاطات المجلس" to="/activities" linkLabel="أرشيف النشاطات" />
      <PublicDataGate>
        {recent.length === 0 ? (
          <EmptyState title="لم تُنشر نشاطات بعد" icon={<Users aria-hidden="true" />} />
        ) : (
          <div className="grid grid-auto">
            {recent.map((a) => (
              <ActivityCard key={a.id} a={a} />
            ))}
          </div>
        )}
      </PublicDataGate>
    </section>
  );
}

export function HomePage() {
  useDocumentTitle('');
  return (
    <>
      <Hero />
      <AnnouncementsSection />
      <ProgramSection />
      <LeagueSection />
      <BagrutSection />
      <BenefitsSection />
      <ServicesSection />
      <ActivitiesSection />
    </>
  );
}

