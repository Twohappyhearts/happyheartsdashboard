import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl } from '@/lib/supabase/config';
import { staffText } from '@/lib/i18n/staff';

/**
 * Lesson files staff upload from the Content page (public bucket "lesson-materials"):
 * thumbnails and infographics (images) and lesson materials (images and PDFs).
 *
 * The browser uploads straight to Supabase Storage with a signed upload URL from
 * POST /api/admin/uploads (staff only), so large files never pass through the Next server.
 * Files nothing refers to any more are removed with POST /api/admin/uploads/cleanup.
 * Shared by the browser and the API routes.
 */

export const LESSON_BUCKET = 'lesson-materials';
/** Keep in step with the bucket's file_size_limit (migration 20261111000100). */
export const MAX_LESSON_FILE_BYTES = 50 * 1024 * 1024;
/** Same limit as valid_lesson_attachments() in the database. */
export const MAX_ATTACHMENTS = 20;

/** 'image': thumbnail / infographic fields; 'material': the lesson's Materials list. */
export type UploadPurpose = 'image' | 'material';

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PDF_MIME_TYPE = 'application/pdf';

export const allowedMimeTypes = (purpose: UploadPurpose): readonly string[] =>
  purpose === 'image' ? IMAGE_MIME_TYPES : [...IMAGE_MIME_TYPES, PDF_MIME_TYPE];

/** For <input accept>. */
export const acceptFor = (purpose: UploadPurpose) =>
  purpose === 'image' ? 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp' : 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';

export const MIME_EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', [PDF_MIME_TYPE]: 'pdf' };

export const attachmentKindOf = (mime: string): 'image' | 'pdf' => (mime === PDF_MIME_TYPE ? 'pdf' : 'image');

/** The file's real type from its first bytes (JPEG, PNG, WebP, PDF), or null. */
export async function sniffMimeType(file: Blob): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  const at = (sig: number[], offset = 0) => sig.every((x, i) => b[offset + i] === x);
  if (at([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (at([0x52, 0x49, 0x46, 0x46]) && at([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  // PDF readers accept the %PDF- header anywhere in the first 1024 bytes.
  for (let i = 0; i + 5 <= b.length; i++) if (at([0x25, 0x50, 0x44, 0x46, 0x2d], i)) return PDF_MIME_TYPE;
  return null;
}

const PUBLIC_PREFIX = () => `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${LESSON_BUCKET}/`;

/** Paths this dashboard creates: `${contentId or 'drafts'}/${12 hex}-${safe name}`. */
const PATH_RE = /^(drafts|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{12}-[A-Za-z0-9._-]{1,140}$/;

/** The storage path of a file uploaded here, from its public URL; null for any other link. */
export function lessonStoragePath(url: string): string | null {
  if (!supabaseUrl) return null;
  const prefix = PUBLIC_PREFIX();
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length).split(/[?#]/)[0];
  return PATH_RE.test(path) ? path : null;
}

/** True for a public link to a file uploaded on the Content page. */
export const isLessonUploadUrl = (url: string) => lessonStoragePath(url.trim()) !== null;

export function lessonPublicUrl(path: string): string {
  return PUBLIC_PREFIX() + path;
}

export class UploadError extends Error {}

export interface UploadedFile {
  url: string;
  name: string;
  mime: string;
  size: number;
}

/**
 * Checks the file, asks the server for a signed upload URL and uploads the file
 * straight to the bucket. Throws UploadError with a message for staff.
 */
export async function uploadLessonFile(
  supabase: SupabaseClient,
  file: File,
  opts: { purpose: UploadPurpose; contentId?: string | null }
): Promise<UploadedFile> {
  const allowed = allowedMimeTypes(opts.purpose);
  const E = staffText().content.errors;
  if (file.size === 0) throw new UploadError(E.fileEmpty(file.name));
  if (file.size > MAX_LESSON_FILE_BYTES) throw new UploadError(E.fileTooLarge(file.name));
  // Trust the bytes, not the name: the bucket only checks the declared type.
  const mime = await sniffMimeType(file);
  if (!mime || !allowed.includes(mime)) {
    throw new UploadError(
      opts.purpose === 'image' ? E.notImage(file.name) : E.notImageOrPdf(file.name)
    );
  }

  const res = await fetch('/api/admin/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purpose: opts.purpose,
      fileName: file.name,
      contentType: mime,
      size: file.size,
      contentId: opts.contentId ?? null,
    }),
  }).catch(() => null);
  const body = res ? ((await res.json().catch(() => ({}))) as { error?: string; path?: string; token?: string; publicUrl?: string }) : {};
  if (!res || !res.ok || !body.path || !body.token || !body.publicUrl) {
    throw new UploadError(body.error || E.uploadStart);
  }

  const { error } = await supabase.storage
    .from(LESSON_BUCKET)
    .uploadToSignedUrl(body.path, body.token, file, { contentType: mime, cacheControl: '31536000', upsert: false });
  if (error) throw new UploadError(E.uploadFailed(file.name, error.message));

  return { url: body.publicUrl, name: file.name, mime, size: file.size };
}

/**
 * Asks the server to delete uploaded files that no lesson refers to any more (it checks every
 * lesson first, so files still in use are kept). Best effort, never throws.
 */
export function releaseLessonFiles(urls: Array<string | null | undefined>): void {
  const list = Array.from(new Set(urls.filter((u): u is string => !!u && isLessonUploadUrl(u))));
  if (list.length === 0) return;
  void fetch('/api/admin/uploads/cleanup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: list }),
    keepalive: true,
  }).catch(() => {});
}
