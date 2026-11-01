/**
 * إدارة فيديو البرنامج المدرسي اليومي — publish the one daily source, either
 * an uploaded file or an external link (direct MP4/WebM, YouTube, Vimeo), and
 * replace or delete it. Upload uses XMLHttpRequest for progress + cancel:
 *  - signed mode (production): PUT straight to Firebase Storage, then /finalize;
 *  - direct mode (demo): multipart POST to this server.
 * The video is verified in the browser (it must actually play) before upload,
 * and again on the server (container signature, size) before it is published.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Film, Link2, Loader2, Trash2, Upload, X } from 'lucide-react';
import type { ScheduleVideoPublic } from '../../../shared/schemas';
import { PROVIDER_LABEL, parseExternalVideoUrl, type ParsedVideoUrl } from '../../../shared/video-source';
import type { AdminScheduleVideo } from '../../../shared/api-types';
import { formatTimestamp, todayInSchool } from '../../../shared/dates';
import { api, ApiError } from '../../lib/api';
import { useToast } from '../../components/ui/toast';
import { ConfirmDialog } from '../../components/ui/dialog';
import { SkeletonLines } from '../../components/ui/states';
import { scheduleDateLabel, ScheduleVideoPlayer, type PlayerStatus } from '../schedule/ScheduleVideo';

type UploadTarget = { mode: 'direct' } | { mode: 'signed'; url: string; method: 'PUT'; headers: Record<string, string> };

const ACCEPT = 'video/mp4,video/webm,.mp4,.m4v,.webm';

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} ميغابايت`;
}

/** XHR with progress; resolves with the parsed JSON body. */
function send(xhr: XMLHttpRequest, method: string, url: string, body: XMLHttpRequestBodyInit, headers: Record<string, string>, onProgress: (p: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    xhr.open(method, url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : {};
      } catch {
        /* storage PUT returns no JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(typeof data.message === 'string' ? data.message : xhr.status === 413 ? 'حجم الفيديو أكبر من الحد المسموح.' : 'فشل رفع الفيديو.', xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError('انقطع الاتصال أثناء رفع الفيديو.', 0));
    xhr.onabort = () => reject(new ApiError('أُلغي رفع الفيديو.', -1));
    xhr.send(body);
  });
}

/** Option B: paste a link, preview it in the real player, then publish. */
function ExternalLinkForm({ hasActive, onPublished }: { hasActive: boolean; onPublished: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedVideoUrl | null>(null);
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const check = () => {
    setStatus(null);
    const r = parseExternalVideoUrl(url);
    if (!r.ok) {
      setParsed(null);
      setError(r.error);
      return;
    }
    setError(null);
    setParsed(r.value);
  };

  const preview: ScheduleVideoPublic | null = parsed
    ? {
        id: `preview-${parsed.playUrl}`,
        provider: parsed.provider,
        url: parsed.playUrl,
        ...(parsed.videoId ? { videoId: parsed.videoId } : {}),
        ...(parsed.mimeType ? { mimeType: parsed.mimeType } : {}),
        scheduleDate: todayInSchool(),
        expiresAt: Number.MAX_SAFE_INTEGER,
        uploadedAt: Date.now(),
      }
    : null;

  const publish = async () => {
    if (!parsed || !status?.ok) return;
    setBusy(true);
    try {
      await api('/api/admin/schedule-video/external', { method: 'POST', json: { url } });
      toast('success', 'تم نشر رابط فيديو البرنامج اليومي. يظهر الآن لجميع الزوار.');
      setUrl('');
      setParsed(null);
      setStatus(null);
      onPublished();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّر نشر الرابط.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="sv-url">رابط الفيديو</label>
        <div className="row">
          <input
            id="sv-url"
            className="input"
            type="url"
            dir="ltr"
            inputMode="url"
            placeholder="أدخل رابط الفيديو هنا"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setParsed(null);
              setStatus(null);
              setError(null);
            }}
            aria-describedby="sv-url-hint"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="button" className="btn" onClick={check} disabled={!url.trim()}>
            معاينة الرابط
          </button>
        </div>
        <span id="sv-url-hint" className="field-hint">
          رابط https عامّ لملف MP4 أو WebM، أو رابط فيديو من YouTube أو Vimeo يمكن لأي زائر مشاهدته. لا يُنسخ الفيديو إلى الموقع، ويُزال الرابط من البرنامج تلقائيًا عند منتصف الليل.
        </span>
        {error ? (
          <span className="field-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
      {preview ? (
        <div className="sv-admin-preview">
          <p className="xsmall muted">معاينة ({PROVIDER_LABEL[preview.provider]}) — تأكّد أن الفيديو يعمل قبل النشر.</p>
          <ScheduleVideoPlayer video={preview} variant="page" onStatus={setStatus} />
          {status && !status.ok ? (
            <span className="field-error" role="alert">
              {status.message} استخدم رابطًا مباشرًا عامًّا لملف الفيديو أو رابطًا من منصة مدعومة.
            </span>
          ) : null}
        </div>
      ) : null}
      <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!parsed || !status?.ok || busy} onClick={publish}>
        {busy || (parsed && !status) ? <Loader2 className="spin" aria-hidden="true" /> : <Link2 aria-hidden="true" />}
        {hasActive ? 'نشر الرابط بدل الفيديو الحالي' : 'نشر الرابط'}
      </button>
    </div>
  );
}

export function ScheduleVideoAdmin() {
  const toast = useToast();
  const [info, setInfo] = useState<AdminScheduleVideo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [playable, setPlayable] = useState<boolean | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<'upload' | 'link'>('upload');
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<AdminScheduleVideo>('/api/admin/schedule-video')
      .then(setInfo)
      .catch(() => toast('error', 'تعذّر تحميل حالة الفيديو.'));
  }, [toast]);
  useEffect(load, [load]);
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const choose = (f: File | null) => {
    setFileError(null);
    setPlayable(null);
    setFile(null);
    setPreview(null);
    if (!f) return;
    const okType = /^video\/(mp4|webm)$/.test(f.type) || /\.(mp4|m4v|webm)$/i.test(f.name);
    if (!okType) return setFileError('صيغة غير مدعومة. اختر فيديو MP4 (H.264/AAC) أو WebM.');
    if (info && f.size > info.maxBytes) return setFileError(`حجم الفيديو (${mb(f.size)}) أكبر من الحد المسموح (${mb(info.maxBytes)}).`);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const upload = async () => {
    if (!file || !playable) return;
    setProgress(0);
    const headers = { 'x-amal-request': '1' };
    try {
      const { uploadId, target } = await api<{ uploadId: string; target: UploadTarget }>('/api/admin/schedule-video/upload-target', {
        method: 'POST',
        json: { name: file.name, size: file.size, type: file.type },
      });
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;
      if (target.mode === 'signed') {
        await send(xhr, 'PUT', target.url, file, target.headers, setProgress);
        xhrRef.current = null;
        await api('/api/admin/schedule-video/finalize', { method: 'POST', json: { uploadId } });
      } else {
        xhr.withCredentials = true;
        const fd = new FormData();
        fd.append('video', file);
        await send(xhr, 'POST', '/api/admin/schedule-video/upload', fd, headers, setProgress);
      }
      toast('success', 'تم نشر فيديو البرنامج اليومي. يظهر الآن لجميع الزوار.');
      choose(null);
      if (inputRef.current) inputRef.current.value = '';
      load();
    } catch (e) {
      const aborted = e instanceof ApiError && e.status === -1;
      toast('error', e instanceof ApiError ? e.message : 'فشل رفع الفيديو.');
      if (!aborted) load();
    } finally {
      xhrRef.current = null;
      setProgress(null);
    }
  };

  const remove = async () => {
    try {
      await api('/api/admin/schedule-video', { method: 'DELETE' });
      toast('success', 'تم حذف فيديو البرنامج اليومي.');
      load();
    } catch (e) {
      toast('error', e instanceof ApiError ? e.message : 'تعذّر الحذف.');
    } finally {
      setConfirmDelete(false);
    }
  };

  const uploading = progress !== null;
  const current = info?.current ?? null;

  return (
    <section className="panel panel-pad stack" aria-labelledby="sv-admin-title">
      <h2 id="sv-admin-title" className="admin-subtitle">
        <Film aria-hidden="true" /> إدارة فيديو البرنامج المدرسي اليومي
      </h2>

      {!info ? (
        <SkeletonLines count={1} height={60} />
      ) : current && info.active ? (
        <div className="sv-admin-current">
          <dl className="meta-list">
            <div>
              <dt>الحالة</dt>
              <dd>
                <span className="badge badge-success">منشور لجميع الزوار</span>
              </dd>
            </div>
            <div>
              <dt>المصدر</dt>
              <dd>{current.source.type === 'uploaded' ? 'ملف مرفوع من الجهاز' : `رابط خارجي — ${PROVIDER_LABEL[current.source.provider]}`}</dd>
            </div>
            <div>
              <dt>اليوم المعروض</dt>
              <dd>{scheduleDateLabel(current.scheduleDate)}</dd>
            </div>
            <div>
              <dt>وقت النشر</dt>
              <dd>{formatTimestamp(current.uploadedAt)}</dd>
            </div>
            <div>
              <dt>الحذف التلقائي</dt>
              <dd>{formatTimestamp(current.expiresAt)} (منتصف الليل في نهاية اليوم)</dd>
            </div>
            <div>
              <dt>{current.source.type === 'uploaded' ? 'الملف' : 'الرابط'}</dt>
              <dd>
                {current.source.type === 'uploaded' ? (
                  <>
                    <bdi>{current.source.originalName}</bdi> — {mb(current.source.size)}
                  </>
                ) : (
                  <a href={current.source.externalUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="sv-admin-link">
                    {current.source.externalUrl}
                  </a>
                )}
              </dd>
            </div>
          </dl>
          <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => setConfirmDelete(true)} disabled={uploading}>
            <Trash2 aria-hidden="true" /> {current.source.type === 'uploaded' ? 'حذف الفيديو الآن' : 'إزالة الرابط الآن'}
          </button>
        </div>
      ) : (
        <div className="notice notice-warning">لا يوجد فيديو منشور لهذا اليوم. الزوار يرون رسالة «لم يتم رفع برنامج المدرسة لهذا اليوم بعد».</div>
      )}

      <div className="sv-source-tabs" role="radiogroup" aria-label="مصدر فيديو البرنامج">
        <label className={mode === 'upload' ? 'on' : undefined}>
          <input type="radio" name="sv-mode" checked={mode === 'upload'} onChange={() => setMode('upload')} disabled={uploading} />
          <Upload aria-hidden="true" /> رفع فيديو من الجهاز
        </label>
        <label className={mode === 'link' ? 'on' : undefined}>
          <input type="radio" name="sv-mode" checked={mode === 'link'} onChange={() => setMode('link')} disabled={uploading} />
          <Link2 aria-hidden="true" /> إضافة رابط فيديو خارجي
        </label>
      </div>

      {mode === 'link' ? <ExternalLinkForm hasActive={Boolean(current && info?.active)} onPublished={load} /> : null}

      {mode === 'upload' ? (
      <>
      <div className="field">
        <label htmlFor="sv-file">{current && info?.active ? 'استبدال الفيديو بفيديو جديد' : 'اختيار فيديو البرنامج'}</label>
        <input
          ref={inputRef}
          id="sv-file"
          type="file"
          accept={ACCEPT}
          className="input"
          disabled={uploading}
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
          aria-describedby="sv-hint"
        />
        <span id="sv-hint" className="field-hint">
          MP4 (H.264/AAC) أو WebM، حتى {info ? mb(info.maxBytes) : '…'}. يُرفع الملف كما هو دون إعادة ضغط. يُعرض الفيديو مع تاريخ يوم الرفع ويُحذف تلقائيًا عند منتصف الليل.
        </span>
        {fileError ? (
          <span className="field-error" role="alert">
            {fileError}
          </span>
        ) : null}
      </div>

      {preview ? (
        <div className="sv-admin-preview">
          <p className="xsmall muted">معاينة قبل الرفع ({file ? mb(file.size) : ''})</p>
          <video
            src={preview}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => setPlayable(Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0 && e.currentTarget.videoWidth > 0)}
            onError={() => {
              setPlayable(false);
              setFileError('لا يمكن تشغيل هذا الفيديو في المتصفح. حوّله إلى MP4 (H.264/AAC) ثم أعد المحاولة.');
            }}
          />
        </div>
      ) : null}

      {uploading ? (
        <div className="sv-progress" role="status" aria-live="polite">
          <div className="sv-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="تقدّم الرفع">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="num">{progress}%</span>
          <button type="button" className="btn btn-sm" onClick={() => xhrRef.current?.abort()}>
            <X aria-hidden="true" /> إلغاء الرفع
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!file || playable !== true} onClick={upload}>
          {file && playable === null ? <Loader2 className="spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {current && info?.active ? 'رفع ونشر بدل الفيديو الحالي' : 'رفع ونشر الفيديو'}
        </button>
      )}
      </>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title="حذف فيديو البرنامج اليومي"
        message={
          <p>{current?.source.type === 'external' ? 'سيختفي الفيديو فورًا من الموقع ومن شاشات الممرّ. (لا يُحذف الفيديو من موقعه الأصلي.)' : 'سيختفي الفيديو فورًا من الموقع ومن شاشات الممرّ، ويُحذف الملف من التخزين.'}</p>
        }
        confirmLabel="حذف الفيديو"
        danger
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
