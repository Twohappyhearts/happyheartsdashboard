import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, jsonError, requireAdminCaller } from '@/lib/server/staff-auth';
import { LEGAL_BUCKET, LEGAL_COLUMNS, MAX_LEGAL_BYTES, isLegalKind, toLegalDocument } from '@/lib/legal';

export const runtime = 'nodejs';

const isPdf = (bytes: Uint8Array) => [0x25, 0x50, 0x44, 0x46, 0x2d].every((b, i) => bytes[i] === b); // %PDF-

/**
 * POST /api/admin/legal — upload a new version of the Terms of Use or the Privacy Policy.
 * multipart/form-data: kind ('terms' | 'privacy'), file (PDF, ≤ 10 MB). Admins only.
 * Stores the file in the public "legal" bucket as `${kind}/v${n}-${random}.pdf` and adds the
 * legal_documents row with version = current + 1, which makes it the current version.
 * A new Terms of Use version asks every patient to accept the AI notice again.
 */
export async function POST(request: Request) {
  let admin: SupabaseClient | null = null;
  let stored: string | null = null; // removed again if the row is not saved
  try {
    const caller = await requireAdminCaller('Only an active Admin account can upload legal documents.');
    const form = await request.formData().catch(() => null);
    const kind = form?.get('kind');
    const file = form?.get('file');
    if (!isLegalKind(kind)) throw new ApiError(400, 'Choose Terms of Use or Privacy Policy.');
    if (!(file instanceof File)) throw new ApiError(400, 'Choose a PDF file to upload.');
    if (file.size === 0) throw new ApiError(400, 'The file is empty.');
    if (file.size > MAX_LEGAL_BYTES) throw new ApiError(400, 'The PDF must be 10 MB or smaller.');
    if (file.type && file.type !== 'application/pdf' && file.type !== 'application/octet-stream') {
      throw new ApiError(400, 'Only PDF files can be uploaded.');
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isPdf(bytes)) throw new ApiError(400, 'This file is not a PDF.');

    admin = createAdminClient();
    const { data: latest, error: latestErr } = await admin
      .from('legal_documents')
      .select('version')
      .eq('kind', kind)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestErr) throw latestErr;
    const version = Number(latest?.version ?? 0) + 1;

    const storagePath = `${kind}/v${version}-${randomUUID().replace(/-/g, '').slice(0, 12)}.pdf`;
    const { error: upErr } = await admin.storage
      .from(LEGAL_BUCKET)
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false, cacheControl: '86400' });
    if (upErr) throw new ApiError(502, `Could not store the file: ${upErr.message}`);
    stored = storagePath;

    const fileName = file.name.trim().slice(0, 255) || `${kind}-v${version}.pdf`;
    const { data: row, error: insErr } = await admin
      .from('legal_documents')
      .insert({ kind, version, file_name: fileName, storage_path: storagePath, size_bytes: file.size, uploaded_by: caller.userId })
      .select(LEGAL_COLUMNS)
      .single();
    if (insErr) {
      if (insErr.code === '23505') {
        throw new ApiError(409, 'Another version was uploaded at the same time. Refresh the page and try again.');
      }
      throw insErr;
    }
    stored = null;

    return NextResponse.json({ document: toLegalDocument(admin, row as Record<string, unknown>) }, { status: 201 });
  } catch (e) {
    if (admin && stored) {
      const { error } = await admin.storage
        .from(LEGAL_BUCKET)
        .remove([stored])
        .catch((err: unknown) => ({ error: err instanceof Error ? err : new Error(String(err)) }));
      if (error) console.error('[legal upload] could not remove', stored, error.message);
    }
    return jsonError(e);
  }
}
