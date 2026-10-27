'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import Icon from '@/components/ui/AppIcon';
import { FIXED_REPLIES, isCareteamSituation } from '@/lib/agent-fixed-replies';
import { displaySource, splitSources } from '@/lib/agent-sources';

// html: false → any HTML in model output is escaped, never injected.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return self.renderToken(tokens, idx, options);
};

type Part = UIMessage['parts'][number];
type ToolPart = Extract<Part, { toolCallId: string }>;

interface Props {
  message: UIMessage;
  /** Approval buttons are live only on the latest message while nothing is streaming. */
  canRespond: boolean;
  streaming: boolean;
  onApproval: (approvalId: string, approved: boolean, editedMessage?: string) => void;
  /**
   * false: approval buttons are shown elsewhere (the mobile bottom sheet); the
   * card only says it is waiting. Default true (dashboard: buttons in the card).
   */
  inlineApproval?: boolean;
}

export default function AiMessageParts({ message, canRespond, streaming, onApproval, inlineApproval = true }: Props) {
  const searchResults = useMemo(() => collectSearchResults(message), [message]);
  let hasText = false;
  return (
    <div className="space-y-2">
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          if (!part.text.trim()) return null;
          hasText = true;
          const { text, refs } = splitSources(part.text);
          return (
            <React.Fragment key={`t-${i}`}>
              {text.trim() && <Markdown text={text} />}
              {refs.length > 0 && <SourceChips refs={refs} results={searchResults} />}
            </React.Fragment>
          );
        }
        if (part.type === 'reasoning') {
          return part.text.trim() ? <Reasoning key={`r-${i}`} text={part.text} active={streaming && i === message.parts.length - 1} /> : null;
        }
        if (isToolUIPart(part)) {
          const name = getToolName(part);
          if (name === 'searchKnowledge') return <SearchCard key={part.toolCallId} part={part as ToolPart} />;
          if (name === 'notifyCareteam') {
            // The model sometimes offers the care-team message without writing the fixed reply
            // (referral / 911 / 988) first; show that reply from code so it is never missing.
            const situation = (part.input as { situation?: unknown } | undefined)?.situation;
            const fallback = !hasText && isCareteamSituation(situation) ? FIXED_REPLIES[situation] : null;
            if (fallback) hasText = true;
            return (
              <React.Fragment key={part.toolCallId}>
                {fallback && <Markdown text={fallback} />}
                <CareteamCard part={part as ToolPart} canRespond={canRespond} inline={inlineApproval} onApproval={onApproval} />
              </React.Fragment>
            );
          }
          return <GenericToolCard key={part.toolCallId} name={name} part={part as ToolPart} />;
        }
        return null;
      })}
    </div>
  );
}

interface SearchResult {
  ref?: number;
  title: string;
  source?: string | null;
  url?: string | null;
}

/** ref → search result, over every searchKnowledge call in this reply. */
function collectSearchResults(message: UIMessage): Map<number, SearchResult> {
  const byRef = new Map<number, SearchResult>();
  for (const part of message.parts) {
    if (!isToolUIPart(part) || getToolName(part) !== 'searchKnowledge' || part.state !== 'output-available') continue;
    for (const r of (part.output as { results?: SearchResult[] } | undefined)?.results ?? []) {
      if (typeof r.ref === 'number') byRef.set(r.ref, r);
    }
  }
  return byRef;
}

