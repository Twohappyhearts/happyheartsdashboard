import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, staffJsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { removeDocumentFiles } from '../files';
import { UUID_RE, assertNotBusy } from '../claim';

/** PATCH /api/admin/knowledge/:id — { title?, description?, isActive? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid document id.');
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ApiError(400, 'Invalid request.');

    const update: { title?: string; description?: string; is_active?: boolean } = {};
    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t || t.length > 200) throw new ApiError(400, 'Title must be 1–200 characters.');
      update.title = t;
    }
    if (body.description !== undefined) {
      const d = String(body.description).trim();
      if (d.length > 1000) throw new ApiError(400, 'Description must be 1000 characters or fewer.');
      update.description = d;
    }
    if (body.isActive !== undefined) update.is_active = Boolean(body.isActive);
    if (Object.keys(update).length === 0) return NextResponse.json({ ok: true });

    const admin = createAdminClient();
    const { data: current } = await admin.from('knowledge_documents').select('status, updated_at').eq('id', id).maybeSingle();
    if (!current) throw new ApiError(404, 'Document not found.');
    assertNotBusy(current);
    const { data, error } = await admin.from('knowledge_documents').update(update).eq('id', id).select('id');
    if (error) throw error;
    if (!data || data.length === 0) throw new ApiError(404, 'Document not found.');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return staffJsonError(e);
  }
}

/** DELETE /api/admin/knowledge/:id — removes the file, the document and its chunks. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid document id.');
    const admin = createAdminClient();
    const { data: doc, error } = await admin.from('knowledge_documents').select('id, status, updated_at').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!doc) throw new ApiError(404, 'Document not found.');
    assertNotBusy(doc);
    try {
      await removeDocumentFiles(admin, [id]); // original, parsed Markdown and images
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : 'Could not delete the stored files.');
    }
    const { error: delErr } = await admin.from('knowledge_documents').delete().eq('id', id);
    if (delErr) throw delErr;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return staffJsonError(e);
  }
}
