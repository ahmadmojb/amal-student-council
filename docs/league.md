# Football league

Default structure (configurable, subject to school approval):
1. Single-elimination bracket per grade (10, 11, 12), seeded by the order the admin sets.
   Non-power-of-two team counts give byes to the top seeds (standard seeding 1-8-4-5-2-7-3-6).
2. The three grade champions play a round-robin final (3 matches).

Logic: `shared/league.ts` (pure, unit-tested).

* **Winner**: higher score; knockout draws require penalties (validated); final-stage draws
  count as draws. Scores only show publicly for published live/completed matches.
* **Progression**: each knockout match stores `nextMatchId` + `nextSlot`; after every
  result the whole grade bracket is re-derived.
* **Corrections**: if a corrected result changes who should play in a later match that
  already has a result, the API returns **409 with the conflicts**. The admin sees the
  affected matches and must confirm; confirmed corrections reset those later matches
  (status back to scheduled, scores cleared) and are audited as `result-correction+reset`.
* **Champion**: winner of a grade's last round, or a manual override.
* **Final table**: points (default 3/1/0), then the configured tie-breakers in order
  (default: head-to-head → goal difference → goals scored, marked *proposed* until the
  school approves). If teams are still level, they share a rank and are flagged
  `unresolvedTie` — the app never invents an official tie-break.
* **Overall champion**: top of the final table once every final match is completed and the
  top spot is not tied, or a manual override.

Proposed match rules shown publicly (badge "مقترحة — بانتظار موافقة المدرسة" until approved):
5 players incl. goalkeeper, unlimited substitutions, own-class players, ~25 min incl. a
short break, preferred slot after the third lesson, PE teacher as referee (if confirmed),
penalties for tied knockout matches, weather postponements.

No teams, fixtures, results or champions are shipped. `npm run seed:demo-samples` creates
clearly-labelled "تجريبي" teams in demo mode only.
