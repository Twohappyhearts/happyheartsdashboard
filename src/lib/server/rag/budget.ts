/**
 * Chunk budget (port of ragent ChunkBudget).
 *
 * maxChars is a target, not a hard cap: breaking a semantic unit costs more than
 * going over. toleranceChars() = maxChars × toleranceFactor (capped at
 * MAX_CHARS_LIMIT) is how far a whole section / table / list / code block may
 * grow before it gets split.
 */
export interface ChunkBudget {
  maxChars: number;
  /** Overlap between pieces of a split paragraph; also the max look-back for a clean break. */
  overlapChars: number;
  /** Hard cap on table rows per chunk. */
  rowsPerChunk: number;
  /** 1 = split strictly at maxChars; larger keeps structures whole. */
  toleranceFactor: number;
}

export const MAX_CHARS_LIMIT = 8192;
export const MIN_CHARS_LIMIT = 200;
export const TOLERANCE_FACTOR_LIMIT = 8;
export const ROWS_PER_CHUNK_LIMIT = 1000;
export const OVERLAP_DIVISOR = 8;

export const DEFAULT_BUDGET: ChunkBudget = {
  maxChars: 1024,
  overlapChars: 128,
  rowsPerChunk: 50,
  toleranceFactor: 3,
};

export function defaultOverlapFor(maxChars: number): number {
  return Math.max(0, Math.min(maxChars - 1, Math.floor(maxChars / OVERLAP_DIVISOR)));
}

export function toleranceChars(b: ChunkBudget): number {
  return Math.min(b.maxChars * b.toleranceFactor, MAX_CHARS_LIMIT);
}

/** Validate settings from a request; returns an error message or a budget. */
export function parseBudget(raw: unknown): ChunkBudget | string {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number) => (v == null || v === '' ? d : Number(v));
  const maxChars = num(o.targetChars, DEFAULT_BUDGET.maxChars);
  const overlapChars = num(o.overlapChars, defaultOverlapFor(maxChars));
  const toleranceFactor = num(o.toleranceFactor, DEFAULT_BUDGET.toleranceFactor);
  const rowsPerChunk = num(o.rowsPerChunk, DEFAULT_BUDGET.rowsPerChunk);
  if (!Number.isInteger(maxChars) || maxChars < MIN_CHARS_LIMIT || maxChars > MAX_CHARS_LIMIT) {
    return `Chunk size must be a whole number from ${MIN_CHARS_LIMIT} to ${MAX_CHARS_LIMIT} characters.`;
  }
  if (!Number.isInteger(overlapChars) || overlapChars < 0 || overlapChars > Math.floor(maxChars / 2)) {
    return 'Overlap must be a whole number from 0 to half the chunk size.';
  }
  if (!Number.isInteger(toleranceFactor) || toleranceFactor < 1 || toleranceFactor > TOLERANCE_FACTOR_LIMIT) {
    return `Structure tolerance must be a whole number from 1 to ${TOLERANCE_FACTOR_LIMIT}.`;
  }
  if (!Number.isInteger(rowsPerChunk) || rowsPerChunk < 1 || rowsPerChunk > ROWS_PER_CHUNK_LIMIT) {
    return `Rows per table chunk must be 1–${ROWS_PER_CHUNK_LIMIT}.`;
  }
  return { maxChars, overlapChars, toleranceFactor, rowsPerChunk };
}
