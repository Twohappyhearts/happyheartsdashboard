/**
 * Boundary-aware text splitting (port of ragent TextSplitter).
 *
 * Cuts land on newline → CJK sentence end → English sentence end (looking back at
 * most `overlap` chars), never mid-URL; also repairs URLs broken across lines and
 * joins CJK words split by soft line breaks.
 */

export function splitText(text: string, maxChars: number, overlapChars: number): string[] {
  if (!text || !text.trim()) return [];
  const normalized = normalizeText(text);
  if (normalized.length <= maxChars) return [normalized];
  const chunkSize = Math.max(1, maxChars);
  const overlap = chunkSize > 1 ? Math.min(Math.max(0, overlapChars), chunkSize - 1) : 0;
  const len = normalized.length;
  const pieces: string[] = [];
  let start = 0;
  let lastEnd = -1;
  while (start < len) {
    const targetEnd = Math.min(start + chunkSize, len);
    let end = adjustToBoundary(normalized, start, targetEnd, overlap);
    // Always move forward: looking back too far would repeat or stall.
    if (end <= start || end <= lastEnd) end = targetEnd;
    const piece = normalized.slice(start, end);
    if (piece.trim()) pieces.push(piece);
    lastEnd = end;
    if (end >= len) break;
    let nextStart = Math.max(0, end - overlap);
    if (nextStart <= start) nextStart = end;
    start = nextStart;
  }
  return pieces;
}

function adjustToBoundary(text: string, start: number, targetEnd: number, overlap: number): number {
  if (targetEnd <= start) return targetEnd;
  const maxLookback = Math.min(overlap, targetEnd - start);
  if (maxLookback <= 0) return targetEnd;
  for (let i = 0; i <= maxLookback; i++) {
    const pos = targetEnd - i - 1;
    if (pos <= start) break;
    if (text[pos] === '\n') return pos + 1;
  }
  for (let i = 0; i <= maxLookback; i++) {
    const pos = targetEnd - i - 1;
    if (pos <= start) break;
    const c = text[pos];
    if (c === '。' || c === '！' || c === '？') return pos + 1;
  }
  for (let i = 0; i <= maxLookback; i++) {
    const pos = targetEnd - i - 1;
    if (pos <= start) break;
    const c = text[pos];
    if (c === '.' || c === '!' || c === '?') {
      const next = pos + 1;
      if (next >= text.length || /\s/.test(text[next])) return next;
    }
  }
  return targetEnd;
}

/** Remove \r, repair URLs broken by a single newline, join CJK words split by soft breaks. */
export function normalizeText(text: string): string {
  if (!text) return text;
  const src = text.replace(/\r/g, '');
  let out = '';
  let inUrl = false;
  for (let i = 0; i < src.length; i++) {
    if (!inUrl && (src.startsWith('http://', i) || src.startsWith('https://', i))) inUrl = true;
    const c = src[i];
    if (inUrl) {
      if (/\s/.test(c)) {
        let j = i;
        let newlines = 0;
        while (j < src.length && /\s/.test(src[j])) {
          if (src[j] === '\n') newlines++;
          j++;
        }
        const prev = i > 0 ? src[i - 1] : '';
        const next = j < src.length ? src[j] : '';
        if (newlines > 0 && newlines < 2 && next && shouldJoinBrokenUrl(prev, next, src, j)) {
          i = j - 1;
          continue;
        }
        out += src.slice(i, j);
        inUrl = false;
        i = j - 1;
        continue;
      }
      out += c;
      if (!isUrlChar(c)) inUrl = false;
      continue;
    }
    if (c === '\n') {
      const prev = i > 0 ? src[i - 1] : '';
      const next = i + 1 < src.length ? src[i + 1] : '';
      if (isCjkWordChar(prev) && isCjkWordChar(next)) continue; // 商\n保通 → 商保通
      out += '\n';
      continue;
    }
    out += c;
  }
  return out;
}

function shouldJoinBrokenUrl(prev: string, next: string, s: string, nextIndex: number): boolean {
  if (isListItemStart(s, nextIndex)) return false;
  if (prev === '.' && /\p{L}/u.test(next)) return true;
  if ('/?&=#%-_:'.includes(prev) && prev !== '') return true;
  return '/?&=#'.includes(next) && next !== '';
}

function isListItemStart(s: string, i: number): boolean {
  let p = i;
  while (p < s.length && (s[p] === ' ' || s[p] === '\t')) p++;
  const start = p;
  while (p < s.length && /[0-9]/.test(s[p])) p++;
  if (p === start) return false;
  return p < s.length && (s[p] === '.' || s[p] === '）' || s[p] === ')');
}

function isUrlChar(c: string): boolean {
  return /[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/.test(c);
}

const CJK_RE = /[㐀-䶿一-鿿豈-﫿＀-￯]/;
const CJK_PUNCT_RE = /[　-〿 -⁯。，、；：！？（）【】《》“”‘’！（），：；？]/;

function isCjkWordChar(c: string): boolean {
  if (!c || /\s/.test(c)) return false;
  return CJK_RE.test(c) && !CJK_PUNCT_RE.test(c);
}
