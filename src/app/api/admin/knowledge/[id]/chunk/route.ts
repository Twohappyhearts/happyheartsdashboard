import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, jsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { parseBudget } from '@/lib/server/rag/budget';
import { budgetToSettings, chunkAndEmbed, parseThenChunk } from '../../process';
import { UUID_RE, claimDocument } from '../../claim';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/knowledge/:id/chunk — one all-or-nothing job:
 * parse to Markdown (if not parsed yet, or { reparse: true }) → chunk → embed → commit.
 * Body (JSON): { targetChars, overlapChars, toleranceFactor, reparse? }.
 *
 * Built-in parsing finishes in this request. MinerU parsing returns
 * { status: 'parsing' }; the job then continues when /refresh sees MinerU finish.
 * On failure the document keeps its previous chunks.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStaffCaller();
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ApiError(400, 'Invalid document id.');
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const budget = parseBudget(body);
    if (typeof budget === 'string') throw new ApiError(400, budget);

    const admin = createAdminClient();
    const { data: doc } = await admin.from('knowledge_documents').select('parsed_path').eq('id', id).maybeSingle();
    if (!doc) throw new ApiError(404, 'Document not found.');
    const needParse = body.reparse === true || !doc.parsed_path;

    await claimDocument(admin, id, needParse ? 'parsing' : 'processing', {
      pending_chunk_settings: budgetToSettings(budget),
      job_progress: { phase: needParse ? 'parsing' : 'chunking' },
      parse_progress: null,
    });
    const result = needParse ? await parseThenChunk(admin, id, budget) : await chunkAndEmbed(admin, id, budget);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
