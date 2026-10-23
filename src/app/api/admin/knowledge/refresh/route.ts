import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ApiError, jsonError, requireStaffCaller } from '@/lib/server/staff-auth';
import { refreshParse } from '../process';
import { UUID_RE } from '../claim';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/admin/knowledge/refresh — { ids: string[] }
 * Checks MinerU for documents that are still parsing and imports finished
 * results. The dashboard calls this every few seconds while something is parsing.
 */
export async function POST(request: Request) {
  try {
    await requireStaffCaller();
    const body = await request.json().catch(() => null);
    const ids: unknown[] = Array.isArray(body?.ids) ? body.ids : [];
    if (ids.length > 20) throw new ApiError(400, 'Too many documents.');
    const valid = ids.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x));
    const admin = createAdminClient();
    for (const id of valid) await refreshParse(admin, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
