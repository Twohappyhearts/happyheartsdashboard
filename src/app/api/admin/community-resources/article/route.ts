import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { staffJsonError } from '@/lib/server/staff-auth';
import { loadArticle, publishedDocuments, resourcesKnowledgeBase } from '@/lib/server/community-resources/publish-job';
import { articleHash } from '@/lib/server/community-resources/article';
import type { ArticlePreview } from '@/lib/community-resources';
import { requireResourceStaff } from '../_shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/community-resources/article — preview of the knowledge article built from the
 * directory as it is now (no AI call): the Markdown, its hash (sent back with Publish), the
 * resources whose website check failed or is still missing, and what is published now.
 */
export async function GET() {
  try {
    await requireResourceStaff();
    const admin = createAdminClient();
    const article = await loadArticle(admin);
    const kb = await resourcesKnowledgeBase(admin, null, false);
    const docs = kb ? await publishedDocuments(admin, kb.id) : [];
    const current = docs.find((d) => d.is_active && d.status === 'ready') ?? null;
    const body: ArticlePreview = {
      title: article.title,
      markdown: article.markdown,
      hash: article.hash,
      entryCount: article.entryCount,
      withSummary: article.withSummary,
      failed: article.failed,
      pending: article.pending,
      published: current
        ? {
            documentId: current.id,
            publishedAt: current.processed_at,
            chunkCount: Number(current.chunk_count ?? 0),
            status: current.status,
            sameAsPreview: current.sha256 === articleHash(article.markdown),
          }
        : null,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return staffJsonError(e);
  }
}
