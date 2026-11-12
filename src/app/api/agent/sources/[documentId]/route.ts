import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, jsonError } from '@/lib/server/staff-auth';
import { requireAgentCaller } from '@/lib/server/agent/auth';
import { KNOWLEDGE_BUCKET } from '@/lib/server/knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** How long the link to the original file works. */
const LINK_SECONDS = 10 * 60;

/**
 * GET /api/agent/sources/:documentId — { url }: a short-lived link to the original file of a
 * knowledge-base document the assistant cited, for sources that have no web page of their own.
 *
 * Auth as the other agent routes (Bearer token from the app, or the dashboard cookie).
 * Only documents that are active, in an active knowledge base, and have a stored file.
 */
export async function GET(request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const caller = await requireAgentCaller(request);
    const { documentId } = await params;
    if (!z.uuid().safeParse(documentId).success) throw new ApiError(400, 'Invalid document id.');

    const { data: doc, error } = await caller.admin
      .from('knowledge_documents')
      .select('storage_path, is_active, knowledge_base_id')
      .eq('id', documentId)
      .maybeSingle();
    if (error) throw error;
    if (!doc || !doc.is_active || !doc.storage_path) throw new ApiError(404, 'This source is not available.');

    if (doc.knowledge_base_id) {
      const { data: kb, error: kbError } = await caller.admin
        .from('knowledge_bases')
        .select('is_active')
        .eq('id', doc.knowledge_base_id)
        .maybeSingle();
      if (kbError) throw kbError;
      if (!kb?.is_active) throw new ApiError(404, 'This source is not available.');
    }

    const { data, error: signError } = await caller.admin.storage
      .from(KNOWLEDGE_BUCKET)
      .createSignedUrl(String(doc.storage_path), LINK_SECONDS);
    if (signError || !data?.signedUrl) throw new ApiError(502, 'Could not open this source right now.');
    return NextResponse.json({ url: data.signedUrl }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}
