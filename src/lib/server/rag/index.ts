import 'server-only';
import { parseBlocks } from './blocks';
import type { ChunkBudget } from './budget';
import { type ChunkDraft, chunkBlock } from './chunkers';
import { type Chunk, assemble, pack } from './packer';

export type { ChunkBudget } from './budget';
export { DEFAULT_BUDGET, parseBudget, toleranceChars, MAX_CHARS_LIMIT, TOLERANCE_FACTOR_LIMIT } from './budget';
export type { Chunk } from './packer';

/**
 * Markdown → final chunks:
 * blocks (heading / paragraph / list / code / table / HTML table / image)
 * → per-type chunk drafts (with the current section path)
 * → packed by section and size → chunks with search/embedding text.
 */
export function chunkMarkdown(
  markdown: string,
  budget: ChunkBudget,
  resolveAsset: (src: string) => string | null = () => null,
): Chunk[] {
  const blocks = parseBlocks(markdown);
  const documentTitle = findDocumentTitle(blocks);
  let path: string[] = [];
  let levels: number[] = [];
  const drafts: ChunkDraft[] = [];
  for (const block of blocks) {
    if (block.type === 'heading') {
      // Pop same-or-deeper levels; the parent is the nearest smaller level.
      let keep = levels.length;
      while (keep > 0 && levels[keep - 1] >= block.level) keep--;
      path = [...path.slice(0, keep), block.text];
      levels = [...levels.slice(0, keep), block.level];
    }
    drafts.push(...chunkBlock(block, { outlinePath: path, budget, resolveAsset }));
  }
  return assemble(pack(drafts, budget), documentTitle);
}

/**
 * The document's title heading: the first heading, when it is the only heading
 * at the top level used in the document (e.g. one "# Title" above "## 1 …"
 * sections). Returns null when there is no such single root.
 */
function findDocumentTitle(blocks: ReturnType<typeof parseBlocks>): string | null {
  const headings = blocks.filter((b): b is Extract<typeof b, { type: 'heading' }> => b.type === 'heading');
  if (headings.length < 2) return null;
  const top = Math.min(...headings.map((h) => h.level));
  const roots = headings.filter((h) => h.level === top);
  return roots.length === 1 && headings[0] === roots[0] ? roots[0].text : null;
}