/** One chip per document the answer cited: organization · title, linking to the original page. */
function SourceChips({ refs, results }: { refs: number[]; results: Map<number, SearchResult> }) {
  const docs = new Map<string, SearchResult>();
  for (const ref of refs) {
    const r = results.get(ref);
    if (r && !docs.has(r.title)) docs.set(r.title, r);
  }
  if (!docs.size) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
      <span className="text-muted-foreground">Source:</span>
      {Array.from(docs.values()).map((d) => {
        const label = [displaySource(d.source), d.title].filter(Boolean).join(' · ');
        const chip = 'inline-flex max-w-full items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-secondary-foreground';
        return d.url ? (
          <a key={d.title} href={d.url} target="_blank" rel="noopener noreferrer" className={`${chip} hover:bg-muted truncate`} title={label}>
            {label}
          </a>
        ) : (
          <span key={d.title} className={`${chip} truncate`} title={label}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => md.render(text), [text]);
  return (
    <div
      className="prose prose-sm max-w-none text-[13.5px] leading-relaxed text-foreground prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Reasoning({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-[12px]">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
        <Icon name={open ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={12} variant="outline" />
        {active ? 'Thinking…' : 'Thought process'}
      </button>
      {open && (
        <p className="mt-1 pl-3 border-l-2 border-border text-muted-foreground whitespace-pre-wrap break-words">{text}</p>
      )}
    </div>
  );
}

interface SearchOutput {
  results?: { chunkId: string; title: string; section?: string; content: string }[];
}

function SearchCard({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const query = (part.input as { query?: string } | undefined)?.query ?? '';
  const results = part.state === 'output-available' ? ((part.output as SearchOutput)?.results ?? []) : [];
  const titles = Array.from(new Set(results.map((r) => r.title).filter(Boolean)));
  const running = part.state === 'input-streaming' || part.state === 'input-available';

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px]">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 text-left text-secondary-foreground" disabled={running}>
        <Icon
          name={running ? 'ArrowPathIcon' : 'MagnifyingGlassIcon'}
          size={13}
          variant="outline"
          className={`shrink-0 ${running ? 'animate-spin' : ''}`}
        />
        <span className="flex-1 truncate">
          {running ? 'Searching the knowledge base' : 'Searched the knowledge base'}
          {query && <span className="text-muted-foreground"> · “{query}”</span>}
        </span>
        {part.state === 'output-available' && (
          <span className="text-muted-foreground shrink-0">
            {results.length} result{results.length === 1 ? '' : 's'}
          </span>
        )}
        {part.state === 'output-error' && <span className="text-danger shrink-0">failed</span>}
      </button>
      {!open && titles.length > 0 && <p className="mt-1 text-muted-foreground truncate pl-5">{titles.join(' · ')}</p>}
      {open && results.length > 0 && (
        <ul className="mt-2 space-y-2 pl-5">
          {results.map((r) => (
            <li key={r.chunkId}>
              <p className="font-600 text-foreground">
                {r.title}
                {r.section && <span className="font-400 text-muted-foreground"> · {r.section}</span>}
              </p>
              <p className="text-muted-foreground whitespace-pre-wrap break-words line-clamp-4">{r.content}</p>
            </li>
          ))}
        </ul>
      )}
      {part.state === 'output-error' && <p className="mt-1 text-danger pl-5">{part.errorText}</p>}
    </div>
  );
}

function CareteamCard({
  part,
  canRespond,
  inline,
  onApproval,
}: {
  part: ToolPart;
  canRespond: boolean;
  inline: boolean;
  onApproval: Props['onApproval'];
}) {
  const draft = (part.input as { message?: string } | undefined)?.message ?? '';
  const output =
    part.state === 'output-available'
      ? (part.output as { preview?: boolean; sentMessage?: string; editedByPatient?: boolean } | undefined)
      : undefined;
  const editing = part.state === 'approval-requested' && canRespond && inline;
  const [text, setText] = useState(draft);
  // The card can mount while the draft is still streaming in; follow it until the user edits.
  const edited = useRef(false);
  useEffect(() => {
    if (!edited.current) setText(draft);
  }, [draft]);
  const shown = output?.sentMessage || draft;

  let status: React.ReactNode = null;
  if (part.state === 'approval-requested' && canRespond && !inline) {
    status = <p className="mt-2 text-muted-foreground">Waiting for your answer…</p>;
  } else if (editing) {
    status = (
      <div className="flex items-center gap-2 mt-2.5">
        <button
          onClick={() => onApproval(part.approval!.id, true, text)}
          disabled={!text.trim()}
          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-[12px] font-600 hover:opacity-90 disabled:opacity-40"
        >
          Send to care team
        </button>
        <button
          onClick={() => onApproval(part.approval!.id, false)}
          className="px-3 py-1.5 border border-border text-foreground rounded-lg text-[12px] font-600 hover:bg-muted"
        >
          Don’t send
        </button>
      </div>
    );
  } else if (part.state === 'approval-requested') {
    status = <p className="mt-2 text-muted-foreground">Not answered — the conversation moved on.</p>;
  } else if (part.state === 'approval-responded') {
    status = (
      <p className="mt-2 text-muted-foreground flex items-center gap-1.5">
        {part.approval?.approved ? (
          <>
            <Icon name="ArrowPathIcon" size={12} variant="outline" className="animate-spin" /> Sending…
          </>
        ) : (
          'Declined'
        )}
      </p>
    );
  } else if (part.state === 'output-available') {
    status = (
      <p className="mt-2 text-success font-600 flex items-center gap-1.5">
        <Icon name="CheckCircleIcon" size={14} variant="solid" />
        {output?.preview ? 'Approved (preview — staff accounts don’t create a real alert)' : 'Sent to the care team'}
      </p>
    );
  } else if (part.state === 'output-denied') {
    status = <p className="mt-2 text-muted-foreground">Not sent — declined.</p>;
  } else if (part.state === 'output-error') {
    status = <p className="mt-2 text-danger">Not sent: {part.errorText}</p>;
  }

  return (
    <div className="rounded-xl border border-border bg-card px-3.5 py-3 text-[12.5px] shadow-sm">
      <div className="flex items-center gap-2 font-600 text-foreground">
        <Icon name="BellAlertIcon" size={15} variant="outline" className="text-primary" />
        {editing ? 'Send this message to the care team? You can edit it first.' : 'Message to the care team'}
      </div>
      {editing ? (
        <textarea
          value={text}
          onChange={(e) => {
            edited.current = true;
            setText(e.target.value);
          }}
          maxLength={1000}
          rows={3}
          className="mt-2 w-full resize-y px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      ) : (
        shown && (
          <p className="mt-1.5 text-secondary-foreground whitespace-pre-wrap break-words">
            “{shown}”{output?.editedByPatient && <span className="text-muted-foreground"> · edited before sending</span>}
          </p>
        )
      )}
      {status}
    </div>
  );
}

function GenericToolCard({ name, part }: { name: string; part: ToolPart }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-secondary-foreground flex items-center gap-2">
      <Icon name="WrenchScrewdriverIcon" size={13} variant="outline" />
      {name} · {part.state}
    </div>
  );
}
