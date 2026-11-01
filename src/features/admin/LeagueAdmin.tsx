import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardEdit, EyeOff, Send, Settings2, Shuffle, Trophy } from 'lucide-react';
import { GRADES, leagueConfigInput, matchInput, TIEBREAKERS, type Grade, type LeagueConfig, type Match, type MatchStatus, type Team } from '../../../shared/schemas';
import { MATCH_STATUS_LABEL, resolvedChampions, roundName, TIEBREAKER_LABEL, type BracketConflict } from '../../../shared/league';
import { formatDateOnly } from '../../../shared/dates';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../components/ui/toast';
import { ConfirmDialog, Dialog } from '../../components/ui/dialog';
import { EmptyState, SkeletonLines } from '../../components/ui/states';
import { CollectionManager, useCollection } from './CollectionManager';
import { adminApi, VISIBILITY_BADGE, VISIBILITY_LABEL } from './adminApi';
import { FormFields, issuesToErrors, type FieldErrors, type FormValues } from './FormFields';

const TABS = [
  ['teams', 'الفرق'],
  ['matches', 'المباريات والنتائج'],
  ['bracket', 'إنشاء الجداول'],
  ['config', 'القوانين والإعدادات'],
] as const;
type Tab = (typeof TABS)[number][0];

function TeamsTab() {
  return (
    <CollectionManager<'teams'>
      collection="teams"
      nested
      title="الفرق"
      singular="فريق"
      description="فريق لكل صف. لا تنشر فرقًا قبل اعتماد مشاركتها."
      fields={[
        { kind: 'text', name: 'className', label: 'الصف/الشعبة', required: true, placeholder: 'مثال: 10/3' },
        { kind: 'select', name: 'grade', label: 'المرحلة', numeric: true, options: GRADES.map((g) => ({ value: g, label: `الصف ${g}` })) },
        { kind: 'text', name: 'displayName', label: 'اسم الفريق المعروض', required: true },
        { kind: 'media', name: 'logoUrl', label: 'شعار الفريق (اختياري، معتمد)' },
        {
          kind: 'select',
          name: 'teamStatus',
          label: 'حالة الفريق',
          options: [
            { value: 'active', label: 'مشارك' },
            { value: 'eliminated', label: 'خرج من المنافسة' },
            { value: 'withdrawn', label: 'انسحب' },
          ],
        },
        { kind: 'textarea', name: 'notes', label: 'ملاحظات داخلية (لا تُنشر)', rows: 2 },
      ]}
      defaults={() => ({ className: '', grade: 10, displayName: '', logoUrl: '', teamStatus: 'active', notes: '', visibility: 'draft' })}
      searchText={(t) => `${t.displayName} ${t.className}`}
      sort={(a, b) => a.grade - b.grade || a.className.localeCompare(b.className, 'ar')}
      columns={[
        { label: 'الفريق', render: (t) => <strong>{t.displayName}</strong> },
        { label: 'الصف', render: (t) => `${t.className} (${t.grade})` },
        { label: 'الحالة', render: (t) => ({ active: 'مشارك', eliminated: 'خرج', withdrawn: 'انسحب' })[t.teamStatus] },
      ]}
    />
  );
}

