import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Crown, Trophy } from 'lucide-react';
import { PageHeader } from '../../components/ui/page';
import { EmptyState, PublicDataGate } from '../../components/ui/states';
import { GRADES } from '../../../shared/constants';
import type { Grade, Match } from '../../../shared/schemas';
import { matchOutcome, roundName, TIEBREAKER_LABEL, tally, type StandingRow } from '../../../shared/league';
import { useLeague, LEAGUE_STATUS_LABEL, type LeagueView } from './useLeague';
import { MatchRow } from './MatchRow';

const VIEWS = [
  ['all', 'كل المباريات'],
  ['upcoming', 'القادمة'],
  ['results', 'النتائج'],
  ['bracket', 'جداول خروج المغلوب'],
  ['standings', 'الترتيب'],
  ['champions', 'الأبطال'],
  ['final', 'البطولة النهائية'],
] as const;
type View = (typeof VIEWS)[number][0];

function totalRoundsFor(league: LeagueView, grade: Grade | null): number {
  if (grade === null) return 0;
  return Math.max(0, ...league.allMatches.filter((m) => m.stage === 'knockout' && m.grade === grade).map((m) => m.round));
}

function MatchList({ list, league, empty }: { list: Match[]; league: LeagueView; empty: string }) {
  if (list.length === 0) return <EmptyState title={empty} />;
  return (
    <div className="match-list">
      {list.map((m) => (
        <MatchRow key={m.id} m={m} teamName={league.teamName} totalRounds={totalRoundsFor(league, m.grade)} />
      ))}
    </div>
  );
}

