import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, jsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { KNOWLEDGE_BUCKET } from '@/lib/server/knowledge';
import { UUID_RE } from '../../claim';

/** GET /api/admin/knowledge/:id/asset?name=img.jpg — short-lived link to an image extracted from the document. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid document id.');
    const name = new URL(request.url).searchParams.get('name') ?? '';
    if (!/^[\w.\-]{1,200}$/.test(name) || name.startsWith('.')) throw new ApiError(400, 'Invalid image name.');
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(KNOWLEDGE_BUCKET).createSignedUrl(`${id}/assets/${name}`, 300);
    if (error || !data) throw new ApiError(404, 'Image not found.');
    return NextResponse.redirect(data.signedUrl);
  } catch (e) {
    return jsonError(e);
  }
}
