import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, staffJsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { LESSON_BUCKET, MAX_LESSON_FILE_BYTES, MIME_EXT, allowedMimeTypes, type UploadPurpose } from '@/lib/uploads';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** "Week 1 – Handout (final).PDF" → "Week_1_-_Handout_final.pdf"; the extension follows the real type. */
function storageFileName(name: string, mime: string): string {
  const base = name
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._ -]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^[.-]+/, '')
    .slice(0, 80);
  return `${base || 'file'}.${MIME_EXT[mime]}`;
}

/**
 * POST /api/admin/uploads — a signed upload URL for one lesson file (staff only).
 * JSON: { purpose: 'image' | 'material', fileName, contentType, size, contentId? }
 *   image    = thumbnail / infographic: JPG, PNG, WebP
 *   material = the lesson's Materials list: JPG, PNG, WebP, PDF
 * Every file ≤ 50 MB. The browser then uploads straight to the public "lesson-materials"
 * bucket (supabase.storage.uploadToSignedUrl), so the file never passes through this server;
 * the bucket itself enforces the size and type limits as well.
 * Path: `${contentId or 'drafts'}/${random}-${safe file name}`.
 * Returns { path, token, publicUrl }.
 */
export async function POST(request: Request) {
  try {
    await requireStaffCaller('Only active Careteam or Admin accounts can upload lesson files.');
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const purpose: UploadPurpose | null =
      body?.purpose === 'image' ? 'image' : body?.purpose === 'material' ? 'material' : null;
    if (!purpose) throw new ApiError(400, 'Unknown upload type.');

    const fileName = String(body?.fileName ?? '').trim();
    if (!fileName || fileName.length > 255) throw new ApiError(400, 'The file needs a name of at most 255 characters.');
    const size = Number(body?.size);
    if (!Number.isFinite(size) || size <= 0) throw new ApiError(400, 'The file is empty.');
    if (size > MAX_LESSON_FILE_BYTES) throw new ApiError(400, 'Files must be 50 MB or smaller.');
    const mime = String(body?.contentType ?? '');
    if (!allowedMimeTypes(purpose).includes(mime)) {
      throw new ApiError(
        400,
        purpose === 'image' ? 'Only JPG, PNG and WebP images can be uploaded here.' : 'Only JPG, PNG and WebP images and PDF files can be uploaded.'
      );
    }
    const contentId = body?.contentId == null || body.contentId === '' ? null : String(body.contentId).toLowerCase();
    if (contentId !== null && !UUID.test(contentId)) throw new ApiError(400, 'Unknown lesson.');

    const path = `${contentId ?? 'drafts'}/${randomUUID().replace(/-/g, '').slice(0, 12)}-${storageFileName(fileName, mime)}`;
    const admin = createAdminClient();
    const bucket = admin.storage.from(LESSON_BUCKET);
    const { data, error } = await bucket.createSignedUploadUrl(path);
    if (error || !data) throw new ApiError(502, `Could not prepare the upload: ${error?.message ?? 'no upload URL'}`);
    return NextResponse.json({ path: data.path, token: data.token, publicUrl: bucket.getPublicUrl(data.path).data.publicUrl });
  } catch (e) {
    return staffJsonError(e);
  }
}
