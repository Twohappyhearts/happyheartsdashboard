/**
 * Per-block chunkers (port of ragent blockaware/*Chunker).
 *
 * Same rule for every type: if the whole block fits within toleranceChars it is
 * kept whole; otherwise it is split at structural boundaries (lines, table rows,
 * list items, sentence ends) to about maxChars.
 */
import type { Block } from './blocks';
import { type ChunkBudget, toleranceChars } from './budget';
import { splitText } from './text-splitter';

export interface ChunkMeta {
  outlinePath: string[];
  /** Storage paths of images in this chunk. */
  assets: string[];
}

export interface ChunkDraft {
  /** Display text (Markdown / HTML table) — what the model and the preview see. */
  content: string;
  /** Search/embedding text when it differs from content (tables as "column: value", images without URLs). */
  embeddingBody: string | null;
  meta: ChunkMeta;
  /** One of several pieces of a split block: the packer must not merge pieces back together. */
  piece: boolean;
  /** Section marker: a heading starts a new section. */
  heading: boolean;
}

export interface ChunkContext {
  outlinePath: string[];
  budget: ChunkBudget;
  /** Maps an image src in the Markdown to its storage path (null = drop). */
  resolveAsset: (src: string) => string | null;
}

const draft = (content: string, ctx: ChunkContext, embeddingBody: string | null = null, assets: string[] = []): ChunkDraft => ({
  content,
  embeddingBody,
  meta: { outlinePath: ctx.outlinePath, assets },
  piece: false,
  heading: false,
});

/** Mark the pieces of one split block (a single piece means it wasn't split). */
function pieces(drafts: ChunkDraft[]): ChunkDraft[] {
  return drafts.length <= 1 ? drafts : drafts.map((d) => ({ ...d, piece: true }));
}

export function chunkBlock(block: Block, ctx: ChunkContext): ChunkDraft[] {
  switch (block.type) {
    case 'heading':
      return headingChunker(block, ctx);
    case 'paragraph':
      return paragraphChunker(block.text, ctx);
    case 'list':
      return listChunker(block, ctx);
    case 'code':
      return codeChunker(block, ctx);
    case 'table':
      return tableChunker(block, ctx);
    case 'htmlTable':
      return htmlTableChunker(block.html, ctx);
    case 'image':
      return imageChunker(block, ctx);
  }
}

/** Headings go back into the text where they were (no "#" in the search text). */
function headingChunker(block: Extract<Block, { type: 'heading' }>, ctx: ChunkContext): ChunkDraft[] {
  const text = block.text.trim();
  if (!text) return [];
  const level = Math.min(6, Math.max(1, block.level));
  return [{ ...draft(`${'#'.repeat(level)} ${text}`, ctx, text), heading: true }];
}

/** Whole paragraph if it fits the tolerance, else ~maxChars pieces with overlap at clean boundaries. */
function paragraphChunker(text: string, ctx: ChunkContext): ChunkDraft[] {
  const { maxChars, overlapChars } = ctx.budget;
  let parts = splitText(text, toleranceChars(ctx.budget), overlapChars);
  if (parts.length > 1) parts = splitText(text, maxChars, overlapChars);
  return pieces(parts.map((p) => draft(p, ctx)));
}

/** Group whole list items by rendered size; never cut inside an item. */
function listChunker(block: Extract<Block, { type: 'list' }>, ctx: ChunkContext): ChunkDraft[] {
  const { items } = block;
  if (!items.length) return [];
  const render = (n: number, item: string) => {
    const marker = block.ordered ? `${n}. ` : '- ';
    return marker + item.replace(/\n/g, `\n${' '.repeat(marker.length)}`);
  };
  const total = items.reduce((sum, it, i) => sum + render(block.start + i, it).length + 1, 0);
  const tol = toleranceChars(ctx.budget);
  const budget = Math.max(1, total <= tol ? tol : ctx.budget.maxChars);
  const out: ChunkDraft[] = [];
  let start = 0;
  let cost = 0;
  const build = (from: number, to: number) =>
    draft(items.slice(from, to).map((it, k) => render(block.start + from + k, it)).join('\n'), ctx);
  items.forEach((item, i) => {
    const itemCost = render(block.start + i, item).length + 1;
    if (i > start && cost + itemCost > budget) {
      out.push(build(start, i));
      start = i;
      cost = 0;
    }
    cost += itemCost;
  });
  out.push(build(start, items.length));
  return pieces(out);
}

/** Whole code block if it fits the tolerance; else split by lines, re-fencing each piece. */
function codeChunker(block: Extract<Block, { type: 'code' }>, ctx: ChunkContext): ChunkDraft[] {
  const { code, language } = block;
  const segments = code.length <= toleranceChars(ctx.budget) ? [code] : splitByLines(code, ctx.budget.maxChars);
  return pieces(segments.map((seg) => draft('```' + language + '\n' + seg + '\n```', ctx, seg)));
}

