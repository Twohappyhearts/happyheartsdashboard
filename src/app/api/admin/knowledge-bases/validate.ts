import 'server-only';
import { ApiError } from '@/lib/server/staff-auth';
import { MAX_CHARS_LIMIT, TOLERANCE_FACTOR_LIMIT } from '@/lib/server/rag/budget';

const MIN_CHUNK_CHARS = 200;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RE = /^[a-z][a-z0-9_]{1,49}$/;

export interface KnowledgeBaseUpdate {
  name?: string;
  description?: string;
  is_active?: boolean;
  chunk_target_chars?: number;
  chunk_overlap_chars?: number;
  chunk_tolerance_factor?: number;
}

/** Validate the editable fields of a knowledge base (all optional). */
export function readKnowledgeBaseFields(body: Record<string, unknown>): KnowledgeBaseUpdate {
  const out: KnowledgeBaseUpdate = {};
  if (body.name !== undefined) {
    const n = String(body.name).trim();
    if (!n || n.length > 100) throw new ApiError(400, 'Name must be 1–100 characters.');
    out.name = n;
  }
  if (body.description !== undefined) {
    const d = String(body.description).trim();
    if (d.length > 1000) throw new ApiError(400, 'Description must be 1000 characters or fewer.');
    out.description = d;
  }
  if (body.isActive !== undefined) out.is_active = Boolean(body.isActive);
  if (body.chunkTargetChars !== undefined) {
    const t = Number(body.chunkTargetChars);
    if (!Number.isInteger(t) || t < MIN_CHUNK_CHARS || t > MAX_CHARS_LIMIT) {
      throw new ApiError(400, `Chunk size must be ${MIN_CHUNK_CHARS}–${MAX_CHARS_LIMIT} characters.`);
    }
    out.chunk_target_chars = t;
  }
  if (body.chunkOverlapChars !== undefined) {
    const o = Number(body.chunkOverlapChars);
    if (!Number.isInteger(o) || o < 0) throw new ApiError(400, 'Overlap must be a whole number of 0 or more.');
    if (out.chunk_target_chars !== undefined && o * 2 > out.chunk_target_chars) {
      throw new ApiError(400, 'Overlap must be at most half the chunk size.');
    }
    out.chunk_overlap_chars = o;
  }
  if (body.chunkToleranceFactor !== undefined) {
    const f = Number(body.chunkToleranceFactor);
    if (!Number.isInteger(f) || f < 1 || f > TOLERANCE_FACTOR_LIMIT) {
      throw new ApiError(400, `Structure tolerance must be a whole number from 1 to ${TOLERANCE_FACTOR_LIMIT}.`);
    }
    out.chunk_tolerance_factor = f;
  }
  return out;
}

/** Map unique-constraint errors to friendly messages. */
export function friendlyDbError(e: { code?: string; message?: string; details?: string } | null): never {
  const text = `${e?.message ?? ''} ${e?.details ?? ''}`;
  if (e?.code === '23505' && /slug/.test(text)) throw new ApiError(409, 'That ID is already used by another knowledge base.');
  if (e?.code === '23505') throw new ApiError(409, 'A knowledge base with this name already exists.');
  if (e?.code === '23514' && /overlap|knowledge_bases_check/.test(text)) throw new ApiError(400, 'Overlap must be at most half the chunk size.');
  throw new ApiError(400, e?.message || 'Could not save the knowledge base.');
}
