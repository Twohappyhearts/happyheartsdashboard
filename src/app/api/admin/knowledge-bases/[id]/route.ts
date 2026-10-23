import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, jsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { removeDocumentFiles } from '../../knowledge/files';
import { assertNotBusy } from '../../knowledge/claim';
import { UUID_RE, friendlyDbError, readKnowledgeBaseFields } from '../validate';

/** PATCH /api/admin/knowledge-bases/:id — { name?, description?, isActive?, chunkTargetChars?, chunkOverlapChars?, chunkToleranceFactor? } */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid knowledge base id.');
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ApiError(400, 'Invalid request.');
    if (body.slug !== undefined) throw new ApiError(400, 'The ID of a knowledge base can’t be changed.');
    const fields = readKnowledgeBaseFields(body);
    if (Object.keys(fields).length === 0) return NextResponse.json({ ok: true });
    const admin = createAdminClient();
    const { data, error } = await admin.from('knowledge_bases').update(fields).eq('id', id).select('id');
    if (error) friendlyDbError(error);
    if (!data?.length) throw new ApiError(404, 'Knowledge base not found.');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

/** DELETE /api/admin/knowledge-bases/:id — removes the knowledge base, its documents, files and chunks. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid knowledge base id.');
    const admin = createAdminClient();
    const { data: kb } = await admin.from('knowledge_bases').select('id').eq('id', id).maybeSingle();
    if (!kb) throw new ApiError(404, 'Knowledge base not found.');

    const { data: docs, error: listErr } = await admin
      .from('knowledge_documents')
      .select('id, status, updated_at')
      .eq('knowledge_base_id', id);
    if (listErr) throw listErr;
    try {
      (docs ?? []).forEach(assertNotBusy);
    } catch {
      throw new ApiError(409, 'A document in this knowledge base is being chunked. Wait until it finishes.');
    }
    const docIds = (docs ?? []).map((d) => String(d.id));
    try {
      await removeDocumentFiles(admin, docIds); // originals, parsed Markdown and images
    } catch (e) {
      throw new ApiError(400, e instanceof Error ? e.message : 'Could not delete the stored files.');
    }
    // Documents and chunks are removed by ON DELETE CASCADE.
    const { error } = await admin.from('knowledge_bases').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true, deletedDocuments: docIds.length });
  } catch (e) {
    return jsonError(e);
  }
}
