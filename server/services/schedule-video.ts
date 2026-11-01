/**
 * Daily schedule video: one active source — an uploaded file OR an external
 * link (direct MP4/WebM, YouTube, Vimeo) — valid until the midnight that ends
 * its publication day in Asia/Jerusalem. Only uploaded files are deleted from
 * storage; an expired external link is simply removed from the schedule.
 *
 * Database paths:
 *   content/scheduleVideo/current          private record (ScheduleVideoRecord)
 *   public/scheduleVideo                   public projection (ScheduleVideoPublic)
 *   private/scheduleVideoTrash/<videoId>   storage objects awaiting deletion (retried until done)
 *   private/scheduleVideoPending/<id>      signed uploads not yet finalised
 *
 * Safety rules:
 *  - a new video is published only after its file is stored and verified;
 *  - the previous file is queued for deletion only in the same atomic update
 *    that publishes the replacement;
 *  - expiry removes the record with a transaction that checks the video id,
 *    so a cleanup run that started before a replacement cannot remove it;
 *  - the trash never deletes the object path of the currently active video.
 */
import { randomUUID } from 'node:crypto';
import type { Store } from '../store/types.js';
import { endOfSchoolDay, todayInSchool } from '../../shared/dates.js';
import type { ScheduleVideoMime, ScheduleVideoPublic, ScheduleVideoRecord, ScheduleVideoSource } from '../../shared/schemas.js';
import { parseExternalVideoUrl } from '../../shared/video-source.js';
import type { VideoStorage } from './video-storage.js';
import { sniffVideo } from './video-storage.js';

const CURRENT = 'content/scheduleVideo/current';
const PUBLIC = 'public/scheduleVideo';
const TRASH = 'private/scheduleVideoTrash';
const PENDING = 'private/scheduleVideoPending';
const PENDING_TTL_MS = 6 * 60 * 60_000;

interface TrashEntry {
  objectPath: string;
  reason: 'replaced' | 'expired' | 'deleted' | 'invalid' | 'abandoned';
  queuedAt: number;
  attempts?: number;
  lastError?: string;
}

interface PendingUpload {
  objectPath: string;
  mimeType: ScheduleVideoMime;
  originalName: string;
  declaredSize: number;
  createdAt: number;
}

export class VideoError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type LegacyRecord = Partial<ScheduleVideoRecord> & { objectPath?: string; originalName?: string; mimeType?: ScheduleVideoMime; size?: number };

/** Accepts records written before external links existed (flat upload fields). */
export function normalizeRecord(raw: LegacyRecord | null): ScheduleVideoRecord | null {
  if (!raw || !raw.id) return null;
  if (raw.source) return raw as ScheduleVideoRecord;
  if (!raw.objectPath) return null;
  return {
    id: raw.id,
    source: { type: 'uploaded', objectPath: raw.objectPath, originalName: raw.originalName ?? '', mimeType: raw.mimeType ?? 'video/mp4', size: raw.size ?? 0 },
    uploadedAt: raw.uploadedAt ?? 0,
    scheduleDate: raw.scheduleDate ?? '',
    expiresAt: raw.expiresAt ?? 0,
    status: 'published',
  };
}

function uploadedPath(v: ScheduleVideoRecord | null): string | null {
  return v && v.source.type === 'uploaded' ? v.source.objectPath : null;
}

export function isActive(v: { expiresAt: number } | null | undefined, now = Date.now()): boolean {
  return Boolean(v) && now < (v as { expiresAt: number }).expiresAt;
}

export interface CleanupSummary {
  expired: string | null;
  deleted: number;
  failed: number;
  abandoned: number;
}

export class ScheduleVideoService {
  constructor(
    private readonly store: Store,
    private readonly storage: VideoStorage,
    readonly maxBytes: number,
    private readonly audit: (entry: { action: string; summary?: string; client?: string }) => Record<string, unknown>,
  ) {}

  validateRequest(name: string, size: number, declaredType: string): ScheduleVideoMime {
    if (size > this.maxBytes) throw new VideoError(`حجم الفيديو أكبر من الحد المسموح (${Math.round(this.maxBytes / 1024 / 1024)} ميغابايت).`, 413);
    const ext = name.toLowerCase().split('.').pop();
    const mime = declaredType === 'video/webm' || ext === 'webm' ? 'video/webm' : declaredType === 'video/mp4' || ext === 'mp4' || ext === 'm4v' ? 'video/mp4' : null;
    if (!mime) throw new VideoError('صيغة الفيديو غير مدعومة. استخدم MP4 (H.264/AAC) أو WebM.', 415);
    return mime;
  }

  async getCurrent(): Promise<ScheduleVideoRecord | null> {
    return normalizeRecord(await this.store.get<LegacyRecord>(CURRENT));
  }

  /** Public view with the server-side expiry check. */
  async getActivePublic(now = Date.now()): Promise<ScheduleVideoPublic | null> {
    const v = await this.store.get<ScheduleVideoPublic>(PUBLIC);
    return isActive(v, now) ? v : null;
  }

