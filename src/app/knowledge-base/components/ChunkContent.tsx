'use client';

import React, { useMemo } from 'react';
import { assetUrl } from '@/lib/knowledge';

/**
 * Renders a chunk's content for preview: HTML tables become real tables (rebuilt
 * from cell text only — no document HTML is injected), Markdown images load via
 * short-lived signed links, everything else is shown as text.
 */
export default function ChunkContent({ documentId, content }: { documentId: string; content: string }) {
  const parts = useMemo(() => splitContent(content), [content]);
  return (
    <div className="space-y-2 text-[12px] text-foreground leading-relaxed">
      {parts.map((p, i) => {
        if (p.kind === 'table') return <SafeTable key={`p-${i}`} html={p.value} />;
        if (p.kind === 'image') {
          const url = assetUrl(documentId, p.src);
          return url ? (
            <figure key={`p-${i}`} className="inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={p.alt} loading="lazy" className="max-h-56 max-w-full rounded-md border border-border bg-muted object-contain" />
              {p.alt && <figcaption className="text-[10px] text-muted-foreground mt-0.5">{p.alt}</figcaption>}
            </figure>
          ) : (
            <span key={`p-${i}`} className="text-muted-foreground">[image: {p.alt || p.src}]</span>
          );
        }
        return p.value.trim() ? (
          <p key={`p-${i}`} className="whitespace-pre-wrap break-words">
            {p.value.trim()}
          </p>
        ) : null;
      })}
    </div>
  );
}

type Part = { kind: 'text'; value: string } | { kind: 'table'; value: string } | { kind: 'image'; src: string; alt: string };

function splitContent(content: string): Part[] {
  const out: Part[] = [];
  const re = /<table\b[\s\S]*?<\/table>|!\[([^\]]*)\]\(([^)\s]+)\)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last) out.push({ kind: 'text', value: content.slice(last, m.index) });
    if (m[0].toLowerCase().startsWith('<table')) out.push({ kind: 'table', value: m[0] });
    else out.push({ kind: 'image', alt: m[1] ?? '', src: m[2] ?? '' });
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ kind: 'text', value: content.slice(last) });
  return out;
}

function SafeTable({ html }: { html: string }) {
  const rows = useMemo(() => {
    if (typeof window === 'undefined') return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td')).map((cell) => ({
        text: (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
        colSpan: Math.min(50, Math.max(1, Number(cell.getAttribute('colspan')) || 1)),
        rowSpan: Math.min(500, Math.max(1, Number(cell.getAttribute('rowspan')) || 1)),
        header: cell.tagName === 'TH',
      })),
    );
  }, [html]);
  if (!rows.length) return <p className="whitespace-pre-wrap break-words text-muted-foreground">{html}</p>;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="border-collapse text-[11px]">
        <tbody>
          {rows.map((cells, r) => (
            <tr key={`r-${r}`} className={r === 0 ? 'bg-muted/60 font-600' : ''}>
              {cells.map((c, k) => (
                <td key={`c-${r}-${k}`} colSpan={c.colSpan} rowSpan={c.rowSpan} className="border border-border px-2 py-1 align-top">
                  {c.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