function Bracket({ league, grade }: { league: LeagueView; grade: Grade }) {
  const matches = league.allMatches.filter((m) => m.stage === 'knockout' && m.grade === grade);
  if (matches.length === 0) return <EmptyState title={`لم يُنشر جدول الصف ${grade} بعد`} />;
  const total = Math.max(...matches.map((m) => m.round));
  const rounds = Array.from({ length: total }, (_, i) => matches.filter((m) => m.round === i + 1).sort((a, b) => a.slot - b.slot));
  return (
    <div className="bracket-scroll" tabIndex={0} aria-label={`جدول خروج المغلوب — الصف ${grade}`}>
      <ol className="bracket" style={{ gridTemplateColumns: `repeat(${total}, minmax(200px, 1fr))` }}>
        {rounds.map((list, i) => (
          <li key={i} className="bracket-round">
            <h3>{roundName(i + 1, total)}</h3>
            <ul>
              {list.map((m) => {
                const out = matchOutcome(m);
                const scored = m.homeScore !== null && m.awayScore !== null && (m.status === 'completed' || m.status === 'live');
                return (
                  <li key={m.id} className={`bracket-match${m.isBye ? ' is-bye' : ''}`}>
                    {(['home', 'away'] as const).map((side) => {
                      const id = side === 'home' ? m.homeTeamId : m.awayTeamId;
                      const score = side === 'home' ? m.homeScore : m.awayScore;
                      const pens = side === 'home' ? m.homePenalties : m.awayPenalties;
                      const won = out.winnerId !== null && out.winnerId === id;
                      return (
                        <div key={side} className={`bracket-team${won ? ' won' : ''}`}>
                          <span>{m.isBye && !id ? 'تأهّل مباشر' : league.teamName(id)}</span>
                          <span className="num">
                            {scored ? score : ''}
                            {scored && pens !== null ? <small> ({pens})</small> : null}
                          </span>
                        </div>
                      );
                    })}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StandingsTable({ rows, league, caption }: { rows: StandingRow[]; league: LeagueView; caption: string }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">الفريق</th>
            <th scope="col" className="num" title="لعب">لعب</th>
            <th scope="col" className="num" title="فوز">ف</th>
            <th scope="col" className="num" title="تعادل">ت</th>
            <th scope="col" className="num" title="خسارة">خ</th>
            <th scope="col" className="num" title="له">له</th>
            <th scope="col" className="num" title="عليه">عليه</th>
            <th scope="col" className="num" title="فارق الأهداف">الفارق</th>
            <th scope="col" className="num">النقاط</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.teamId}>
              <td className="num">
                {r.rank}
                {r.unresolvedTie ? <span title="تعادل لم تحسمه معايير الترتيب المعتمدة"> *</span> : null}
              </td>
              <th scope="row" style={{ fontWeight: 600 }}>
                {league.teamName(r.teamId)}
              </th>
              <td className="num">{r.played}</td>
              <td className="num">{r.wins}</td>
              <td className="num">{r.draws}</td>
              <td className="num">{r.losses}</td>
              <td className="num">{r.goalsFor}</td>
              <td className="num">{r.goalsAgainst}</td>
              <td className="num">
                <bdi>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</bdi>
              </td>
              <td className="num">
                <strong>{r.points}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rules({ league }: { league: LeagueView }) {
  const r = league.config.rules;
  return (
    <details className="panel panel-pad rules">
      <summary>
        <strong>قوانين الدوري</strong>
        {r.approved ? <span className="badge badge-success">معتمدة من المدرسة</span> : <span className="badge badge-warning">مقترحة — بانتظار موافقة المدرسة</span>}
      </summary>
      <ul>
        <li>{r.playersOnField} لاعبين في الملعب لكل فريق، بمن فيهم حارس المرمى.</li>
        {r.unlimitedSubstitutions ? <li>تبديلات غير محدودة.</li> : null}
        {r.ownClassOnly ? <li>يمثّل اللاعب صفّه، إلا باستثناء تأذن به الإدارة.</li> : null}
        <li>
          مدة المباراة نحو {r.matchMinutes} دقيقة، تشمل استراحة قصيرة ({r.breakMinutes} دقائق).
        </li>
        {r.preferredSlot ? <li>الموعد المفضّل: {r.preferredSlot}.</li> : null}
        {r.refereeNote ? <li>التحكيم: {r.refereeNote}.</li> : null}
        {r.penaltiesOnKnockoutDraw ? <li>التعادل في أدوار خروج المغلوب يُحسم بركلات الترجيح.</li> : null}
        {r.weatherPolicy ? <li>{r.weatherPolicy}</li> : null}
        <li>
          النقاط في البطولة النهائية: الفوز {league.config.pointsWin}، التعادل {league.config.pointsDraw}، الخسارة {league.config.pointsLoss}.
        </li>
        <li>
          معايير الترتيب عند التساوي بالنقاط: {league.config.tiebreakers.map((t) => TIEBREAKER_LABEL[t]).join('، ') || 'لا شيء'}
          {league.config.tiebreakersApproved ? '' : ' (مقترحة)'}.
        </li>
      </ul>
      {r.extraNotes ? <p className="small">{r.extraNotes}</p> : null}
    </details>
  );
}

export default function LeaguePage() {
  const league = useLeague();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.some(([v]) => v === params.get('view')) ? params.get('view') : 'all') as View;
  const gradeParam = Number(params.get('grade'));
  const grade = (GRADES as readonly number[]).includes(gradeParam) ? (gradeParam as Grade) : null;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const byGrade = (list: Match[]) => (grade ? list.filter((m) => m.grade === grade) : list);
  const teamRows = useMemo(() => {
    const ids = league.teamList.filter((t) => !grade || t.grade === grade).map((t) => t.id);
    return [...tally(ids, league.matches, league.config).values()].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor).map((r, i) => ({ ...r, rank: i + 1 }));
  }, [league, grade]);

  const showGradeFilter = view === 'all' || view === 'upcoming' || view === 'results' || view === 'bracket' || view === 'standings';

  return (
    <>
      <PageHeader title="دوري كرة القدم المدرسي" intro="خروج المغلوب داخل كل صف، ثم بطولة نهائية بنظام الدوري بين أبطال الصفوف العاشر والحادي عشر والثاني عشر.">
        <div className="row" style={{ marginTop: 'var(--s3)' }}>
          <span className="badge badge-info">حالة الدوري: {LEAGUE_STATUS_LABEL[league.config.leagueStatus]}</span>
          {league.config.seasonLabel ? <span className="badge badge-outline">{league.config.seasonLabel}</span> : null}
        </div>
      </PageHeader>
      <div className="container stack">
        {league.config.announcement ? <div className="notice">{league.config.announcement}</div> : null}
        <div className="tabs-scroll">
          <div className="segmented" role="tablist" aria-label="عرض الدوري">
            {VIEWS.map(([v, label]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => set({ view: v === 'all' ? null : v })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {showGradeFilter ? (
          <div className="segmented" aria-label="الصف">
            <button type="button" aria-pressed={grade === null} onClick={() => set({ grade: null })} disabled={view === 'bracket'}>
              كل الصفوف
            </button>
            {GRADES.map((g) => (
              <button key={g} type="button" aria-pressed={grade === g || (view === 'bracket' && grade === null && g === 10)} onClick={() => set({ grade: String(g) })}>
                الصف {g}
              </button>
            ))}
          </div>
        ) : null}

        <PublicDataGate>
          <div role="tabpanel">
            {view === 'all' && <MatchList list={byGrade(league.matches)} league={league} empty="لا توجد مباريات منشورة بعد" />}
            {view === 'upcoming' && <MatchList list={byGrade([...league.live, ...league.upcoming])} league={league} empty="لا توجد مباريات قادمة" />}
            {view === 'results' && <MatchList list={byGrade(league.results)} league={league} empty="لم تُسجَّل نتائج بعد" />}
            {view === 'bracket' && <Bracket league={league} grade={grade ?? 10} />}
            {view === 'standings' &&
              (teamRows.length === 0 ? (
                <EmptyState title="لا توجد فرق منشورة بعد" />
              ) : (
                <div className="stack">
                  <p className="small muted">سجلّ الفرق من المباريات المنتهية. في أدوار خروج المغلوب تُحسب نتيجة الوقت الأصلي فقط؛ ركلات الترجيح لا تُضاف للأهداف.</p>
                  <StandingsTable rows={teamRows} league={league} caption="سجلّ الفرق" />
                </div>
              ))}
            {view === 'champions' && (
              <div className="champions">
                {GRADES.map((g) => (
                  <div key={g} className="champion panel panel-pad">
                    <Crown aria-hidden="true" />
                    <p className="small muted">بطل الصف {g}</p>
                    <p className="champion-name">{league.champions[g] ? league.teamName(league.champions[g]) : 'لم يُحسم بعد'}</p>
                  </div>
                ))}
                <div className="champion champion-overall panel panel-pad">
                  <Trophy aria-hidden="true" />
                  <p className="small muted">بطل المدرسة</p>
                  <p className="champion-name">{league.overall ? league.teamName(league.overall) : 'لم يُحسم بعد'}</p>
                </div>
              </div>
            )}
            {view === 'final' &&
              (league.finalTable.length === 0 ? (
                <EmptyState title="البطولة النهائية لم تبدأ بعد">تُنشأ بعد حسم أبطال الصفوف الثلاثة.</EmptyState>
              ) : (
                <div className="stack">
                  <StandingsTable rows={league.finalTable} league={league} caption="ترتيب البطولة النهائية" />
                  {league.finalTable.some((r) => r.unresolvedTie) ? <p className="xsmall muted">* فرق متساوية لم تحسمها معايير الترتيب المعتمدة؛ يحسمها منظّمو الدوري.</p> : null}
                  <MatchList list={league.matches.filter((m) => m.stage === 'final')} league={league} empty="" />
                </div>
              ))}
          </div>
        </PublicDataGate>
        <Rules league={league} />
      </div>
    </>
  );
}
