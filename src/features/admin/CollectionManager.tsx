/**
 * Generic management screen used by every content section:
 * list + search + status filter, create/edit with validation, preview,
 * publish / unpublish / archive, and delete with confirmation.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Archive, Eye, EyeOff, Pencil, Plus, Search, Send, Trash2 } from 'lucide-react';
import type { ZodType } from 'zod';
import { collectionSchemas, type CollectionName, type CollectionRecordMap, type Visibility } from '../../../shared/schemas';
import { formatTimestamp } from '../../../shared/dates';
import { normalizeArabic } from '../../../shared/bagrut';
import { ApiError } from '../../lib/api';
import { useToast } from '../../components/ui/toast';
import { ConfirmDialog, Dialog } from '../../components/ui/dialog';
import { EmptyState, ErrorState, SkeletonLines } from '../../components/ui/states';
import { adminApi, VISIBILITY_BADGE, VISIBILITY_LABEL } from './adminApi';
import { FormFields, issuesToErrors, type FieldDef, type FieldErrors, type FormValues } from './FormFields';

export interface Column<R> {
  label: string;
  render: (r: R) => ReactNode;
  className?: string;
}

export interface ManagerProps<C extends CollectionName> {
  collection: C;
  title: string;
  description?: ReactNode;
  singular: string;
  columns: Array<Column<CollectionRecordMap[C]>>;
  fields: FieldDef[];
  defaults: () => FormValues;
  searchText: (r: CollectionRecordMap[C]) => string;
  preview?: (values: FormValues) => ReactNode;
  sort?: (a: CollectionRecordMap[C], b: CollectionRecordMap[C]) => number;
  /** Extra controls rendered above the list (e.g. links to related tools). */
  toolbarExtra?: ReactNode;
  onChanged?: () => void;
  /** Render the title as h2 when embedded under another page heading. */
  nested?: boolean;
}

function stripSystem(r: Record<string, unknown>): FormValues {
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = r;
  return rest;
}

export function useCollection<C extends CollectionName>(collection: C) {
  const [items, setItems] = useState<CollectionRecordMap[C][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    adminApi
      .list(collection)
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'تعذّر تحميل البيانات.'));
  }, [collection]);
  useEffect(reload, [reload]);
  return { items, error, reload };
}

