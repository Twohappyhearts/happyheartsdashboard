import MarkdownIt from 'markdown-it';

/** Structured blocks parsed from Markdown (MinerU output or built-in conversion). */
export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'htmlTable'; html: string }
  | { type: 'image'; src: string; alt: string };

const md = new MarkdownIt({ html: true, linkify: false });
type Token = ReturnType<MarkdownIt['parse']>[number];

/** Markdown → blocks. Uses markdown-it (CommonMark + GFM tables) token stream. */
export function parseBlocks(markdown: string): Block[] {
  const src = markdown.replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const tokens = md.parse(src, {});
  const blocks: Block[] = [];
  const sliceLines = (map: [number, number] | null | undefined) => (map ? lines.slice(map[0], map[1]).join('\n') : '');

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    switch (t.type) {
      case 'heading_open': {
        const inline = tokens[i + 1];
        const text = (inline?.content ?? '').trim();
        if (text) blocks.push({ type: 'heading', level: Number(t.tag.slice(1)) || 1, text });
        i = skipTo(tokens, i, 'heading_close') + 1;
        break;
      }
      case 'paragraph_open': {
        const inline = tokens[i + 1];
        blocks.push(...paragraphBlocks(inline));
        i = skipTo(tokens, i, 'paragraph_close') + 1;
        break;
      }
      case 'bullet_list_open':
      case 'ordered_list_open': {
        const close = matchingClose(tokens, i);
        const items: string[] = [];
        for (let k = i + 1; k < close; k++) {
          const tk = tokens[k];
          if (tk.type === 'list_item_open' && tk.level === t.level + 1) items.push(listItemText(sliceLines(tk.map)));
        }
        blocks.push({
          type: 'list',
          ordered: t.type === 'ordered_list_open',
          start: Number(t.attrGet('start') ?? 1) || 1,
          items: items.filter((x) => x.trim()),
        });
        i = close + 1;
        break;
      }
      case 'fence':
      case 'code_block': {
        const code = t.content.replace(/\n$/, '');
        if (code.trim()) blocks.push({ type: 'code', language: (t.info ?? '').trim().split(/\s+/)[0] ?? '', code });
        i++;
        break;
      }
      case 'table_open': {
        const close = matchingClose(tokens, i);
        const headers: string[] = [];
        const rows: string[][] = [];
        let row: string[] | null = null;
        let inHead = false;
        for (let k = i + 1; k < close; k++) {
          const tk = tokens[k];
          if (tk.type === 'thead_open') inHead = true;
          else if (tk.type === 'thead_close') inHead = false;
          else if (tk.type === 'tr_open') row = [];
          else if (tk.type === 'tr_close') {
            if (row && !inHead) rows.push(row);
            row = null;
          } else if (tk.type === 'inline' && row) {
            if (inHead) headers.push(tk.content.trim());
            else row.push(tk.content.trim());
          }
        }
        blocks.push({ type: 'table', headers, rows });
        i = close + 1;
        break;
      }
      case 'html_block': {
        const html = t.content.trim();
        if (/<table[\s>]/i.test(html)) {
          // MinerU writes each table as one HTML block; keep any text around it as paragraphs.
          for (const part of splitHtmlTables(html)) blocks.push(part);
        } else if (html && !/^<!--[\s\S]*-->$/.test(html)) {
          const text = html.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').trim();
          if (text) blocks.push({ type: 'paragraph', text });
        }
        i++;
        break;
      }
      case 'blockquote_open': {
        const close = matchingClose(tokens, i);
        const text = sliceLines(t.map).replace(/^\s*>\s?/gm, '').trim();
        if (text) blocks.push({ type: 'paragraph', text });
        i = close + 1;
        break;
      }
      default:
        i++;
    }
  }
  return blocks;
}

function skipTo(tokens: Token[], from: number, type: string): number {
  let k = from;
  while (k < tokens.length && tokens[k].type !== type) k++;
  return k;
}

function matchingClose(tokens: Token[], openIndex: number): number {
  const open = tokens[openIndex];
  let depth = 0;
  for (let k = openIndex; k < tokens.length; k++) {
    const tk = tokens[k];
    if (tk.tag === open.tag && tk.nesting === 1) depth++;
    if (tk.tag === open.tag && tk.nesting === -1) {
      depth--;
      if (depth === 0) return k;
    }
  }
  return tokens.length - 1;
}

const IMAGE_MD = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const IMAGE_LINE = /^\s*(?:!\[[^\]]*\]\([^)]+\)\s*)+$/;
const MAX_CAPTION = 400;

/**
 * Split a paragraph into text and image blocks, line by line (raw Markdown).
 * MinerU writes "![](images/x.jpg)" and its caption ("Figure 1: …") as two
 * lines of one paragraph: the image becomes an image block and the caption
 * line right after it becomes the image's description. An image inside a
 * sentence stays part of the text.
 */
function paragraphBlocks(inline: Token | undefined): Block[] {
  if (!inline) return [];
  const lines = inline.content.split('\n').map((l) => l.replace(/\s+$/, ''));
  const out: Block[] = [];
  let text: string[] = [];
  const flushText = () => {
    const t = text.join('\n').trim();
    if (t) out.push({ type: 'paragraph', text: t });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!IMAGE_LINE.test(line)) {
      text.push(line);
      continue;
    }
    flushText();
    const images = [...line.matchAll(IMAGE_MD)].map((m) => ({ alt: (m[1] ?? '').trim(), src: m[2] ?? '' }));
    const next = lines[i + 1]?.trim() ?? '';
    const caption = next && !IMAGE_LINE.test(next) && next.length <= MAX_CAPTION ? next : '';
    if (caption) i++; // the caption belongs to the image(s) above it
    images.forEach((img, k) => {
      const alt = [img.alt, k === images.length - 1 ? caption : ''].filter(Boolean).join(' — ');
      out.push({ type: 'image', src: img.src, alt });
    });
  }
  flushText();
  return out;
}

/** Strip the list marker of the first line and the common indent of continuation lines. */
function listItemText(raw: string): string {
  const lines = raw.replace(/\s+$/, '').split('\n');
  const first = lines[0].replace(/^\s*(?:[-*+]|\d+[.)])\s?/, '');
  const rest = lines.slice(1);
  const indent = Math.min(...rest.filter((l) => l.trim()).map((l) => l.match(/^\s*/)![0].length), Infinity);
  const body = rest.map((l) => (Number.isFinite(indent) ? l.slice(indent) : l));
  return [first, ...body].join('\n').trim();
}

/** Split an HTML block into its <table> elements and any text between them. */
function splitHtmlTables(html: string): Block[] {
  const out: Block[] = [];
  const re = /<table\b[\s\S]*?<\/table>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const before = html.slice(last, m.index).replace(/<[^>]+>/g, ' ').trim();
    if (before) out.push({ type: 'paragraph', text: before });
    out.push({ type: 'htmlTable', html: m[0] });
    last = m.index + m[0].length;
  }
  const after = html.slice(last).replace(/<[^>]+>/g, ' ').trim();
  if (after) out.push({ type: 'paragraph', text: after });
  return out;
}