function ResultDialog({ match, teamName, onClose, onSaved }: { match: Match; teamName: (id: string | null) => string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<MatchStatus>(match.status);
  const [home, setHome] = useState<number | null>(match.homeScore);
  const [away, setAway] = useState<number | null>(match.awayScore);
  const [hp, setHp] = useState<number | null>(match.homePenalties);
  const [ap, setAp] = useState<number | null>(match.awayPenalties);
  const [conflicts, setConflicts] = useState<BracketConflict[] | null>(null);
  const [busy, setBusy] = useState(false);
  const levelKnockout = match.stage === 'knockout' && status === 'completed' && home !== null && home === away;
  const scored = status === 'live' || status === 'completed';

  const submit = async (confirmDownstreamReset: boolean) => {
    setBusy(true);
    try {
      await api(`/api/admin/league/matches/${encodeURIComponent(match.id)}/result`, {
        method: 'POST',
        json: {
          status,
          homeScore: scored ? home : null,
          awayScore: scored ? away : null,
          homePenalties: levelKnockout ? hp : null,
          awayPenalties: levelKnockout ? ap : null,
          confirmDownstreamReset,
        },
      });
      toast('success', 'تم حفظ النتيجة.');
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && Array.isArray(e.body.conflicts)) setConflicts(e.body.conflicts as BracketConflict[]);
      else toast('error', e instanceof ApiError ? e.message : 'تعذّر الحفظ.');
    } finally {
      setBusy(false);
    }
  };

  const num = (v: string) => (v === '' ? null : Math.max(0, Math.min(99, Number(v))));

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={`${teamName(match.homeTeamId)} ضد ${teamName(match.awayTeamId)}`}
        footer={
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => submit(false)}>
              حفظ النتيجة
            </button>
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              إلغاء
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="rs-status">حالة المباراة</label>
          <select id="rs-status" className="select" value={status} onChange={(e) => setStatus(e.target.value as MatchStatus)}>
            {Object.entries(MATCH_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        {scored ? (
          <div className="score-inputs">
            <div className="field">
              <label htmlFor="rs-home">أهداف {teamName(match.homeTeamId)}</label>
              <input id="rs-home" className="input num" type="number" min={0} max={99} value={home ?? ''} onChange={(e) => setHome(num(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="rs-away">أهداف {teamName(match.awayTeamId)}</label>
              <input id="rs-away" className="input num" type="number" min={0} max={99} value={away ?? ''} onChange={(e) => setAway(num(e.target.value))} />
            </div>
          </div>
        ) : null}
        {levelKnockout ? (
          <div className="score-inputs">
            <div className="field">
              <label htmlFor="rs-hp">ركلات ترجيح {teamName(match.homeTeamId)}</label>
              <input id="rs-hp" className="input num" type="number" min={0} max={99} value={hp ?? ''} onChange={(e) => setHp(num(e.target.value))} />
            </div>
            <div className="field">
              <label htmlFor="rs-ap">ركلات ترجيح {teamName(match.awayTeamId)}</label>
              <input id="rs-ap" className="input num" type="number" min={0} max={99} value={ap ?? ''} onChange={(e) => setAp(num(e.target.value))} />
            </div>
          </div>
        ) : null}
        <p className="xsmall muted">
          لا تظهر النتيجة للعامة إلا إذا كانت المباراة منشورة. تعديل نتيجة في خروج المغلوب يُحدِّث الأدوار اللاحقة تلقائيًا.
        </p>
      </Dialog>
      <ConfirmDialog
        open={conflicts !== null}
        title="هذا التعديل يؤثّر على مباريات لُعبت"
        message={
          <div className="stack">
            <p>تغيير الفائز سيغيّر الفريق المتأهّل إلى مباريات لاحقة لها نتائج مسجّلة. عند التأكيد ستُمسح نتائج هذه المباريات وتعود إلى «مجدولة»، ويُسجَّل ذلك في سجلّ العمليات:</p>
            <ul>
              {(conflicts ?? []).map((c) => (
                <li key={c.matchId + c.slot}>
                  <bdi className="ltr">{c.matchId}</bdi>: {teamName(c.currentTeamId)} ← {teamName(c.expectedTeamId)}
                </li>
              ))}
            </ul>
          </div>
        }
        confirmLabel="تأكيد وإعادة ضبط المباريات اللاحقة"
        danger
        busy={busy}
        onConfirm={() => {
          setConflicts(null);
          void submit(true);
        }}
        onCancel={() => setConflicts(null)}
      />
    </>
  );
}

function DetailsDialog({ match, teams, onClose, onSaved }: { match: Match; teams: Team[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { id: _id, createdAt: _c, updatedAt: _u, ...initial } = match;
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const teamOptions = teams.filter((t) => match.stage === 'final' || t.grade === match.grade).map((t) => ({ value: t.id, label: `${t.displayName} (${t.className})` }));

  const save = async () => {
    const parsed = matchInput.safeParse(values);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      return;
    }
    setBusy(true);
    try {
      await adminApi.update('matches', match.id, parsed.data);
      toast('success', 'تم حفظ تفاصيل المباراة.');
      onSaved();
    } catch (e) {
      if (e instanceof ApiError) setErrors(issuesToErrors(e.issues));
      toast('error', e instanceof ApiError ? e.message : 'تعذّر الحفظ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="تفاصيل المباراة"
      wide
      footer={
        <>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
            حفظ
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            إلغاء
          </button>
        </>
      }
    >
      <FormFields
        fields={[
          { kind: 'date', name: 'date', label: 'التاريخ' },
          { kind: 'time', name: 'startTime', label: 'وقت البداية (بعد التأكيد فقط)' },
          { kind: 'text', name: 'venue', label: 'المكان' },
          { kind: 'text', name: 'referee', label: 'الحكم (بعد التأكيد)' },
          { kind: 'textarea', name: 'notes', label: 'ملاحظات منشورة', rows: 2 },
          { kind: 'section', label: 'الفريقان (تعديل يدوي — يُستخدم للاستثناءات فقط)' },
          { kind: 'select', name: 'homeTeamId', label: 'الفريق الأول', options: teamOptions, nullable: true },
          { kind: 'select', name: 'awayTeamId', label: 'الفريق الثاني', options: teamOptions, nullable: true },
        ]}
        values={values}
        errors={errors}
        onChange={(n, v) => setValues((s) => ({ ...s, [n]: v }))}
      />
    </Dialog>
  );
}

function MatchesTab() {
  const toast = useToast();
  const { items: matches, reload } = useCollection('matches');
  const { items: teams } = useCollection('teams');
  const [grade, setGrade] = useState<Grade | 'final'>(10);
  const [resultFor, setResultFor] = useState<Match | null>(null);
  const [detailsFor, setDetailsFor] = useState<Match | null>(null);
  const teamName = (id: string | null) => (id ? (teams?.find((t) => t.id === id)?.displayName ?? '؟') : 'يُحدَّد لاحقًا');

  const list = useMemo(
    () => (matches ?? []).filter((m) => (grade === 'final' ? m.stage === 'final' : m.stage === 'knockout' && m.grade === grade)).sort((a, b) => a.round - b.round || a.slot - b.slot),
    [matches, grade],
  );
  const totalRounds = Math.max(0, ...list.map((m) => m.round));

  const setVis = async (ids: string[], v: 'published' | 'draft') => {
    try {
      for (const id of ids) await adminApi.setVisibility('matches', id, v);
      toast('success', v === 'published' ? 'تم النشر.' : 'أُلغي النشر.');
      reload();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّر تنفيذ العملية.');
    }
  };

  if (!matches || !teams) return <SkeletonLines count={4} height={48} />;

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="segmented" aria-label="المرحلة">
          {GRADES.map((g) => (
            <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}>
              الصف {g}
            </button>
          ))}
          <button type="button" aria-pressed={grade === 'final'} onClick={() => setGrade('final')}>
            البطولة النهائية
          </button>
        </div>
        {list.some((m) => m.visibility !== 'published' && !m.isBye) ? (
          <button type="button" className="btn btn-sm" onClick={() => setVis(list.filter((m) => m.visibility !== 'published').map((m) => m.id), 'published')}>
            <Send aria-hidden="true" /> نشر كل مباريات هذه المرحلة
          </button>
        ) : null}
      </div>
      {list.length === 0 ? (
        <EmptyState title="لا مباريات في هذه المرحلة">أنشئ جدول خروج المغلوب من تبويب «إنشاء الجداول».</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                <th scope="col">الدور</th>
                <th scope="col">المباراة</th>
                <th scope="col">النتيجة</th>
                <th scope="col">الموعد</th>
                <th scope="col">الحالة</th>
                <th scope="col">النشر</th>
                <th scope="col">
                  <span className="visually-hidden">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className={m.isBye ? 'is-muted' : undefined}>
                  <td className="nowrap">{m.stage === 'final' ? `مباراة ${m.round}` : roundName(m.round, totalRounds)}</td>
                  <td>
                    {teamName(m.homeTeamId)} <span className="muted">ضد</span> {m.isBye && !m.awayTeamId ? 'تأهّل مباشر' : teamName(m.awayTeamId)}
                  </td>
                  <td className="num nowrap">
                    {m.homeScore !== null ? (
                      <bdi>
                        {m.homeScore}–{m.awayScore}
                        {m.homePenalties !== null ? ` (${m.homePenalties}–${m.awayPenalties})` : ''}
                      </bdi>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="xsmall nowrap">{m.date ? formatDateOnly(m.date, { weekday: false }) : '—'}</td>
                  <td>{MATCH_STATUS_LABEL[m.status]}</td>
                  <td>
                    <span className={`badge ${VISIBILITY_BADGE[m.visibility]}`}>{VISIBILITY_LABEL[m.visibility]}</span>
                  </td>
                  <td>
                    {m.isBye ? null : (
                      <div className="row-actions">
                        <button type="button" className="btn btn-sm" onClick={() => setResultFor(m)} disabled={!m.homeTeamId || !m.awayTeamId}>
                          <Trophy aria-hidden="true" /> النتيجة
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setDetailsFor(m)}>
                          <ClipboardEdit aria-hidden="true" /> التفاصيل
                        </button>
                        {m.visibility === 'published' ? (
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVis([m.id], 'draft')} aria-label="إلغاء نشر المباراة">
                            <EyeOff aria-hidden="true" />
                          </button>
                        ) : (
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setVis([m.id], 'published')} aria-label="نشر المباراة">
                            <Send aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resultFor ? (
        <ResultDialog
          match={resultFor}
          teamName={teamName}
          onClose={() => setResultFor(null)}
          onSaved={() => {
            setResultFor(null);
            reload();
          }}
        />
      ) : null}
      {detailsFor ? (
        <DetailsDialog
          match={detailsFor}
          teams={teams}
          onClose={() => setDetailsFor(null)}
          onSaved={() => {
            setDetailsFor(null);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function BracketTab() {
  const toast = useToast();
  const { items: teams } = useCollection('teams');
  const { items: matches, reload } = useCollection('matches');
  const [grade, setGrade] = useState<Grade>(10);
  const [order, setOrder] = useState<string[]>([]);
  const [confirmReplace, setConfirmReplace] = useState<'bracket' | 'final' | null>(null);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<LeagueConfig | null>(null);

  useEffect(() => {
    api<LeagueConfig>('/api/admin/league/config').then(setConfig).catch(() => undefined);
  }, []);

  const gradeTeams = useMemo(() => (teams ?? []).filter((t) => t.grade === grade && t.teamStatus !== 'withdrawn'), [teams, grade]);
  useEffect(() => setOrder(gradeTeams.map((t) => t.id)), [gradeTeams]);
  const existing = (matches ?? []).some((m) => m.stage === 'knockout' && m.grade === grade);
  const champions = matches && config ? resolvedChampions(matches, config) : null;
  const name = (id: string | null) => (id ? (teams?.find((t) => t.id === id)?.displayName ?? '؟') : 'لم يُحسم');

  const move = (i: number, d: -1 | 1) => setOrder((o) => {
    const n = [...o];
    const j = i + d;
    if (j < 0 || j >= n.length) return o;
    [n[i], n[j]] = [n[j] as string, n[i] as string];
    return n;
  });

  const generate = async (replaceExisting: boolean) => {
    setBusy(true);
    try {
      await api('/api/admin/league/bracket', { method: 'POST', json: { grade, teamIds: order, replaceExisting } });
      toast('success', `تم إنشاء جدول الصف ${grade}. المباريات محفوظة كمسودة — انشرها من تبويب المباريات.`);
      setConfirmReplace(null);
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConfirmReplace('bracket');
      else toast('error', e instanceof ApiError ? e.message : 'تعذّر الإنشاء.');
    } finally {
      setBusy(false);
    }
  };

  const generateFinal = async (replaceExisting: boolean) => {
    setBusy(true);
    try {
      await api('/api/admin/league/final', { method: 'POST', json: { replaceExisting } });
      toast('success', 'تم إنشاء مباريات البطولة النهائية (مسودة).');
      setConfirmReplace(null);
      reload();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConfirmReplace('final');
      else toast('error', e instanceof ApiError ? e.message : 'تعذّر الإنشاء.');
    } finally {
      setBusy(false);
    }
  };

  if (!teams) return <SkeletonLines count={3} />;

  return (
    <div className="stack">
      <section className="panel panel-pad stack">
        <h2 className="admin-subtitle">
          <Shuffle aria-hidden="true" /> جدول خروج المغلوب لصف
        </h2>
        <div className="segmented" aria-label="الصف">
          {GRADES.map((g) => (
            <button key={g} type="button" aria-pressed={grade === g} onClick={() => setGrade(g)}>
              الصف {g}
            </button>
          ))}
        </div>
        {gradeTeams.length < 2 ? (
          <EmptyState title="يلزم فريقان على الأقل في هذا الصف">أضف الفرق من تبويب «الفرق».</EmptyState>
        ) : (
          <>
            <p className="small muted">رتّب الفرق حسب التصنيف (الأول = المصنّف الأول). عند عدد غير مكتمل، يتأهّل المصنّفون الأوائل مباشرة إلى الدور الثاني.</p>
            <ol className="seed-list">
              {order.map((id, i) => (
                <li key={id}>
                  <span className="num seed-n">{i + 1}</span>
                  <span>{name(id)}</span>
                  <span className="row">
                    <button type="button" className="btn btn-icon btn-sm btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`رفع ${name(id)}`}>
                      <ArrowUp aria-hidden="true" />
                    </button>
                    <button type="button" className="btn btn-icon btn-sm btn-ghost" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`خفض ${name(id)}`}>
                      <ArrowDown aria-hidden="true" />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => (existing ? setConfirmReplace('bracket') : generate(false))}>
              {existing ? 'استبدال الجدول الحالي' : 'إنشاء الجدول'}
            </button>
          </>
        )}
      </section>

      <section className="panel panel-pad stack">
        <h2 className="admin-subtitle">
          <Trophy aria-hidden="true" /> البطولة النهائية بين أبطال الصفوف
        </h2>
        {champions ? (
          <ul className="small">
            {GRADES.map((g) => (
              <li key={g}>
                بطل الصف {g}: <strong>{name(champions[g])}</strong>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="small muted">يُحدَّد البطل تلقائيًا من نهائي كل صف، أو يدويًا من «القوانين والإعدادات».</p>
        <button type="button" className="btn" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => generateFinal(false)}>
          إنشاء مباريات البطولة النهائية
        </button>
      </section>

      <ConfirmDialog
        open={confirmReplace !== null}
        title={confirmReplace === 'final' ? 'استبدال مباريات البطولة النهائية' : `استبدال جدول الصف ${grade}`}
        message={<p>ستُحذف كل المباريات الحالية لهذه المرحلة، بما فيها أي نتائج مسجّلة، وتُنشأ مباريات جديدة. يُسجَّل ذلك في سجلّ العمليات.</p>}
        confirmLabel="حذف وإنشاء من جديد"
        danger
        busy={busy}
        onConfirm={() => (confirmReplace === 'final' ? generateFinal(true) : generate(true))}
        onCancel={() => setConfirmReplace(null)}
      />
    </div>
  );
}

function ConfigTab() {
  const toast = useToast();
  const { items: teams } = useCollection('teams');
  const [values, setValues] = useState<LeagueConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<LeagueConfig>('/api/admin/league/config')
      .then(setValues)
      .catch(() => toast('error', 'تعذّر تحميل الإعدادات.'));
  }, [toast]);

  if (!values) return <SkeletonLines count={4} />;
  const set = <K extends keyof LeagueConfig>(k: K, v: LeagueConfig[K]) => setValues({ ...values, [k]: v });
  const setRule = (k: keyof LeagueConfig['rules'], v: unknown) => setValues({ ...values, rules: { ...values.rules, [k]: v } });
  const teamOpts = (g: Grade | null) => (teams ?? []).filter((t) => g === null || t.grade === g);

  const save = async () => {
    const parsed = leagueConfigInput.safeParse(values);
    if (!parsed.success) {
      toast('error', parsed.error.issues[0]?.message ?? 'قيم غير صالحة.');
      return;
    }
    setBusy(true);
    try {
      setValues(await api<LeagueConfig>('/api/admin/league/config', { method: 'PUT', json: parsed.data }));
      toast('success', 'تم حفظ إعدادات الدوري.');
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّر الحفظ.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <section className="panel panel-pad form-grid">
        <h2 className="admin-subtitle form-section">
          <Settings2 aria-hidden="true" /> عام
        </h2>
        <div className="field">
          <label htmlFor="lc-season">اسم الموسم</label>
          <input id="lc-season" className="input" value={values.seasonLabel} onChange={(e) => set('seasonLabel', e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="lc-status">حالة الدوري</label>
          <select id="lc-status" className="select" value={values.leagueStatus} onChange={(e) => set('leagueStatus', e.target.value as LeagueConfig['leagueStatus'])}>
            <option value="not_started">لم يبدأ</option>
            <option value="registration">تسجيل الفرق</option>
            <option value="in_progress">جارٍ</option>
            <option value="finished">انتهى</option>
          </select>
        </div>
        <div className="field form-wide">
          <label htmlFor="lc-ann">إعلان الدوري (يظهر في صفحة الدوري)</label>
          <textarea id="lc-ann" className="textarea" rows={2} value={values.announcement} onChange={(e) => set('announcement', e.target.value)} />
        </div>
      </section>

      <section className="panel panel-pad form-grid">
        <h2 className="admin-subtitle form-section">قوانين المباريات</h2>
        <label className="check form-wide">
          <input type="checkbox" checked={values.rules.approved} onChange={(e) => setRule('approved', e.target.checked)} />
          القوانين معتمدة من المدرسة (بدون ذلك تظهر للعامة كقوانين مقترحة)
        </label>
        <div className="field">
          <label htmlFor="r-players">عدد اللاعبين في الملعب</label>
          <input id="r-players" className="input num" type="number" min={3} max={11} value={values.rules.playersOnField} onChange={(e) => setRule('playersOnField', Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="r-min">مدة المباراة (دقائق)</label>
          <input id="r-min" className="input num" type="number" min={10} max={90} value={values.rules.matchMinutes} onChange={(e) => setRule('matchMinutes', Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="r-break">الاستراحة (دقائق)</label>
          <input id="r-break" className="input num" type="number" min={0} max={15} value={values.rules.breakMinutes} onChange={(e) => setRule('breakMinutes', Number(e.target.value))} />
        </div>
        <label className="check">
          <input type="checkbox" checked={values.rules.unlimitedSubstitutions} onChange={(e) => setRule('unlimitedSubstitutions', e.target.checked)} />
          تبديلات غير محدودة
        </label>
        <label className="check">
          <input type="checkbox" checked={values.rules.ownClassOnly} onChange={(e) => setRule('ownClassOnly', e.target.checked)} />
          اللاعب يمثّل صفّه (مع استثناءات بإذن الإدارة)
        </label>
        <label className="check">
          <input type="checkbox" checked={values.rules.penaltiesOnKnockoutDraw} onChange={(e) => setRule('penaltiesOnKnockoutDraw', e.target.checked)} />
          ركلات ترجيح عند التعادل في خروج المغلوب
        </label>
        <div className="field form-wide">
          <label htmlFor="r-slot">الموعد المفضّل</label>
          <input id="r-slot" className="input" value={values.rules.preferredSlot} onChange={(e) => setRule('preferredSlot', e.target.value)} />
        </div>
        <div className="field form-wide">
          <label htmlFor="r-ref">التحكيم</label>
          <input id="r-ref" className="input" value={values.rules.refereeNote} onChange={(e) => setRule('refereeNote', e.target.value)} />
        </div>
        <div className="field form-wide">
          <label htmlFor="r-weather">سياسة الطقس</label>
          <input id="r-weather" className="input" value={values.rules.weatherPolicy} onChange={(e) => setRule('weatherPolicy', e.target.value)} />
        </div>
        <div className="field form-wide">
          <label htmlFor="r-notes">ملاحظات إضافية</label>
          <textarea id="r-notes" className="textarea" rows={3} value={values.rules.extraNotes} onChange={(e) => setRule('extraNotes', e.target.value)} />
        </div>
      </section>

      <section className="panel panel-pad form-grid">
        <h2 className="admin-subtitle form-section">النقاط والترتيب (البطولة النهائية)</h2>
        <div className="field">
          <label htmlFor="p-w">نقاط الفوز</label>
          <input id="p-w" className="input num" type="number" min={0} max={10} value={values.pointsWin} onChange={(e) => set('pointsWin', Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="p-d">نقاط التعادل</label>
          <input id="p-d" className="input num" type="number" min={0} max={10} value={values.pointsDraw} onChange={(e) => set('pointsDraw', Number(e.target.value))} />
        </div>
        <div className="field">
          <label htmlFor="p-l">نقاط الخسارة</label>
          <input id="p-l" className="input num" type="number" min={0} max={10} value={values.pointsLoss} onChange={(e) => set('pointsLoss', Number(e.target.value))} />
        </div>
        <fieldset className="field fieldset form-wide">
          <legend className="field-label">معايير الحسم عند التساوي بالنقاط (بالترتيب)</legend>
          <ol className="seed-list">
            {values.tiebreakers.map((t, i) => (
              <li key={t}>
                <span className="num seed-n">{i + 1}</span>
                <span>{TIEBREAKER_LABEL[t]}</span>
                <span className="row">
                  <button type="button" className="btn btn-icon btn-sm btn-ghost" aria-label={`رفع ${TIEBREAKER_LABEL[t]}`} disabled={i === 0} onClick={() => {
                    const n = [...values.tiebreakers];
                    [n[i - 1], n[i]] = [n[i] as typeof t, n[i - 1] as typeof t];
                    set('tiebreakers', n);
                  }}>
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => set('tiebreakers', values.tiebreakers.filter((x) => x !== t))}>
                    إزالة
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <div className="row">
            {TIEBREAKERS.filter((t) => !values.tiebreakers.includes(t)).map((t) => (
              <button key={t} type="button" className="btn btn-sm" onClick={() => set('tiebreakers', [...values.tiebreakers, t])}>
                + {TIEBREAKER_LABEL[t]}
              </button>
            ))}
          </div>
          <span className="field-hint">إذا بقي التساوي بعد كل المعايير، يُعرض الفريقان متساويين مع ملاحظة، ولا يخترع الموقع حسمًا.</span>
        </fieldset>
        <label className="check form-wide">
          <input type="checkbox" checked={values.tiebreakersApproved} onChange={(e) => set('tiebreakersApproved', e.target.checked)} />
          معايير الحسم معتمدة من المدرسة
        </label>
      </section>

      <section className="panel panel-pad form-grid">
        <h2 className="admin-subtitle form-section">تحديد الأبطال يدويًا (اختياري)</h2>
        <p className="xsmall muted form-wide">اتركها فارغة ليُحسب البطل تلقائيًا من النتائج.</p>
        {GRADES.map((g) => {
          const key = `g${g}` as 'g10' | 'g11' | 'g12';
          return (
            <div key={g} className="field">
              <label htmlFor={`co-${g}`}>بطل الصف {g}</label>
              <select id={`co-${g}`} className="select" value={values.championOverrides[key]} onChange={(e) => set('championOverrides', { ...values.championOverrides, [key]: e.target.value })}>
                <option value="">تلقائي</option>
                {teamOpts(g).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
        <div className="field">
          <label htmlFor="co-all">بطل المدرسة</label>
          <select id="co-all" className="select" value={values.overallChampionOverride} onChange={(e) => set('overallChampionOverride', e.target.value)}>
            <option value="">تلقائي</option>
            {teamOpts(null).map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName}
              </option>
            ))}
          </select>
        </div>
      </section>
      <button type="submit" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={busy}>
        حفظ إعدادات الدوري
      </button>
    </form>
  );
}

export function LeagueAdmin() {
  const [tab, setTab] = useState<Tab>('teams');
  return (
    <div className="stack">
      <div className="admin-head">
        <div>
          <h1>الدوري المدرسي</h1>
          <p className="muted small">الفرق، الجداول، النتائج والأبطال. كل التعديلات تُسجَّل في سجلّ العمليات.</p>
        </div>
      </div>
      <div className="tabs-scroll">
        <div className="segmented" role="tablist" aria-label="أقسام الدوري">
          {TABS.map(([t, l]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel">
        {tab === 'teams' && <TeamsTab />}
        {tab === 'matches' && <MatchesTab />}
        {tab === 'bracket' && <BracketTab />}
        {tab === 'config' && <ConfigTab />}
      </div>
    </div>
  );
}