export function CollectionManager<C extends CollectionName>(props: ManagerProps<C>) {
  const { collection, title, description, singular, columns, fields, defaults, searchText, preview, sort, toolbarExtra, onChanged, nested } = props;
  const Heading = nested ? 'h2' : 'h1';
  const toast = useToast();
  const { items, error, reload } = useCollection(collection);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Visibility | ''>('');
  const [editing, setEditing] = useState<{ id: string | null; values: FormValues } | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showPreview, setShowPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ record: CollectionRecordMap[C]; action: 'delete' | 'archive' } | null>(null);

  const refresh = () => {
    reload();
    onChanged?.();
  };

  const list = useMemo(() => {
    const q = normalizeArabic(query);
    return (items ?? [])
      .filter((r) => (!status || r.visibility === status) && (!q || normalizeArabic(searchText(r)).includes(q)))
      .sort(sort ?? ((a, b) => b.updatedAt - a.updatedAt));
  }, [items, query, status, searchText, sort]);

  const save = async (visibility?: Visibility) => {
    if (!editing) return;
    const body = visibility ? { ...editing.values, visibility } : editing.values;
    const schema = collectionSchemas[collection] as ZodType;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error.issues));
      setShowPreview(false);
      toast('error', 'راجع الحقول المعلَّمة.');
      return;
    }
    setBusy(true);
    try {
      if (editing.id) await adminApi.update(collection, editing.id, parsed.data);
      else await adminApi.create(collection, parsed.data);
      toast('success', visibility === 'published' ? `تم نشر ${singular}.` : `تم حفظ ${singular}.`);
      setEditing(null);
      setErrors({});
      refresh();
    } catch (e) {
      if (e instanceof ApiError && e.issues.length) setErrors(issuesToErrors(e.issues));
      toast('error', e instanceof ApiError ? e.message : 'تعذّر الحفظ.');
    } finally {
      setBusy(false);
    }
  };

  const changeVisibility = async (r: CollectionRecordMap[C], v: Visibility) => {
    try {
      await adminApi.setVisibility(collection, r.id, v);
      toast('success', v === 'published' ? 'تم النشر.' : v === 'archived' ? 'تمت الأرشفة.' : 'أُلغي النشر وأصبح مسودة.');
      refresh();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّر تنفيذ العملية.');
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === 'delete') {
        await adminApi.remove(collection, confirm.record.id);
        toast('success', 'تم الحذف.');
      } else {
        await adminApi.setVisibility(collection, confirm.record.id, 'archived');
        toast('success', 'تمت الأرشفة.');
      }
      setConfirm(null);
      refresh();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّر تنفيذ العملية.');
    } finally {
      setBusy(false);
    }
  };

  const onFieldChange = (name: string, value: unknown) => {
    setEditing((e) => (e ? { ...e, values: { ...e.values, [name]: value } } : e));
    setErrors((errs) => {
      if (!errs[name]) return errs;
      const { [name]: _removed, ...rest } = errs;
      return rest;
    });
  };

  return (
    <section className="stack" aria-labelledby={`mgr-${collection}`}>
      <div className="admin-head">
        <div>
          <Heading id={`mgr-${collection}`}>{title}</Heading>
          {description ? <p className="muted small">{description}</p> : null}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditing({ id: null, values: defaults() });
            setErrors({});
            setShowPreview(false);
          }}
        >
          <Plus aria-hidden="true" /> إضافة {singular}
        </button>
      </div>
      {toolbarExtra}
      <div className="toolbar">
        <div className="field search">
          <label htmlFor={`${collection}-q`}>بحث</label>
          <Search aria-hidden="true" />
          <input id={`${collection}-q`} className="input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 220 }}>
          <label htmlFor={`${collection}-s`}>الحالة</label>
          <select id={`${collection}-s`} className="select" value={status} onChange={(e) => setStatus(e.target.value as Visibility | '')}>
            <option value="">الكل</option>
            <option value="published">منشور</option>
            <option value="draft">مسودة</option>
            <option value="archived">مؤرشف</option>
          </select>
        </div>
      </div>

      {error ? (
        <ErrorState>
          <p>{error}</p>
        </ErrorState>
      ) : items === null ? (
        <SkeletonLines count={3} height={52} />
      ) : list.length === 0 ? (
        <EmptyState title={items.length === 0 ? `لا يوجد أي ${singular} بعد` : 'لا نتائج مطابقة'}>{items.length === 0 ? `اضغط «إضافة ${singular}» للبدء.` : null}</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table admin-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.label} scope="col" className={c.className}>
                    {c.label}
                  </th>
                ))}
                <th scope="col">الحالة</th>
                <th scope="col">آخر تعديل</th>
                <th scope="col">
                  <span className="visually-hidden">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  {columns.map((c) => (
                    <td key={c.label} className={c.className}>
                      {c.render(r)}
                    </td>
                  ))}
                  <td>
                    <span className={`badge ${VISIBILITY_BADGE[r.visibility]}`}>{VISIBILITY_LABEL[r.visibility]}</span>
                  </td>
                  <td className="xsmall muted nowrap">{formatTimestamp(r.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-sm" onClick={() => {
                          setEditing({ id: r.id, values: stripSystem(r as unknown as Record<string, unknown>) });
                          setErrors({});
                          setShowPreview(false);
                        }}>
                        <Pencil aria-hidden="true" /> تعديل
                      </button>
                      {r.visibility !== 'published' ? (
                        <button type="button" className="btn btn-sm" onClick={() => changeVisibility(r, 'published')}>
                          <Send aria-hidden="true" /> نشر
                        </button>
                      ) : (
                        <button type="button" className="btn btn-sm" onClick={() => changeVisibility(r, 'draft')}>
                          <EyeOff aria-hidden="true" /> إلغاء النشر
                        </button>
                      )}
                      {r.visibility !== 'archived' ? (
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirm({ record: r, action: 'archive' })} aria-label={`أرشفة ${searchText(r).slice(0, 40)}`}>
                          <Archive aria-hidden="true" />
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => setConfirm({ record: r, action: 'delete' })} aria-label={`حذف ${searchText(r).slice(0, 40)}`}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => !busy && setEditing(null)}
        title={editing?.id ? `تعديل ${singular}` : `إضافة ${singular}`}
        wide
        footer={
          <>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => save('published')}>
              <Send aria-hidden="true" /> حفظ ونشر
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => save(editing?.values.visibility === 'published' ? undefined : 'draft')}>
              {editing?.values.visibility === 'published' ? 'حفظ التعديلات' : 'حفظ كمسودة'}
            </button>
            {preview ? (
              <button type="button" className="btn btn-ghost" onClick={() => setShowPreview((s) => !s)} aria-pressed={showPreview}>
                <Eye aria-hidden="true" /> {showPreview ? 'العودة إلى النموذج' : 'معاينة'}
              </button>
            ) : null}
          </>
        }
      >
        {editing ? (
          showPreview && preview ? (
            <div className="admin-preview">
              <p className="xsmall muted">معاينة: هكذا سيظهر للزوار بعد النشر.</p>
              {preview(editing.values)}
            </div>
          ) : (
            <>
              {Object.keys(errors).length ? (
                <div className="notice notice-danger" role="alert">
                  يوجد {Object.keys(errors).length} {Object.keys(errors).length === 1 ? 'حقل يحتاج' : 'حقول تحتاج'} إلى تصحيح.
                </div>
              ) : null}
              <FormFields fields={fields} values={editing.values} errors={errors} onChange={onFieldChange} />
            </>
          )
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.action === 'delete' ? `حذف ${singular}` : `أرشفة ${singular}`}
        message={
          confirm?.action === 'delete' ? (
            <p>
              سيُحذف «{confirm ? searchText(confirm.record).slice(0, 80) : ''}» نهائيًا ويختفي من الموقع. لا يمكن التراجع عن الحذف. إن أردت الاحتفاظ بالسجل، استخدم الأرشفة بدلًا من ذلك.
            </p>
          ) : (
            <p>سيختفي «{confirm ? searchText(confirm.record).slice(0, 80) : ''}» من الموقع العام ويبقى محفوظًا في لوحة الإدارة.</p>
          )
        }
        confirmLabel={confirm?.action === 'delete' ? 'حذف نهائي' : 'أرشفة'}
        danger={confirm?.action === 'delete'}
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
