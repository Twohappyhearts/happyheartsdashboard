import { createHash, randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, staffJsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { KNOWLEDGE_BUCKET, MAX_FILE_BYTES, detectKind, safeFileName } from '@/lib/server/knowledge';

export const runtime = 'nodejs';

/**
 * POST /api/admin/knowledge — upload a document to the AI knowledge base.
 * multipart/form-data: knowledgeBaseId, file (PDF, Word, PowerPoint, TXT, MD; ≤ 50 MB), title?, description?
 * Only stores the original (private "knowledge" bucket) with status 'uploaded'.
 * POST /api/admin/knowledge/:id/chunk then parses, chunks and embeds it.
 */
export async function POST(request: Request) {
  try {
    const caller = await requireStaffCaller();
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof File)) throw new ApiError(400, 'Choose a file to upload.');
    if (file.size === 0) throw new ApiError(400, 'The file is empty.');
    if (file.size > MAX_FILE_BYTES) throw new ApiError(400, 'Files must be 50 MB or smaller.');

    const knowledgeBaseId = String(form.get('knowledgeBaseId') ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(knowledgeBaseId)) {
      throw new ApiError(400, 'Choose a knowledge base.');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = detectKind(file.name, bytes);
    if (!info) throw new ApiError(400, 'Only PDF, Word (.docx/.doc), PowerPoint (.pptx/.ppt), .txt and .md files are supported.');

    const title = String(form.get('title') ?? '').trim() || file.name.replace(/\.[^.]+$/, '');
    const description = String(form.get('description') ?? '').trim();
    if (title.length > 200) throw new ApiError(400, 'Title must be 200 characters or fewer.');
    if (description.length > 1000) throw new ApiError(400, 'Description must be 1000 characters or fewer.');

    const admin = createAdminClient();
    const { data: kb } = await admin.from('knowledge_bases').select('id').eq('id', knowledgeBaseId).maybeSingle();
    if (!kb) throw new ApiError(404, 'Knowledge base not found.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { data: dup } = await admin
      .from('knowledge_documents')
      .select('title')
      .eq('knowledge_base_id', knowledgeBaseId)
      .eq('sha256', sha256)
      .maybeSingle();
    if (dup) throw new ApiError(409, `This file is already in this knowledge base as “${dup.title}”.`);

    const id = randomUUID();
    const storagePath = `${id}/${safeFileName(file.name)}`;
    const { error: upErr } = await admin.storage
      .from(KNOWLEDGE_BUCKET)
      .upload(storagePath, bytes, { contentType: info.mime, upsert: false });
    if (upErr) throw new ApiError(400, `Could not store the file: ${upErr.message}`);

    const { error: insErr } = await admin.from('knowledge_documents').insert({
      id,
      knowledge_base_id: knowledgeBaseId,
      title,
      description,
      source_type: 'upload',
      file_name: file.name.slice(0, 255),
      storage_path: storagePath,
      mime_type: info.mime,
      size_bytes: file.size,
      sha256,
      status: 'uploaded',
      uploaded_by: caller.userId,
    });
    if (insErr) {
      await admin.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
      throw insErr;
    }

    return NextResponse.json({ id, status: 'uploaded' }, { status: 201 });
  } catch (e) {
    return staffJsonError(e);
  }
}