  /** Production: issue a signed upload target for an authenticated admin. */
  async beginSignedUpload(name: string, size: number, type: string): Promise<{ uploadId: string; target: Awaited<ReturnType<VideoStorage['createUploadTarget']>> }> {
    const mime = this.validateRequest(name, size, type);
    const objectPath = this.storage.newObjectPath(mime);
    const target = await this.storage.createUploadTarget(objectPath, mime);
    if (target.mode === 'direct') return { uploadId: '', target };
    const uploadId = randomUUID();
    const pending: PendingUpload = { objectPath, mimeType: mime, originalName: name.slice(0, 200), declaredSize: size, createdAt: Date.now() };
    await this.store.set(`${PENDING}/${uploadId}`, pending);
    return { uploadId, target };
  }

  /** Production: verify the object the browser uploaded, then publish it. */
  async finalizeSignedUpload(uploadId: string, client?: string): Promise<ScheduleVideoRecord> {
    if (!/^[0-9a-f-]{36}$/.test(uploadId)) throw new VideoError('معرّف الرفع غير صالح.');
    const pending = await this.store.get<PendingUpload>(`${PENDING}/${uploadId}`);
    if (!pending) throw new VideoError('انتهت صلاحية عملية الرفع. ابدأ من جديد.', 404);
    try {
      const info = await this.storage.stat(pending.objectPath);
      if (!info || info.size === 0) throw new VideoError('لم يكتمل رفع الملف.', 400);
      if (info.size > this.maxBytes) throw new VideoError('حجم الفيديو أكبر من الحد المسموح.', 413);
      const sniffed = sniffVideo(await this.storage.readHead(pending.objectPath, 64));
      if (!sniffed) throw new VideoError('الملف ليس فيديو MP4 أو WebM صالحًا.', 415);
      const record = await this.publish({ type: 'uploaded', objectPath: pending.objectPath, originalName: pending.originalName.slice(0, 200), mimeType: sniffed, size: info.size }, client);
      await this.store.remove(`${PENDING}/${uploadId}`);
      return record;
    } catch (err) {
      // Never leave an unverified object behind.
      await this.store.update({ [`${PENDING}/${uploadId}`]: null, [`${TRASH}/${uploadId}`]: { objectPath: pending.objectPath, reason: 'invalid', queuedAt: Date.now() } satisfies TrashEntry });
      await this.processTrash().catch(() => undefined);
      throw err;
    }
  }

  /** Demo / direct mode: the multipart file is already on local disk (streamed, not buffered). */
  async ingestTempFile(tempPath: string, originalName: string, size: number, head: Buffer, client?: string): Promise<ScheduleVideoRecord> {
    if (size > this.maxBytes) throw new VideoError('حجم الفيديو أكبر من الحد المسموح.', 413);
    const mime = sniffVideo(head);
    if (!mime) throw new VideoError('الملف ليس فيديو MP4 أو WebM صالحًا.', 415);
    const objectPath = this.storage.newObjectPath(mime);
    await this.storage.ingestFile(tempPath, objectPath, mime);
    try {
      return await this.publish({ type: 'uploaded', objectPath, originalName: originalName.slice(0, 200), mimeType: mime, size }, client);
    } catch (err) {
      await this.storage.remove(objectPath).catch(() => undefined);
      throw err;
    }
  }

  /**
   * External link: validated by syntax + provider allowlist only. The server
   * never requests the URL (no proxy, no SSRF); playability is checked in the
   * admin's browser preview before this is called.
   */
  async publishExternal(rawUrl: string, client?: string, now = Date.now()): Promise<ScheduleVideoRecord> {
    const parsed = parseExternalVideoUrl(rawUrl);
    if (!parsed.ok) throw new VideoError(parsed.error, 422);
    const v = parsed.value;
    return this.publish(
      { type: 'external', provider: v.provider, externalUrl: v.canonicalUrl, playUrl: v.playUrl, ...(v.videoId ? { videoId: v.videoId } : {}), ...(v.mimeType ? { mimeType: v.mimeType } : {}) },
      client,
      now,
    );
  }

