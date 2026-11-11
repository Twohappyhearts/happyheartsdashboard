import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { LESSON_BUCKET, lessonStoragePath } from '@/lib/uploads';

export const runtime = 'nodejs';

const MAX_URLS = 60;

/**
 * POST /api/admin/uploads/cleanup — delete uploaded lesson files that no lesson uses any more
 * (staff only). JSON: { urls: string[] }.
 * Called after a lesson is saved or deleted, and when an edit with new uploads is discarded.
 * Only files in the "lesson-materials" bucket with paths this dashboard creates are considered,
 * and a file is kept if its path appears anywhere in any lesson (thumbnail, infographic,
 * materials, references or script), so a file still in use is never deleted.
 */
export async function POST(request: Request) {
  try {
    await requireStaffCaller('Only active Careteam or Admin accounts can manage lesson files.');
    const body = (await request.json().catch(() => null)) as { urls?: unknown } | null;
    const urls = Array.isArray(body?.urls) ? body.urls.slice(0, MAX_URLS) : [];
    const paths = Array.from(
      new Set(urls.map((u) => (typeof u === 'string' ? lessonStoragePath(u.trim()) : null)).filter((p): p is string => !!p))
    );
    if (paths.length === 0) return NextResponse.json({ removed: 0, kept: 0 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('content_items')
      .select('thumbnail_url, infographic_url, attachments, reference_links, script_html');
    if (error) throw error;
    const inUse = JSON.stringify(data ?? []);
    const unused = paths.filter((p) => !inUse.includes(p));
    if (unused.length > 0) {
      const { error: rmErr } = await admin.storage.from(LESSON_BUCKET).remove(unused);
      if (rmErr) throw new Error(`Could not delete files: ${rmErr.message}`);
    }
    return NextResponse.json({ removed: unused.length, kept: paths.length - unused.length });
  } catch (e) {
    return jsonError(e);
  }
}
