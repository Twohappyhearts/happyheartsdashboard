import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, jsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { KNOWLEDGE_BUCKET } from '@/lib/server/knowledge';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/knowledge/:id/file — short-lived link to the original file.
 * ?variant=parsed — the parsed Markdown instead.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid document id.');
    const admin = createAdminClient();
    const { data: doc } = await admin
      .from('knowledge_documents')
      .select('storage_path, file_name, parsed_path')
      .eq('id', id)
      .maybeSingle();
    const parsed = new URL(request.url).searchParams.get('variant') === 'parsed';
    const path = parsed ? doc?.parsed_path : doc?.storage_path;
    if (!path) throw new ApiError(404, parsed ? 'This document has not been parsed yet.' : 'File not found.');
    const downloadName = parsed
      ? `${(doc?.file_name ?? 'document').replace(/\.[^.]+$/, '')}.md`
      : (doc?.file_name ?? true);
    const { data, error } = await admin.storage.from(KNOWLEDGE_BUCKET).createSignedUrl(path, 60, { download: downloadName });
    if (error || !data) throw new ApiError(400, 'Could not create a download link.');
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return jsonError(e);
  }
}
