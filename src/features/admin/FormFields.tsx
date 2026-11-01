/**
 * Declarative admin form fields. Each manager describes its form as a list of
 * FieldDef; this renderer produces accessible labelled controls and shows
 * per-field validation messages (from the shared zod schema or the server).
 */
import { useId, useState, type ReactNode } from 'react';
import { ImagePlus, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { adminApi } from './adminApi';
import { ApiError } from '../../lib/api';

export type FieldDef =
  | { kind: 'text' | 'url' | 'date' | 'time'; name: string; label: string; hint?: string; required?: boolean; placeholder?: string; ltr?: boolean }
  | { kind: 'textarea'; name: string; label: string; hint?: string; required?: boolean; rows?: number }
  | { kind: 'number'; name: string; label: string; hint?: string; nullable?: boolean; min?: number; max?: number; step?: number }
  | { kind: 'select'; name: string; label: string; hint?: string; options: Array<{ value: string | number; label: string }>; numeric?: boolean; nullable?: boolean }
  | { kind: 'checkbox'; name: string; label: string; hint?: string }
  | { kind: 'multi'; name: string; label: string; hint?: string; options: Array<{ value: string | number; label: string }>; numeric?: boolean }
  | { kind: 'tags'; name: string; label: string; hint?: string; placeholder?: string }
  | { kind: 'dates'; name: string; label: string; hint?: string }
  | { kind: 'media'; name: string; label: string; hint?: string; accept?: 'image' | 'attachment'; altName?: string }
  | { kind: 'photos'; name: string; label: string; hint?: string }
  | { kind: 'links'; name: string; label: string; hint?: string }
  | { kind: 'section'; label: string; name?: undefined };

export type FormValues = Record<string, unknown>;
export type FieldErrors = Record<string, string>;

function Field({ id, label, hint, error, children, required }: { id: string; label: string; hint?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={`${id}-err`} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  return [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
}

function Uploader({ accept, onUploaded, label }: { accept: 'image' | 'attachment'; onUploaded: (url: string) => void; label: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = useId();
  return (
    <span className="uploader">
      <label htmlFor={id} className={`btn btn-sm${busy ? ' is-busy' : ''}`}>
        {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
        {label}
      </label>
      <input
        id={id}
        type="file"
        className="visually-hidden"
        accept={accept === 'image' ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'}
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setErr(null);
          try {
            const r = await adminApi.upload(file, accept);
            onUploaded(r.url);
          } catch (ex) {
            setErr(ex instanceof ApiError ? ex.message : 'تعذّر رفع الملف.');
          } finally {
            setBusy(false);
          }
        }}
      />
      {err ? <span className="field-error">{err}</span> : null}
    </span>
  );
}

export function FormFields({ fields, values, errors, onChange }: { fields: FieldDef[]; values: FormValues; errors: FieldErrors; onChange: (name: string, value: unknown) => void }) {
  const base = useId();
  return (
    <div className="form-grid">
      {fields.map((f, i) => {
        if (f.kind === 'section') {
          return (
            <h3 key={`s${i}`} className="form-section">
              {f.label}
            </h3>
          );
        }
        const id = `${base}-${f.name}`;
        const err = errors[f.name];
        const v = values[f.name];
        const aria = { 'aria-invalid': err ? true : undefined, 'aria-describedby': describedBy(id, f.hint, err) };

        switch (f.kind) {
          case 'text':
          case 'url':
          case 'date':
          case 'time':
            return (
              <Field key={f.name} id={id} label={f.label} hint={f.hint} error={err} required={f.required}>
                <input
                  id={id}
                  className={`input${f.ltr || f.kind === 'url' ? ' ltr' : ''}`}
                  type={f.kind === 'text' ? 'text' : f.kind}
                  value={String(v ?? '')}
                  placeholder={f.placeholder}
                  onChange={(e) => onChange(f.name, e.target.value)}
                  {...aria}
                />
              </Field>
            );
          case 'textarea':
            return (
              <Field key={f.name} id={id} label={f.label} hint={f.hint} error={err} required={f.required}>
                <textarea id={id} className="textarea" rows={f.rows ?? 4} value={String(v ?? '')} onChange={(e) => onChange(f.name, e.target.value)} {...aria} />
              </Field>
            );
          case 'number':
            return (
              <Field key={f.name} id={id} label={f.label} hint={f.hint} error={err}>
                <input
                  id={id}
                  className="input num"
                  type="number"
                  inputMode="decimal"
                  min={f.min}
                  max={f.max}
                  step={f.step ?? 1}
                  value={v === null || v === undefined ? '' : String(v)}
                  onChange={(e) => onChange(f.name, e.target.value === '' ? (f.nullable ? null : 0) : Number(e.target.value))}
                  {...aria}
                />
              </Field>
            );
          case 'select':
            return (
              <Field key={f.name} id={id} label={f.label} hint={f.hint} error={err}>
                <select
                  id={id}
                  className="select"
                  value={v === null || v === undefined ? '' : String(v)}
                  onChange={(e) => onChange(f.name, e.target.value === '' && f.nullable ? null : f.numeric ? Number(e.target.value) : e.target.value)}
                  {...aria}
                >
                  {f.nullable ? <option value="">—</option> : null}
                  {f.options.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            );
          case 'checkbox':
            return (
              <div key={f.name} className="field">
                <label className="check">
                  <input type="checkbox" checked={Boolean(v)} onChange={(e) => onChange(f.name, e.target.checked)} />
                  {f.label}
                </label>
                {f.hint ? <span className="field-hint">{f.hint}</span> : null}
                {err ? <span className="field-error">{err}</span> : null}
              </div>
            );
          case 'multi': {
            const arr = (Array.isArray(v) ? v : []) as Array<string | number>;
            return (
              <fieldset key={f.name} className="field fieldset">
                <legend className="field-label">{f.label}</legend>
                <div className="row">
                  {f.options.map((o) => (
                    <label key={String(o.value)} className="check">
                      <input
                        type="checkbox"
                        checked={arr.includes(o.value)}
                        onChange={(e) => onChange(f.name, e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
                {f.hint ? <span className="field-hint">{f.hint}</span> : null}
                {err ? <span className="field-error">{err}</span> : null}
              </fieldset>
            );
          }
          case 'tags': {
            const arr = (Array.isArray(v) ? v : []) as string[];
            return (
              <Field key={f.name} id={id} label={f.label} hint={f.hint ?? 'افصل بين القيم بفاصلة'} error={err}>
                <input
                  id={id}
                  className="input"
                  defaultValue={arr.join('، ')}
                  placeholder={f.placeholder}
                  onBlur={(e) =>
                    onChange(
                      f.name,
                      e.target.value
                        .split(/[،,]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    )
                  }
                  {...aria}
                />
              </Field>
            );
          }
          case 'dates': {
            const arr = (Array.isArray(v) ? v : []) as string[];
            return (
              <fieldset key={f.name} className="field fieldset">
                <legend className="field-label">{f.label}</legend>
                <div className="stack" style={{ gap: 'var(--s2)' }}>
                  {arr.map((d, idx) => (
                    <div key={idx} className="row">
                      <input
                        type="date"
                        className="input"
                        style={{ maxWidth: 220 }}
                        aria-label={`التاريخ ${idx + 1}`}
                        value={d}
                        onChange={(e) => onChange(f.name, arr.map((x, j) => (j === idx ? e.target.value : x)))}
                      />
                      <button type="button" className="btn btn-sm btn-ghost" aria-label={`حذف التاريخ ${idx + 1}`} onClick={() => onChange(f.name, arr.filter((_, j) => j !== idx))}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => onChange(f.name, [...arr, ''])}>
                    <Plus aria-hidden="true" /> إضافة تاريخ
                  </button>
                </div>
                {f.hint ? <span className="field-hint">{f.hint}</span> : null}
                {Object.entries(errors)
                  .filter(([k]) => k === f.name || k.startsWith(`${f.name}.`))
                  .map(([k, m]) => (
                    <span key={k} className="field-error">
                      {m}
                    </span>
                  ))}
              </fieldset>
            );
          }
          case 'media':
            return (
              <Field key={f.name} id={id} label={f.label} hint={f.hint} error={err}>
                <div className="media-field">
                  {v && f.accept !== 'attachment' ? <img src={String(v)} alt="" className="media-preview" /> : null}
                  <input id={id} className="input ltr" value={String(v ?? '')} onChange={(e) => onChange(f.name, e.target.value)} placeholder="https://… أو ارفع ملفًا" {...aria} />
                  <div className="row">
                    <Uploader accept={f.accept ?? 'image'} label={f.accept === 'attachment' ? 'رفع ملف' : 'رفع صورة'} onUploaded={(url) => onChange(f.name, url)} />
                    {v ? (
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(f.name, '')}>
                        إزالة
                      </button>
                    ) : null}
                  </div>
                </div>
              </Field>
            );
          case 'photos': {
            const arr = (Array.isArray(v) ? v : []) as Array<{ url: string; alt: string; approved: boolean }>;
            const set = (next: typeof arr) => onChange(f.name, next);
            return (
              <fieldset key={f.name} className="field fieldset">
                <legend className="field-label">{f.label}</legend>
                {f.hint ? <span className="field-hint">{f.hint}</span> : null}
                <div className="photo-grid">
                  {arr.map((p, idx) => (
                    <div key={p.url + idx} className="photo-item">
                      <img src={p.url} alt="" />
                      <input className="input" aria-label={`وصف الصورة ${idx + 1}`} placeholder="وصف الصورة (للقارئات الصوتية)" value={p.alt} onChange={(e) => set(arr.map((x, j) => (j === idx ? { ...x, alt: e.target.value } : x)))} />
                      <label className="check xsmall">
                        <input type="checkbox" checked={p.approved} onChange={(e) => set(arr.map((x, j) => (j === idx ? { ...x, approved: e.target.checked } : x)))} />
                        أؤكّد وجود موافقة المدرسة على نشر هذه الصورة
                      </label>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => set(arr.filter((_, j) => j !== idx))}>
                        <Trash2 aria-hidden="true" /> حذف
                      </button>
                    </div>
                  ))}
                </div>
                <Uploader accept="image" label="إضافة صورة" onUploaded={(url) => set([...arr, { url, alt: '', approved: false }])} />
                {Object.entries(errors)
                  .filter(([k]) => k === f.name || k.startsWith(`${f.name}.`))
                  .map(([k, m]) => (
                    <span key={k} className="field-error">
                      {m}
                    </span>
                  ))}
              </fieldset>
            );
          }
          case 'links': {
            const arr = (Array.isArray(v) ? v : []) as Array<{ label: string; url: string }>;
            const set = (next: typeof arr) => onChange(f.name, next);
            return (
              <fieldset key={f.name} className="field fieldset">
                <legend className="field-label">{f.label}</legend>
                {arr.map((l, idx) => (
                  <div key={idx} className="row">
                    <input className="input" style={{ flex: '1 1 160px' }} aria-label="نص الرابط" placeholder="نص الرابط" value={l.label} onChange={(e) => set(arr.map((x, j) => (j === idx ? { ...x, label: e.target.value } : x)))} />
                    <input className="input ltr" style={{ flex: '2 1 220px' }} aria-label="العنوان" placeholder="https://" value={l.url} onChange={(e) => set(arr.map((x, j) => (j === idx ? { ...x, url: e.target.value } : x)))} />
                    <button type="button" className="btn btn-sm btn-ghost" aria-label="حذف الرابط" onClick={() => set(arr.filter((_, j) => j !== idx))}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => set([...arr, { label: '', url: '' }])}>
                  <ImagePlus aria-hidden="true" /> إضافة رابط
                </button>
                {f.hint ? <span className="field-hint">{f.hint}</span> : null}
                {Object.entries(errors)
                  .filter(([k]) => k.startsWith(`${f.name}`))
                  .map(([k, m]) => (
                    <span key={k} className="field-error">
                      {m}
                    </span>
                  ))}
              </fieldset>
            );
          }
        }
      })}
    </div>
  );
}

/** Converts zod / server issues to a field → message map. */
export function issuesToErrors(issues: ReadonlyArray<{ path: string | ReadonlyArray<PropertyKey>; message: string }>): FieldErrors {
  const out: FieldErrors = {};
  for (const i of issues) {
    const key = typeof i.path === 'string' ? i.path : i.path.map(String).join('.');
    if (!out[key]) out[key] = i.message;
  }
  return out;
}
