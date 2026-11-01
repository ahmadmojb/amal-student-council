/**
 * Storage for the daily schedule video. Videos are large (default limit
 * 250 MB), so they are never buffered in server memory:
 *  - demo:       multipart upload streamed to a temp file, then moved into .data/uploads/;
 *  - production: the browser PUTs the file straight to Firebase Storage through a
 *                short-lived signed URL issued only to an authenticated admin
 *                (Cloud Run caps request bodies at 32 MB, so proxying is not an option);
 *                the server then verifies the stored object before publishing it.
 */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, open, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SCHEDULE_VIDEO_TYPES, type ScheduleVideoMime } from '../../shared/schemas.js';

export type UploadTarget =
  | { mode: 'direct' }
  | { mode: 'signed'; url: string; method: 'PUT'; headers: Record<string, string> };

export interface VideoStorage {
  newObjectPath(mime: ScheduleVideoMime): string;
  /** Signed direct-upload target (production) or `direct` (upload through this server). */
  createUploadTarget(objectPath: string, mime: ScheduleVideoMime): Promise<UploadTarget>;
  /** Moves a fully received temp file into storage (direct mode). */
  ingestFile(tempPath: string, objectPath: string, mime: ScheduleVideoMime): Promise<void>;
  stat(objectPath: string): Promise<{ size: number } | null>;
  readHead(objectPath: string, bytes: number): Promise<Buffer>;
  /** Idempotent: deleting a missing object is not an error. */
  remove(objectPath: string): Promise<void>;
  publicUrl(objectPath: string): string;
}

/**
 * Identifies MP4 / WebM by their container signatures (never by name or
 * declared type). QuickTime (.mov, brand "qt  ") is rejected: browsers do not
 * play it reliably.
 */
export function sniffVideo(head: Buffer): ScheduleVideoMime | null {
  if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return head.includes(Buffer.from('webm')) ? 'video/webm' : null;
  }
  if (head.length >= 12 && head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1');
    return brand === 'qt  ' ? null : 'video/mp4';
  }
  return null;
}

export class LocalVideoStorage implements VideoStorage {
  constructor(private readonly uploadsDir: string) {}

  newObjectPath(mime: ScheduleVideoMime): string {
    return `schedule-video/${randomUUID()}.${SCHEDULE_VIDEO_TYPES[mime]}`;
  }
  async createUploadTarget(): Promise<UploadTarget> {
    return { mode: 'direct' };
  }
  private abs(objectPath: string): string {
    if (!/^schedule-video\/[0-9a-f-]{36}\.(mp4|webm)$/.test(objectPath)) throw new Error('Invalid object path');
    return join(this.uploadsDir, objectPath);
  }
  async ingestFile(tempPath: string, objectPath: string): Promise<void> {
    const dest = this.abs(objectPath);
    await mkdir(dirname(dest), { recursive: true });
    try {
      await rename(tempPath, dest);
    } catch {
      await copyFile(tempPath, dest); // different volume
      await rm(tempPath, { force: true });
    }
  }
  async stat(objectPath: string): Promise<{ size: number } | null> {
    try {
      return { size: (await stat(this.abs(objectPath))).size };
    } catch {
      return null;
    }
  }
  async readHead(objectPath: string, bytes: number): Promise<Buffer> {
    const fh = await open(this.abs(objectPath), 'r');
    try {
      const buf = Buffer.alloc(bytes);
      const { bytesRead } = await fh.read(buf, 0, bytes, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }
  async remove(objectPath: string): Promise<void> {
    await rm(this.abs(objectPath), { force: true });
  }
  publicUrl(objectPath: string): string {
    return `/uploads/${objectPath}`;
  }
}

export class FirebaseVideoStorage implements VideoStorage {
  constructor(private readonly bucketName: string) {}

  private async bucket() {
    const { getStorage } = await import('firebase-admin/storage');
    return getStorage().bucket(this.bucketName);
  }
  newObjectPath(mime: ScheduleVideoMime): string {
    return `public-media/schedule-video/${randomUUID()}.${SCHEDULE_VIDEO_TYPES[mime]}`;
  }
  async createUploadTarget(objectPath: string, mime: ScheduleVideoMime): Promise<UploadTarget> {
    const [url] = await (await this.bucket()).file(objectPath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 30 * 60_000,
      contentType: mime,
    });
    return { mode: 'signed', url, method: 'PUT', headers: { 'content-type': mime } };
  }
  async ingestFile(tempPath: string, objectPath: string, mime: ScheduleVideoMime): Promise<void> {
    await (await this.bucket()).upload(tempPath, { destination: objectPath, contentType: mime, resumable: true });
  }
  async stat(objectPath: string): Promise<{ size: number } | null> {
    const file = (await this.bucket()).file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [meta] = await file.getMetadata();
    return { size: Number(meta.size ?? 0) };
  }
  async readHead(objectPath: string, bytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    const stream = (await this.bucket()).file(objectPath).createReadStream({ start: 0, end: bytes - 1, validation: false });
    for await (const c of stream) chunks.push(c as Buffer);
    return Buffer.concat(chunks);
  }
  async remove(objectPath: string): Promise<void> {
    await (await this.bucket()).file(objectPath).delete({ ignoreNotFound: true });
  }
  publicUrl(objectPath: string): string {
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(this.bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media`;
  }
}
