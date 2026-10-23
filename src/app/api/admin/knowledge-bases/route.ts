import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, jsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { SLUG_RE, friendlyDbError, readKnowledgeBaseFields } from './validate';

/**
 * POST /api/admin/knowledge-bases — create a knowledge base.
 * { name, slug, description?, chunkTargetChars?, chunkOverlapChars?, chunkToleranceFactor? }
 * The slug is the stable id the AI agent uses; it can't be changed later.
 */
export async function POST(request: Request) {
  try {
    const caller = await requireStaffCaller();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new ApiError(400, 'Invalid request.');
    const fields = readKnowledgeBaseFields(body);
    if (!fields.name) throw new ApiError(400, 'Enter a name.');
    const slug = String(body.slug ?? '').trim();
    if (!SLUG_RE.test(slug)) {
      throw new ApiError(400, 'ID must start with a letter and use 2–50 lowercase letters, numbers or underscores.');
    }
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('knowledge_bases')
      .insert({ ...fields, slug, created_by: caller.userId })
      .select('id')
      .single();
    if (error) friendlyDbError(error);
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
