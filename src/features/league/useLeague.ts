import { useMemo } from 'react';
import type { Grade, LeagueConfig, Match, Team } from '../../../shared/schemas';
import { DEFAULT_LEAGUE_CONFIG } from '../../../shared/defaults';
import { values } from '../../../shared/visibility';
import { computeStandings, finalChampionshipTeams, overallChampion, resolvedChampions, sortMatchesChronologically, type StandingRow } from '../../../shared/league';
import { usePublicData } from '../../lib/public-data';

export interface LeagueView {
  config: LeagueConfig;
  teams: Map<string, Team>;
  teamList: Team[];
  /** Published, non-bye matches in chronological order. */
  matches: Match[];
  /** Including byes (needed to draw brackets). */
  allMatches: Match[];
  upcoming: Match[];
  results: Match[];
  live: Match[];
  champions: Record<Grade, string | null>;
  finalTable: StandingRow[];
  overall: string | null;
  teamName: (id: string | null) => string;
}

const DEFAULT_CONFIG = DEFAULT_LEAGUE_CONFIG;

export function useLeague(): LeagueView {
  const { data } = usePublicData();
  return useMemo(() => {
    const config = data.leagueConfig ? { ...DEFAULT_CONFIG, ...data.leagueConfig } : DEFAULT_CONFIG;
    const teamList = values(data.teams).sort((a, b) => a.grade - b.grade || a.displayName.localeCompare(b.displayName, 'ar'));
    const teams = new Map(teamList.map((t) => [t.id, t]));
    const allMatches = sortMatchesChronologically(values(data.matches));
    const matches = allMatches.filter((m) => !m.isBye);
    const teamName = (id: string | null) => (id ? (teams.get(id)?.displayName ?? 'فريق غير منشور') : 'يُحدَّد لاحقًا');
    const finals = matches.filter((m) => m.stage === 'final');
    return {
      config,
      teams,
      teamList,
      matches,
      allMatches,
      upcoming: matches.filter((m) => m.status === 'scheduled' || m.status === 'postponed'),
      results: [...matches.filter((m) => m.status === 'completed')].reverse(),
      live: matches.filter((m) => m.status === 'live'),
      champions: resolvedChampions(allMatches, config),
      finalTable: computeStandings(finalChampionshipTeams(finals), finals, config, (id) => teamName(id)),
      overall: overallChampion(allMatches, config),
      teamName,
    };
  }, [data.leagueConfig, data.teams, data.matches]);
}

export const LEAGUE_STATUS_LABEL: Record<LeagueConfig['leagueStatus'], string> = {
  not_started: 'لم يبدأ بعد',
  registration: 'مرحلة تسجيل الفرق',
  in_progress: 'جارٍ',
  finished: 'انتهى',
};
