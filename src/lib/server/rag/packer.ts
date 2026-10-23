/**
 * Pack drafts into chunks by section (port of ragent ChunkPacker + ChunkAssembler).
 *
 * A section = everything between two headings. A section that fits within
 * toleranceChars is atomic: it joins the current chunk or starts its own. Only
 * sections over the tolerance are split inside. Fragments below maxChars/4 are
 * merged into the previous chunk. Pieces of a split block are never merged back.
 */
import { type ChunkBudget, toleranceChars } from './budget';
import type { ChunkDraft } from './chunkers';

const SEPARATOR = '\n\n';
const MIN_CHARS_DIVISOR = 4;

const len = (d: ChunkDraft) => (d.content.trim() ? d.content.length : 0);
const totalLength = (ds: ChunkDraft[]) => ds.reduce((n, d, i) => n + (i ? SEPARATOR.length : 0) + len(d), 0);
const effectiveBody = (d: ChunkDraft) => (d.embeddingBody?.trim() ? d.embeddingBody : d.content);

export function pack(drafts: ChunkDraft[], budget: ChunkBudget): ChunkDraft[] {
  if (drafts.length <= 1) return drafts;
  const { maxChars } = budget;
  const tol = toleranceChars(budget);
  const minChars = Math.max(1, Math.floor(maxChars / MIN_CHARS_DIVISOR));
  const result: ChunkDraft[] = [];
  let buffer: ChunkDraft[] = [];

  for (const section of splitSections(drafts)) {
    const sectionLen = totalLength(section);
    if (sectionLen > tol) {
      buffer = packWithin(buffer, section, budget, minChars, result);
      continue;
    }
    if (buffer.length && breakBefore(totalLength(buffer), sectionLen, minChars, budget)) {
      flush(buffer, result, budget, minChars);
      buffer = [];
    }
    buffer.push(...section);
    // An atomic section may exceed maxChars on its own; it becomes one chunk.
    if (totalLength(buffer) > maxChars) {
      flush(buffer, result, budget, minChars);
      buffer = [];
    }
  }
  flush(buffer, result, budget, minChars);
  return result;
}

function breakBefore(bufferLen: number, sectionLen: number, minChars: number, budget: ChunkBudget): boolean {
  // Too small to stand alone: merge even past maxChars — the tolerance is the real limit.
  if (bufferLen < minChars) return bufferLen + SEPARATOR.length + sectionLen > toleranceChars(budget);
  return bufferLen + SEPARATOR.length + sectionLen > budget.maxChars;
}

function splitSections(drafts: ChunkDraft[]): ChunkDraft[][] {
  const sections: ChunkDraft[][] = [];
  let current: ChunkDraft[] = [];
  for (const d of drafts) {
    if (d.heading && current.length) {
      sections.push(current);
      current = [];
    }
    current.push(d);
  }
  if (current.length) sections.push(current);
  return sections;
}

/** Greedy packing inside an over-tolerance section; returns the unflushed rest so it can join the next section. */
function packWithin(carried: ChunkDraft[], section: ChunkDraft[], budget: ChunkBudget, minChars: number, result: ChunkDraft[]): ChunkDraft[] {
  const { maxChars } = budget;
  let buffer = [...carried];
  for (const d of section) {
    const addLen = len(d);
    if (d.piece || addLen >= maxChars) {
      // Keep the lead-in sentence ("amounts in USD:") with the big block it introduces.
      const leadIn = pollLeadIn(buffer, d, budget);
      flush(buffer, result, budget, minChars);
      const parts = [...leadIn, d];
      result.push(parts.length === 1 ? d : merge(parts));
      buffer = [];
      continue;
    }
    if (buffer.length && totalLength(buffer) + SEPARATOR.length + addLen > maxChars) {
      flush(buffer, result, budget, minChars);
      buffer = [];
    }
    buffer.push(d);
  }
  return buffer;
}

