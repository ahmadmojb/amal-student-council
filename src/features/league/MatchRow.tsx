import type { Match } from '../../../shared/schemas';
import { MATCH_STATUS_LABEL, roundName } from '../../../shared/league';
import { formatDateOnly } from '../../../shared/dates';

const STATUS_BADGE: Record<Match['status'], string> = {
  scheduled: 'badge-info',
  live: 'badge-danger badge-live',
  completed: 'badge-success',
  postponed: 'badge-warning',
  cancelled: 'badge-outline',
};

export function stageLabel(m: Match, totalRounds?: number): string {
  if (m.stage === 'final') return 'البطولة النهائية بين أبطال الصفوف';
  const round = totalRounds ? roundName(m.round, totalRounds) : `الدور ${m.round}`;
  return `الصف ${m.grade ?? ''} — ${round}`;
}

export function MatchRow({ m, teamName, totalRounds }: { m: Match; teamName: (id: string | null) => string; totalRounds?: number }) {
  const showScore = (m.status === 'completed' || m.status === 'live') && m.homeScore !== null && m.awayScore !== null;
  const pens = m.homePenalties !== null && m.awayPenalties !== null;
  return (
    <article className="match-row" aria-label={`${teamName(m.homeTeamId)} ضد ${teamName(m.awayTeamId)}`}>
      <div className="match-info">
        <span className={`badge ${STATUS_BADGE[m.status]}`}>{MATCH_STATUS_LABEL[m.status]}</span>
        <span className="xsmall muted">{stageLabel(m, totalRounds)}</span>
      </div>
      <div className="match-teams">
        <span className="team team-home">{teamName(m.homeTeamId)}</span>
        <span className="match-score num" aria-label={showScore ? `النتيجة ${m.homeScore} مقابل ${m.awayScore}` : 'لم تُسجَّل نتيجة'}>
          {showScore ? (
            <>
              <bdi>{m.homeScore}</bdi>
              <span aria-hidden="true">–</span>
              <bdi>{m.awayScore}</bdi>
            </>
          ) : (
            <span className="vs">ضد</span>
          )}
        </span>
        <span className="team team-away">{teamName(m.awayTeamId)}</span>
      </div>
      <div className="match-when xsmall muted">
        {m.date ? <time dateTime={m.date}>{formatDateOnly(m.date)}</time> : <span>الموعد لم يُحدَّد بعد</span>}
        {m.startTime ? <span className="num">الساعة {m.startTime}</span> : null}
        {m.venue ? <span>{m.venue}</span> : null}
        {pens ? (
          <span>
            ركلات الترجيح <bdi className="num">{m.homePenalties}–{m.awayPenalties}</bdi>
          </span>
        ) : null}
      </div>
      {m.notes ? <p className="xsmall">{m.notes}</p> : null}
    </article>
  );
}
