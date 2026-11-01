/**
 * Upload validation and storage for administrator-approved media.
 *
 * Validation never trusts the filename or the client-supplied MIME type:
 *  1. size limit (enforced by multer before this runs, and again here),
 *  2. magic-byte sniffing (JPEG / PNG / WebP / PDF only),
 *  3. images are fully decoded by sharp, dimensions checked, then re-encoded
 *     to WebP — which also strips EXIF metadata such as GPS location.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const MIN_IMAGE_SIDE = 64;
export const MAX_IMAGE_SIDE = 10_000;
export const OUTPUT_MAX_WIDTH = 1920;

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export function sniffType(buf: Buffer): SniffedType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export interface ProcessedUpload {
  data: Buffer;
  contentType: 'image/webp' | 'application/pdf';
  extension: 'webp' | 'pdf';
  width?: number;
  height?: number;
}

export async function processUpload(buf: Buffer, opts: { allowPdf: boolean }): Promise<ProcessedUpload> {
  const type = sniffType(buf);
  if (!type) throw new UploadError('نوع الملف غير مدعوم. المسموح: JPEG أو PNG أو WebP' + (opts.allowPdf ? ' أو PDF.' : '.'));

  if (type === 'application/pdf') {
    if (!opts.allowPdf) throw new UploadError('ملفات PDF غير مسموحة هنا.');
    if (buf.length > MAX_PDF_BYTES) throw new UploadError('حجم ملف PDF يتجاوز 10 ميغابايت.');
    return { data: buf, contentType: 'application/pdf', extension: 'pdf' };
  }

  if (buf.length > MAX_IMAGE_BYTES) throw new UploadError('حجم الصورة يتجاوز 8 ميغابايت.');
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_IMAGE_SIDE * MAX_IMAGE_SIDE }).metadata();
  } catch {
    throw new UploadError('تعذّرت قراءة الصورة. قد يكون الملف تالفًا.');
  }
  const { width = 0, height = 0 } = meta;
  if (width < MIN_IMAGE_SIDE || height < MIN_IMAGE_SIDE) throw new UploadError('أبعاد الصورة صغيرة جدًا.');
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) throw new UploadError('أبعاد الصورة كبيرة جدًا.');

  const { data, info } = await sharp(buf)
    .rotate() // apply EXIF orientation before metadata is dropped
    .resize({ width: OUTPUT_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { data, contentType: 'image/webp', extension: 'webp', width: info.width, height: info.height };
}

export interface MediaStore {
  save(file: ProcessedUpload): Promise<string>;
}

/** Demo mode: files under .data/uploads, served at /uploads/. */
export class LocalMediaStore implements MediaStore {
  constructor(private readonly dir: string) {}
  async save(file: ProcessedUpload): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const name = `${randomUUID()}.${file.extension}`;
    await writeFile(join(this.dir, name), file.data);
    return `/uploads/${name}`;
  }
}

/** Production: Firebase Storage, under public-media/ (read-only to the public via storage.rules). */
export class FirebaseMediaStore implements MediaStore {
  constructor(private readonly bucketName: string) {}
  async save(file: ProcessedUpload): Promise<string> {
    const { getStorage } = await import('firebase-admin/storage');
    const bucket = getStorage().bucket(this.bucketName);
    const objectPath = `public-media/${randomUUID()}.${file.extension}`;
    const token = randomUUID();
    await bucket.file(objectPath).save(file.data, {
      contentType: file.contentType,
      resumable: false,
      metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata: { firebaseStorageDownloadTokens: token } },
    });
    return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(this.bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media`;
  }
}