function pollLeadIn(buffer: ChunkDraft[], target: ChunkDraft, budget: ChunkBudget): ChunkDraft[] {
  let taken = 0;
  let from = buffer.length;
  while (from > 0) {
    const next = taken + SEPARATOR.length + len(buffer[from - 1]);
    if (next > budget.maxChars) break;
    taken = next;
    from--;
  }
  if (from === buffer.length || len(target) + taken > toleranceChars(budget)) return [];
  return buffer.splice(from, buffer.length - from);
}

/** Flush the buffer; a leftover below minChars is merged into the previous chunk if that stays within tolerance. */
function flush(buffer: ChunkDraft[], result: ChunkDraft[], budget: ChunkBudget, minChars: number) {
  if (!buffer.length) return;
  const packed = buffer.length === 1 ? buffer[0] : merge(buffer);
  if (result.length && len(packed) < minChars) {
    const prev = result[result.length - 1];
    if (len(prev) + SEPARATOR.length + len(packed) <= toleranceChars(budget)) {
      result[result.length - 1] = merge([prev, packed]);
      return;
    }
  }
  result.push(packed);
}

function merge(parts: ChunkDraft[]): ChunkDraft {
  const join = (xs: string[]) => xs.filter((x) => x.trim()).join(SEPARATOR);
  const hasExplicit = parts.some((p) => p.embeddingBody?.trim());
  return {
    content: join(parts.map((p) => p.content)),
    embeddingBody: hasExplicit ? join(parts.map(effectiveBody)) : null,
    meta: {
      outlinePath: parts[0].meta.outlinePath.slice(0, commonPrefix(parts.map((p) => p.meta.outlinePath))),
      assets: parts.flatMap((p) => p.meta.assets),
    },
    piece: false,
    heading: parts.some((p) => p.heading),
  };
}

function commonPrefix(paths: string[][]): number {
  let n = Math.min(...paths.map((p) => p.length));
  for (const p of paths) {
    let i = 0;
    while (i < n && p[i] === paths[0][i]) i++;
    n = i;
  }
  return n;
}

export interface Chunk {
  index: number;
  /** Original-looking Markdown, headings where they were — shown to the model and in the preview. */
  content: string;
  /** Outline path not already in the text + body — used for keyword search and embeddings. */
  embeddingText: string;
  outlinePath: string[];
  assets: string[];
  tokenCount: number;
}

/**
 * Final chunks: add the part of the section path the text doesn't already contain.
 *
 * `documentTitle`: when the whole document sits under one top-level heading
 * (its title), that level is left out of the prefix — repeating the title in
 * every chunk pulls all of the document's vectors in one direction and makes
 * every chunk match the title's keywords. The title is kept in outlinePath.
 */
export function assemble(drafts: ChunkDraft[], documentTitle: string | null = null): Chunk[] {
  return drafts
    .filter((d) => d.content.trim())
    .map((d, index) => {
      const fullPath = d.meta.outlinePath;
      const path = documentTitle !== null && fullPath[0] === documentTitle ? fullPath.slice(1) : fullPath;
      let keep = 0;
      while (keep < path.length && !d.content.includes(path[keep])) keep++;
      const prefix = keep ? path.slice(0, keep).join(' / ') : '';
      const body = effectiveBody(d).trim();
      const embeddingText = [prefix, body].filter(Boolean).join('\n');
      return {
        index,
        content: d.content,
        embeddingText: embeddingText || d.content,
        outlinePath: fullPath,
        assets: [...new Set(d.meta.assets)],
        tokenCount: estimateTokens(d.content),
      };
    });
}

/** Rough token estimate: CJK ≈ 1 token per character, other text ≈ 4 characters per token. */
export function estimateTokens(text: string): number {
  const cjk = (text.match(/[㐀-鿿豈-﫿]/g) ?? []).length;
  return cjk + Math.ceil((text.length - cjk) / 4);
}
