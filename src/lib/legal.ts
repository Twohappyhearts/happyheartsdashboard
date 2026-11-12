import type { SupabaseClient } from '@supabase/supabase-js';
import { staffText } from '@/lib/i18n/staff';

/**
 * Terms of Use and Privacy Policy (public.legal_documents, bucket "legal").
 * An admin uploads each new version as a PDF on the Legal Documents page; the newest
 * version of each kind is the current one. Anyone (signed in or not) can read them.
 *
 * Public links for the app and the AI notice: /legal/terms and /legal/privacy
 * (src/app/legal/[kind]/route.ts). Until a version is uploaded they open the built-in
 * samples in public/legal/ (made by scripts/make-sample-legal-pdfs.mjs).
 */

export const LEGAL_KINDS = ['terms', 'privacy'] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];
export const isLegalKind = (v: unknown): v is LegalKind => v === 'terms' || v === 'privacy';

export const LEGAL_BUCKET = 'legal';
/** Keep in step with the bucket's file_size_limit (migration 20261111000100). */
export const MAX_LEGAL_BYTES = 10 * 1024 * 1024;

/** Sign-in-free links that always open the current version. */
export const LEGAL_PUBLIC_PATHS: Record<LegalKind, string> = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
};

/** Built-in placeholders, marked "SAMPLE – not reviewed" on every page. */
export const LEGAL_SAMPLE_PATHS: Record<LegalKind, string> = {
  terms: '/legal/sample-terms.pdf',
  privacy: '/legal/sample-privacy.pdf',
};

export interface LegalDocument {
  id: string;
  kind: LegalKind;
  version: number;
  fileName: string;
  storagePath: string;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: string;
  /** Public link to this version's PDF. */
  url: string;
}

export class LegalError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

export const LEGAL_COLUMNS = 'id, kind, version, file_name, storage_path, size_bytes, uploaded_by, created_at';

type Row = Record<string, unknown>;

export function legalFileUrl(supabase: SupabaseClient, storagePath: string): string {
  return supabase.storage.from(LEGAL_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export function toLegalDocument(supabase: SupabaseClient, r: Row): LegalDocument {
  const storagePath = String(r.storage_path ?? '');
  return {
    id: String(r.id),
    kind: r.kind === 'privacy' ? 'privacy' : 'terms',
    version: Number(r.version ?? 0),
    fileName: String(r.file_name ?? ''),
    storagePath,
    sizeBytes: r.size_bytes == null ? null : Number(r.size_bytes),
    uploadedBy: (r.uploaded_by as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
    url: legalFileUrl(supabase, storagePath),
  };
}

function fail(e: { code?: string; message?: string }, fallback: string): LegalError {
  if (e.code === '42P01' || e.code === 'PGRST205') {
    return new LegalError(staffText().legal.errors.missingTable, e.code);
  }
  return new LegalError(`${fallback}${e.message ? `: ${e.message}` : ''}`, e.code);
}

/** Every version, newest first. */
export async function listLegalDocuments(supabase: SupabaseClient): Promise<LegalDocument[]> {
  const { data, error } = await supabase
    .from('legal_documents')
    .select(LEGAL_COLUMNS)
    .order('kind')
    .order('version', { ascending: false });
  if (error) throw fail(error, staffText().legal.errors.loadDocs);
  return ((data ?? []) as Row[]).map((r) => toLegalDocument(supabase, r));
}

/**
 * The current version number of a document (0 = none uploaded yet; the public link then
 * shows the built-in sample). Patients who accepted the AI notice under an older Terms of Use
 * version are asked to accept again.
 */
export async function currentLegalVersion(supabase: SupabaseClient, kind: LegalKind): Promise<number> {
  const { data, error } = await supabase
    .from('legal_documents')
    .select('version')
    .eq('kind', kind)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fail(error, staffText().legal.errors.readVersion);
  return Number((data as Row | null)?.version ?? 0);
}
