import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, jsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { retrieve } from '@/lib/server/retrieval';
import { UUID_RE } from '../claim';

export const runtime = 'nodejs';

const int = (v: unknown, d: number, min: number, max: number, name: string) => {
  if (v == null || v === '') return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ApiError(400, `${name} must be a whole number from ${min} to ${max}.`);
  return n;
};

/**
 * POST /api/admin/knowledge/search — hybrid retrieval test (staff only).
 * { query, knowledgeBaseId?, keywordK?, vectorK?, rrfK?, candidates?, topK?, rerank? }
 */
export async function POST(request: Request) {
  try {
    await requireStaffCaller();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new ApiError(400, 'Invalid request.');
    const query = String(body.query ?? '').trim();
    if (!query) throw new ApiError(400, 'Enter a question or keywords.');
    if (query.length > 1000) throw new ApiError(400, 'The query must be 1000 characters or fewer.');
    const kbId = body.knowledgeBaseId ? String(body.knowledgeBaseId) : null;
    if (kbId && !UUID_RE.test(kbId)) throw new ApiError(400, 'Invalid knowledge base id.');

    const result = await retrieve(createAdminClient(), {
      query,
      knowledgeBaseIds: kbId ? [kbId] : null,
      keywordK: int(body.keywordK, 20, 0, 100, 'Keyword top N'),
      vectorK: int(body.vectorK, 20, 0, 100, 'Vector top N'),
      rrfK: int(body.rrfK, 60, 1, 1000, 'RRF k'),
      candidates: int(body.candidates, 20, 1, 100, 'Candidates'),
      topK: int(body.topK, 5, 1, 20, 'Top K'),
      rerank: body.rerank !== false,
    });
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
