import 'server-only';

/**
 * Knowledge base files: type checks and built-in conversion to Markdown.
 * Pipeline: upload → parse (MinerU or built-in → Markdown + images) → block-aware
 * chunking (lib/server/rag) → [embeddings, later].
 */

export const KNOWLEDGE_BUCKET = 'knowledge';
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // keep in sync with the bucket limit
export const PARSED_FILE = 'parsed.md';

export type KnowledgeKind = 'pdf' | 'docx' | 'doc' | 'pptx' | 'ppt' | 'txt' | 'md';

const KINDS: Record<string, { kind: KnowledgeKind; mime: string }> = {
  pdf: { kind: 'pdf', mime: 'application/pdf' },
  docx: { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  doc: { kind: 'doc', mime: 'application/msword' },
  pptx: { kind: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  ppt: { kind: 'ppt', mime: 'application/vnd.ms-powerpoint' },
  txt: { kind: 'txt', mime: 'text/plain' },
  md: { kind: 'md', mime: 'text/markdown' },
  markdown: { kind: 'md', mime: 'text/markdown' },
};

/** Kinds that need MinerU (no built-in parser). */
export const MINERU_ONLY: KnowledgeKind[] = ['doc', 'ppt', 'pptx'];
/** Kinds sent to MinerU when it is configured (layout-aware parsing: tables, images, reading order). */
export const MINERU_PREFERRED: KnowledgeKind[] = ['pdf', 'doc', 'ppt', 'pptx'];

/** Decide the file type from the extension, then check the bytes match. */
export function detectKind(fileName: string, bytes: Uint8Array): { kind: KnowledgeKind; mime: string } | null {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const info = KINDS[ext];
  if (!info) return null;
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  const isZip = startsWith([0x50, 0x4b, 0x03, 0x04]);
  const isOle = startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (info.kind === 'pdf' && !startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return null; // %PDF-
  if ((info.kind === 'docx' || info.kind === 'pptx') && !isZip) return null;
  if ((info.kind === 'doc' || info.kind === 'ppt') && !isOle) return null;
  if ((info.kind === 'txt' || info.kind === 'md') && bytes.slice(0, 4096).includes(0)) return null; // binary
  return info;
}

/** Storage-safe file name (keeps the extension). */
export function safeFileName(name: string): string {
  const base = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').replace(/^\.+/, '');
  return (base || 'document').slice(-120);
}

export const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

// ---------------------------------------------------------------------------
// Built-in PDF fallback (used only when MinerU is not configured)

/** PDF text per page → Markdown, guessing headings from short Title Case / ALL CAPS lines. */
export async function pdfToMarkdown(bytes: Uint8Array): Promise<{ markdown: string; pageCount: number }> {
  let pages: string[];
  try {
    const { getDocumentProxy, extractText } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    pages = Array.isArray(text) ? text : [text];
  } catch (e) {
    // pdf.js needs JavaScript iterator helpers, which arrived in Node 22.
    if (e instanceof Error && /Iterator is not defined/.test(e.message)) {
      throw new Error(`Reading PDFs needs Node.js 22 or newer (this server runs ${process.version}) — or set MINERU_API_TOKEN to parse with MinerU.`);
    }
    throw e;
  }
  const out: string[] = [];
  for (const raw of pages) {
    const text = raw
      .replace(/\r\n?/g, '\n')
      .replace(/­/g, '')
      .replace(/(\w)-\n(\w)/g, '$1$2')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .trim();
    if (!text) continue;
    for (const block of text.split(/\n\n+/)) {
      let buf: string[] = [];
      const flush = () => {
        if (buf.length) out.push(escapeMarkdownStart(buf.join(' ')));
        buf = [];
      };
      for (const line of block.split('\n').map((l) => l.trim()).filter(Boolean)) {
        if (buf.length === 0 && looksLikeHeading(line)) {
          out.push(`## ${line}`);
          continue;
        }
        buf.push(line);
      }
      flush();
    }
  }
  return { markdown: out.join('\n\n'), pageCount: pages.length };
}

function looksLikeHeading(t: string): boolean {
  if (t.length < 3 || t.length > 80 || /[.,;:]$/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length > 10 || !/[A-Za-z]/.test(t)) return false;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase()) return true;
  const significant = words.filter((w) => /^[A-Za-z]{4,}/.test(w));
  return significant.length >= 1 && significant.every((w) => /^[A-Z]/.test(w)) && /^[A-Z0-9]/.test(t);
}

/** Plain text that happens to start like Markdown syntax ("1. ", "- ", "#") stays text. */
function escapeMarkdownStart(s: string): string {
  return s.replace(/^(\d+)([.)]) /, '$1\\$2 ').replace(/^([-*+#>]) /, '\\$1 ');
}