  /**
   * Atomically makes a verified source the active video and queues the
   * previous uploaded file (if any) for deletion.
   */
  async publish(source: ScheduleVideoSource, client?: string, now = Date.now()): Promise<ScheduleVideoRecord> {
    const scheduleDate = todayInSchool(new Date(now));
    const record: ScheduleVideoRecord = {
      id: randomUUID(),
      source,
      uploadedAt: now,
      scheduleDate,
      expiresAt: endOfSchoolDay(scheduleDate),
      status: 'published',
    };
    const pub: ScheduleVideoPublic =
      source.type === 'uploaded'
        ? { id: record.id, provider: 'uploaded', url: this.storage.publicUrl(source.objectPath), mimeType: source.mimeType, scheduleDate, expiresAt: record.expiresAt, uploadedAt: now }
        : {
            id: record.id,
            provider: source.provider,
            url: source.playUrl,
            ...(source.videoId ? { videoId: source.videoId } : {}),
            ...(source.mimeType ? { mimeType: source.mimeType } : {}),
            scheduleDate,
            expiresAt: record.expiresAt,
            uploadedAt: now,
          };
    const previous = await this.getCurrent();
    const summary = source.type === 'uploaded' ? `${scheduleDate} ${source.mimeType} ${Math.round(source.size / 1024)}KB` : `${scheduleDate} ${source.provider}`;
    const updates: Record<string, unknown> = {
      [CURRENT]: record,
      [PUBLIC]: pub,
      'public/meta/updatedAt': now,
      ...this.audit({ action: previous ? 'schedule-video-replace' : 'schedule-video-upload', summary, client }),
    };
    const prevPath = uploadedPath(previous);
    if (previous && prevPath && prevPath !== uploadedPath(record)) {
      updates[`${TRASH}/${previous.id}`] = { objectPath: prevPath, reason: 'replaced', queuedAt: now } satisfies TrashEntry;
    }
    await this.store.update(updates);
    await this.processTrash().catch(() => undefined);
    return record;
  }

  /** Manual removal by an admin. */
  async removeCurrent(client?: string): Promise<boolean> {
    const current = await this.getCurrent();
    if (!current) return false;
    const removed = await this.retireIfSame(current, 'deleted', client);
    await this.processTrash().catch(() => undefined);
    return removed;
  }

  /**
   * Retires `video` only if it is still the active record (id match, inside a
   * transaction). Queues its file first so a crash can never orphan it.
   */
  private async retireIfSame(video: ScheduleVideoRecord, reason: TrashEntry['reason'], client?: string): Promise<boolean> {
    // Only uploaded files are ours to delete; an external link is just dropped from the schedule.
    const path = uploadedPath(video);
    if (path) await this.store.set(`${TRASH}/${video.id}`, { objectPath: path, reason, queuedAt: Date.now() } satisfies TrashEntry);
    let removed = false;
    await this.store.transaction<LegacyRecord>(CURRENT, (cur) => {
      // Note: Firebase may first call this with null; returning null is a no-op then.
      if (cur === null) return null;
      if (cur.id !== video.id) {
        removed = false;
        return cur; // a newer video was published meanwhile — leave it
      }
      removed = true;
      return null;
    });
    if (!removed) {
      // Not ours any more: un-queue unless the newer record somehow reuses the path (never deletes active files anyway).
      return false;
    }
    await this.store.transaction<ScheduleVideoPublic>(PUBLIC, (cur) => (cur === null ? null : cur.id === video.id ? null : cur));
    await this.store.update({ 'public/meta/updatedAt': Date.now(), ...this.audit({ action: `schedule-video-${reason}`, summary: video.scheduleDate, client }) });
    return true;
  }

  /** Deletes queued objects; failures stay queued for the next run. Never touches the active file. */
  async processTrash(): Promise<{ deleted: number; failed: number }> {
    const trash = (await this.store.get<Record<string, TrashEntry>>(TRASH)) ?? {};
    const activePath = uploadedPath(await this.getCurrent());
    let deleted = 0;
    let failed = 0;
    for (const [key, entry] of Object.entries(trash)) {
      if (activePath && entry.objectPath === activePath) {
        await this.store.remove(`${TRASH}/${key}`);
        continue;
      }
      try {
        await this.storage.remove(entry.objectPath);
        await this.store.remove(`${TRASH}/${key}`);
        deleted++;
      } catch (err) {
        failed++;
        await this.store.update({
          [`${TRASH}/${key}/attempts`]: (entry.attempts ?? 0) + 1,
          [`${TRASH}/${key}/lastError`]: err instanceof Error ? err.message.slice(0, 200) : 'error',
        });
      }
    }
    return { deleted, failed };
  }

  /**
   * The scheduled job. Safe to run any number of times, at any time:
   * expires the active video if its midnight has passed, deletes queued
   * files, and removes abandoned signed uploads.
   */
  async cleanup(now = Date.now()): Promise<CleanupSummary> {
    let expired: string | null = null;
    const current = await this.getCurrent();
    if (current && now >= current.expiresAt) {
      if (await this.retireIfSame(current, 'expired', 'scheduler')) expired = current.id;
    } else if (!current) {
      // Public projection without a private record (e.g. interrupted write): drop it.
      await this.store.transaction<ScheduleVideoPublic>(PUBLIC, (cur) => (cur === null ? null : now >= cur.expiresAt ? null : cur));
    }

    let abandoned = 0;
    const pending = (await this.store.get<Record<string, PendingUpload>>(PENDING)) ?? {};
    for (const [id, p] of Object.entries(pending)) {
      if (now - p.createdAt < PENDING_TTL_MS) continue;
      await this.store.update({ [`${PENDING}/${id}`]: null, [`${TRASH}/${id}`]: { objectPath: p.objectPath, reason: 'abandoned', queuedAt: now } satisfies TrashEntry });
      abandoned++;
    }

    const { deleted, failed } = await this.processTrash();
    return { expired, deleted, failed, abandoned };
  }
}
