'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { KnowledgeError, hybridSearch, type SearchHit, type SearchResult } from '@/lib/knowledge';
import ChunkContent from './ChunkContent';
import { useStaffT } from '@/lib/i18n/staff/context';

const fieldClass =
  'w-full px-2.5 py-1.5 border border-border rounded-lg text-[12px] bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring';
const labelClass = 'block text-[10px] font-600 text-muted-foreground uppercase tracking-wider whitespace-nowrap mb-1';

const secs = (ms: number) => `${(ms / 1000).toFixed(ms < 1000 ? 2 : 1)} s`;

function Pill({ children, tone = 'muted', title }: { children: React.ReactNode; tone?: 'muted' | 'primary' | 'info'; title?: string }) {
  const cls =
    tone === 'primary'
      ? 'border-primary text-primary'
      : tone === 'info'
        ? 'border-info text-info'
        : 'border-border text-muted-foreground';
  return (
    <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-600 whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}

function HitCard({ hit, position }: { hit: SearchHit; position: number }) {
  const [open, setOpen] = useState(false);
  const T = useStaffT().t.kb.searchTest;
  return (
    <li className="rounded-lg border border-border p-3">
      <div className="mb-2 space-y-1.5">
        <div className="min-w-0">
          <p className="text-[12px] font-600 text-foreground truncate">
            <span className="text-muted-foreground font-500 mr-1.5">#{position}</span>
            {hit.title} <span className="text-muted-foreground font-400">{T.chunk(hit.chunkIndex + 1)}</span>
          </p>
          {hit.outlinePath.length > 0 && (
            <p className="text-[11px] text-muted-foreground truncate" title={hit.outlinePath.join(' › ')}>
              {hit.outlinePath.join(' › ')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {hit.rerankScore != null && (
            <Pill tone="primary" title={T.rerankScore}>
              {T.rerank} {hit.rerankScore.toFixed(3)}
            </Pill>
          )}
          <Pill title={T.rrfScore(hit.rrfScore.toFixed(4))}>RRF #{hit.rrfRank}</Pill>
          <Pill tone={hit.keywordRank ? 'info' : 'muted'} title={hit.keywordScore != null ? `ts_rank ${hit.keywordScore.toFixed(4)}` : T.notInKeyword}>
            {T.keyword} {hit.keywordRank ? `#${hit.keywordRank}` : '—'}
          </Pill>
          <Pill tone={hit.vectorRank ? 'info' : 'muted'} title={T.cosine}>
            {T.vector} {hit.vectorRank ? `#${hit.vectorRank} · ${hit.vectorSimilarity?.toFixed(3)}` : '—'}
          </Pill>
        </div>
      </div>
      <div className={open ? '' : 'max-h-28 overflow-hidden relative'}>
        <ChunkContent documentId={hit.documentId} content={hit.content} />
        {!open && <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />}
      </div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-[11px] font-500 text-primary hover:underline">
        {open ? T.showLess : T.showFull}
      </button>
    </li>
  );
}

/** Hybrid search tester: keyword top N + vector top N → RRF → rerank → top K. */
export default function SearchTestPanel({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const [open, setOpen] = useState(false);
  const T = useStaffT().t.kb.searchTest;
  const [query, setQuery] = useState('');
  const [keywordK, setKeywordK] = useState('20');
  const [vectorK, setVectorK] = useState('20');
  const [topK, setTopK] = useState('5');
  const [useRerank, setUseRerank] = useState(true);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const kw = Number(keywordK);
      const vec = Number(vectorK);
      setResult(
        await hybridSearch({
          query: query.trim(),
          knowledgeBaseId,
          keywordK: kw,
          vectorK: vec,
          candidates: Math.max(kw, vec, Number(topK)),
          topK: Number(topK),
          rerank: useRerank,
        }),
      );
    } catch (err) {
      setError(err instanceof KnowledgeError ? err.message : T.failed);
      setResult(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-card">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-5 py-3 text-left">
        <span className="text-[13px] font-600 text-foreground">{T.title}</span>
        <Icon name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={16} variant="outline" className="text-muted-foreground" />
      </button>
      {open && (
        <form onSubmit={run} className="px-5 pb-5 space-y-3">
          <p className="text-[11px] text-muted-foreground">{T.intro}</p>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon name="MagnifyingGlassIcon" size={14} variant="outline" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={T.placeholder}
                className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={searching || !query.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-[13px] font-600 hover:opacity-90 transition-all duration-150 active:scale-95 disabled:opacity-60 whitespace-nowrap"
            >
              {searching ? T.searching : T.search}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <label className="block min-w-0">
              <span className={labelClass}>{T.keywordTopN}</span>
              <input type="number" min={0} max={100} value={keywordK} onChange={(e) => setKeywordK(e.target.value)} className={fieldClass} />
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>{T.vectorTopN}</span>
              <input type="number" min={0} max={100} value={vectorK} onChange={(e) => setVectorK(e.target.value)} className={fieldClass} />
            </label>
            <label className="block min-w-0">
              <span className={labelClass}>{T.topK}</span>
              <input type="number" min={1} max={20} value={topK} onChange={(e) => setTopK(e.target.value)} className={fieldClass} />
            </label>
            <label className="flex items-center gap-2 text-[12px] text-foreground pb-1.5">
              <input type="checkbox" checked={useRerank} onChange={(e) => setUseRerank(e.target.checked)} className="accent-[var(--primary)]" />
              {T.rerank}
            </label>
          </div>

          {error && <p className="text-[12px] text-danger">{error}</p>}

          {result && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">
                {T.summary(result.candidateCount)}
                {result.reranked ? T.rerankedWith(result.rerankModel ?? '') : T.notReranked}
                {T.timings(
                  secs(result.timings.totalMs),
                  secs(result.timings.embedMs),
                  secs(result.timings.searchMs),
                  result.reranked ? secs(result.timings.rerankMs) : null,
                )}
              </p>
              {result.warnings.map((w) => (
                <p key={w} className="text-[12px] text-warning">
                  {w}
                </p>
              ))}
              {result.results.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">{T.nothing}</p>
              ) : (
                <ul className="space-y-2">
                  {result.results.map((h, i) => (
                    <HitCard key={h.chunkId} hit={h} position={i + 1} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  );
}