function splitByLines(code: string, maxChars: number): string[] {
  const segments: string[] = [];
  let current = '';
  for (const line of code.split('\n')) {
    const addition = current ? current.length + 1 + line.length : line.length;
    if (current && addition > maxChars) {
      segments.push(current);
      current = '';
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) segments.push(current);
  return segments.length ? segments : [code];
}

/**
 * Markdown table: shown as a Markdown table (header repeated in every piece);
 * searched as "column: value" rows, because embedding models can't read column
 * positions.
 */
function tableChunker(block: Extract<Block, { type: 'table' }>, ctx: ChunkContext): ChunkDraft[] {
  const { headers, rows } = block;
  if (!headers.length && !rows.length) return [];
  const oneLine = (s: string) => s.replace(/\r\n|\r|\n/g, ' ');
  const kvRow = (row: string[]) =>
    row
      .map((v, c) => (v ? (headers[c] ? `${oneLine(headers[c])}: ${oneLine(v)}` : oneLine(v)) : ''))
      .filter(Boolean)
      .join('; ');
  const kvRows = (rs: string[][]) => rs.map(kvRow).filter(Boolean).join('\n');
  const cell = (s: string) => (s ?? '').replace(/\|/g, '\\|').replace(/\r\n|\r|\n/g, '<br>');
  const mdTable = (rs: string[][]) =>
    [`| ${headers.map(cell).join(' | ')} |`, `|${'---|'.repeat(headers.length)}`, ...rs.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
  const build = (rs: string[][]) => draft(mdTable(rs), ctx, kvRows(rs) || null);

  const maxRows = Math.max(1, ctx.budget.rowsPerChunk);
  const tol = toleranceChars(ctx.budget);
  const budget = rows.length <= maxRows && kvRows(rows).length <= tol ? tol : Math.max(1, ctx.budget.maxChars);
  if (!rows.length) return [build([])];
  const out: ChunkDraft[] = [];
  let group: string[][] = [];
  let cost = 0;
  for (const row of rows) {
    const rowCost = kvRow(row).length;
    if (group.length >= maxRows || (group.length && cost + rowCost > budget)) {
      out.push(build(group));
      group = [];
      cost = 0;
    }
    group.push(row);
    cost += rowCost;
  }
  out.push(build(group));
  return pieces(out);
}

const TR_RE = /<tr\b[^>]*>[\s\S]*?<\/tr>/gi;
const NO_OP_SPAN = /\s+(?:colspan|rowspan)\s*=\s*["']?1["']?/gi;

/** HTML table (MinerU): split at <tr>, each piece repeats the header row inside the original <table> tag. */
function htmlTableChunker(rawHtml: string, ctx: ChunkContext): ChunkDraft[] {
  if (!rawHtml.trim()) return [];
  const html = rawHtml.replace(NO_OP_SPAN, '');
  const rows = html.match(TR_RE) ?? [];
  const body = htmlTableText(html);
  if (rows.length < 2) return [draft(html, ctx, body || null)];
  const open = html.slice(0, html.indexOf('>') + 1) || '<table>';
  const header = rows[0] ?? '';
  const maxRows = Math.max(1, ctx.budget.rowsPerChunk);
  const tol = toleranceChars(ctx.budget);
  const budget = rows.length - 1 <= maxRows && html.length <= tol ? tol : Math.max(1, ctx.budget.maxChars);
  const overhead = open.length + '</table>'.length + header.length;
  const render = (group: string[]) => {
    const h = `${open}${header}${group.join('')}</table>`;
    return draft(h, ctx, htmlTableText(h) || null);
  };
  const out: ChunkDraft[] = [];
  let group: string[] = [];
  let len = 0;
  for (const row of rows.slice(1)) {
    if (group.length >= maxRows || (group.length && overhead + len + row.length > budget)) {
      out.push(render(group));
      group = [];
      len = 0;
    }
    group.push(row);
    len += row.length;
  }
  out.push(render(group));
  return pieces(out);
}

/** Search text for an HTML table: "header: value" per row (first row as header). */
function htmlTableText(html: string): string {
  const rows = (html.match(TR_RE) ?? []).map((tr) =>
    (tr.match(/<t[hd]\b[^>]*>[\s\S]*?<\/t[hd]>/gi) ?? []).map((c) =>
      decode(c.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
    ),
  );
  if (!rows.length) return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const [head, ...rest] = rows;
  if (!rest.length) return head.join('; ');
  return rest
    .map((r) => r.map((v, i) => (v ? (head[i] ? `${head[i]}: ${v}` : v) : '')).filter(Boolean).join('; '))
    .filter(Boolean)
    .join('\n');
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** One draft per image: content keeps the Markdown link, search text only the description. */
function imageChunker(block: Extract<Block, { type: 'image' }>, ctx: ChunkContext): ChunkDraft[] {
  const path = ctx.resolveAsset(block.src);
  if (!path) return [];
  const caption = block.alt.trim();
  // TODO(VLM): fill a description here; until then the caption/alt text is all we have.
  const description = caption;
  const markdown = `![${caption}](${block.src})`;
  return [draft(description ? `${description}\n\n${markdown}` : markdown, ctx, description || null, [path])];
}
