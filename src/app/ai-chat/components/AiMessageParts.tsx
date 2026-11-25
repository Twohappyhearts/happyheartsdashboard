'use client';

import React, { useMemo, useState } from 'react';
import MarkdownIt, { type StateCore, type Token } from 'markdown-it';
import { getToolName, isToolUIPart, type UIMessage } from 'ai';
import Icon from '@/components/ui/AppIcon';
import {
  asciiDigits,
  fixedReply,
  fixedReplySituation,
  isCareteamSituation,
  isEmergencySituation,
  type CareteamSituation,
} from '@/lib/agent-fixed-replies';
import { displaySource, splitSources } from '@/lib/agent-sources';
import { usePatientText } from '@/lib/i18n/patient-context';

// html: false → any HTML in model output is escaped, never injected.
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  // Web links open outside the chat; tel: links go to the phone's dialer.
  if (/^https?:/i.test(tokens[idx].attrGet('href') ?? '')) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return self.renderToken(tokens, idx, options);
};
md.core.ruler.push('tel_links', telLinks);
md.core.ruler.push('untrusted_links', untrustedLinksToText);

/** What md.render gets per answer: the hosts its web links may point to (see linkableHosts). */
interface RenderEnv {
  linkableHosts: string[];
}

// Phone numbers in answers become tel: links (also in Persian / Arabic-Indic digits):
// - US numbers: 714-479-8868, (714) 479-8868, 714.479.8868, 714 479 8868, optionally after "1-"
//   or "+1"; dialed as tel:+1 and the 10 digits;
// - the short numbers 911, 988 and 211, dialed as written.
// Not blood pressure (162/112), dates (11/12/2026), ranges (25-35), ZIP codes, years, digits in
// links, or a street number such as "211 W Chestnut Ave". No lookbehind: older iOS WebViews do
// not support it, so the character before a number is matched (group 1) instead.
const DIGIT = '0-9\\u06F0-\\u06F9\\u0660-\\u0669';
const D = `[${DIGIT}]`;
const D2_9 = '[2-9\\u06F2-\\u06F9\\u0662-\\u0669]';
const ONE = '[1\\u06F1\\u0661]';
const US_NUMBER =
  `(?:\\+?${ONE}(?:[-. ]|(?=\\()))?(?:\\(${D2_9}${D}{2}\\) ?|${D2_9}${D}{2}[-. ])${D2_9}${D}{2}[-. ]${D}{4}` +
  `(?![${DIGIT}\\w]|[-.][${DIGIT}])`;
const STREET = `\\s+(?:[NSEW]\\.?\\s|[A-Z][a-z]+\\s+(?:St|Ave|Blvd|Rd|Dr|Way|Ln)\\b)`;
const SHORT_NUMBER = `${D}{3}(?![${DIGIT}\\w]|[-/.,:][${DIGIT}]|${STREET})`;
const PHONE = new RegExp(`(^|[^${DIGIT}\\w#+\\-./,:])(${US_NUMBER}|${SHORT_NUMBER})`, 'g');
const SHORT_NUMBERS = new Set(['911', '988', '211']);

/** The tel: link of a matched number, or null for a 3-digit number that is not a short number. */
function telHref(raw: string): string | null {
  const digits = asciiDigits(raw).replace(/[^0-9]/g, '');
  if (digits.length === 3) return SHORT_NUMBERS.has(digits) ? `tel:${digits}` : null;
  return `tel:+1${digits.slice(-10)}`;
}

function textToken(state: StateCore, content: string): Token {
  const t = new state.Token('text', '', 0);
  t.content = content;
  return t;
}

function telLinks(state: StateCore) {
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    const out: Token[] = [];
    let insideLink = 0;
    for (const tok of block.children) {
      if (tok.type === 'link_open') insideLink++;
      else if (tok.type === 'link_close') insideLink--;
      if (tok.type !== 'text' || insideLink > 0) {
        out.push(tok);
        continue;
      }
      const text = tok.content;
      let last = 0;
      PHONE.lastIndex = 0;
      for (let m = PHONE.exec(text); m; m = PHONE.exec(text)) {
        const start = m.index + m[1].length;
        const raw = m[2];
        const href = telHref(raw);
        if (!href) continue;
        if (start > last) out.push(textToken(state, text.slice(last, start)));
        const open = new state.Token('link_open', 'a', 1);
        open.attrs = [
          ['href', href],
          ['dir', 'ltr'],
          ['class', 'font-700 underline underline-offset-2 whitespace-nowrap'],
        ];
        out.push(open, textToken(state, raw), new state.Token('link_close', 'a', -1));
        last = start + raw.length;
      }
      if (last === 0) out.push(tok);
      else if (last < text.length) out.push(textToken(state, text.slice(last)));
    }
    block.children = out;
  }
}

/** The link's host is one of the hosts, or a subdomain of one. */
function hostAllowed(href: string, hosts: string[]): boolean {
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase();
  } catch {
    return false;
  }
  return hosts.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Web links (written by the model or made from a bare address) stay clickable only when they
 * point to a host from this answer's own search results; any other link shows as plain text.
 * tel: links are not affected.
 */
function untrustedLinksToText(state: StateCore) {
  const hosts = (state.env as Partial<RenderEnv> | undefined)?.linkableHosts ?? [];
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue;
    const out: Token[] = [];
    const dropped: boolean[] = [];
    for (const tok of block.children) {
      if (tok.type === 'link_open') {
        const href = tok.attrGet('href') ?? '';
        const drop = /^https?:/i.test(href) && !hostAllowed(href, hosts);
        dropped.push(drop);
        if (drop) continue;
      } else if (tok.type === 'link_close' && dropped.pop()) {
        continue;
      }
      out.push(tok);
    }
    block.children = out;
  }
}

type Part = UIMessage['parts'][number];
type ToolPart = Extract<Part, { toolCallId: string }>;

interface Props {
  message: UIMessage;
  streaming: boolean;
  /** Open the original file of a knowledge-base source that has no web page. */
  onOpenDocument?: (documentId: string) => Promise<void>;
}

const SEARCH_TOOLS = new Set(['searchKnowledge', 'webSearch']);
/**
 * The care-team offer the assistant made until 2026-11-23 (removed: requests go through the
 * app's side menu). Older replies still contain it: it is not shown, but its situation still
 * marks an emergency reply, and a reply that was only an offer shows its fixed reply.
 */
const OLD_CARETEAM_TOOL = 'notifyCareteam';
const isRunning = (p: ToolPart) => p.state === 'input-streaming' || p.state === 'input-available';

/** "911" (or "۹۱۱") appears as a number of its own. */
const mentions = (text: string, number: string) => new RegExp(`(^|\\D)${number}(\\D|$)`).test(asciiDigits(text));

const EMERGENCY_RANK: Record<CareteamSituation, number> = { personal: 0, urgent: 1, crisis: 2, crisis_other: 2 };

/**
 * The emergency (rule 1) a reply is about, from the fixed reply in its text (or, in older
 * replies, from their care-team offer), and the language of the reply (for the fixed-reply fallback).
 */
function emergencyOf(message: UIMessage): { situation: CareteamSituation; language: string } | null {
  let situation: CareteamSituation | null = null;
  let language = 'en';
  for (const p of message.parts) {
    if (!isToolUIPart(p) || getToolName(p) !== OLD_CARETEAM_TOOL) continue;
    const input = (p.input as { situation?: unknown; language?: unknown } | undefined) ?? {};
    if (isEmergencySituation(input.situation) && (!situation || EMERGENCY_RANK[input.situation] > EMERGENCY_RANK[situation])) {
      situation = input.situation;
      if (typeof input.language === 'string') language = input.language;
    }
  }
  const fromText = fixedReplySituation(textOf(message));
  if (isEmergencySituation(fromText) && (!situation || EMERGENCY_RANK[fromText] > EMERGENCY_RANK[situation])) situation = fromText;
  return situation ? { situation, language } : null;
}

const textOf = (message: UIMessage) =>
  message.parts
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .map((p) => splitSources(p.text).text)
    .join('\n\n')
    .trim();

export default function AiMessageParts({
  message,
  streaming,
  onOpenDocument,
}: Props) {
  const searchResults = useMemo(() => collectSearchResults(message), [message]);
  const hosts = useMemo(() => linkableHosts(message), [message]);
  const emergency = useMemo(() => emergencyOf(message), [message]);

  // Staff see how the assistant worked (reasoning, searches).
  const workPart = (part: Part, i: number) => {
    if (part.type === 'reasoning') {
      return part.text.trim() ? <Reasoning key={`r-${i}`} text={part.text} active={streaming && i === message.parts.length - 1} /> : null;
    }
    if (!isToolUIPart(part)) return null;
    const name = getToolName(part);
    if (SEARCH_TOOLS.has(name)) return <SearchCard key={part.toolCallId} part={part as ToolPart} web={name === 'webSearch'} />;
    if (name === OLD_CARETEAM_TOOL) return null;
    return <GenericToolCard key={part.toolCallId} name={name} part={part as ToolPart} />;
  };

  const tools = message.parts.filter(isToolUIPart) as ToolPart[];
  const careteamParts = tools.filter((p) => getToolName(p) === OLD_CARETEAM_TOOL);

  // ---- Emergency (rule 1): the reply in a red box with call buttons.
  if (emergency) {
    const body = textOf(message);
    // Once the turn ended, make sure the 911 / 988 reply is there whatever the model wrote;
    // show the fixed reply if not.
    const complete = careteamParts.length > 0 || !streaming;
    const crisis = emergency.situation !== 'urgent';
    const missing = complete && (!mentions(body, '911') || (crisis && !mentions(body, '988')));
    const text = missing ? [body, fixedReply(emergency.situation, emergency.language)].filter(Boolean).join('\n\n') : body;
    return (
      <div className="space-y-2">
        {message.parts.map(workPart)}
        {text && <EmergencyReply text={text} crisis={crisis} linkableHosts={hosts} />}
      </div>
    );
  }

  let hasText = false;
  const rendered = message.parts.map((part, i) => {
    if (part.type === 'text') {
      if (!part.text.trim()) return null;
      hasText = true;
      const { text, refs } = splitSources(part.text);
      return (
        <React.Fragment key={`t-${i}`}>
          {text.trim() && <Markdown text={text} linkableHosts={hosts} />}
          {refs.length > 0 && <SourceChips refs={refs} results={searchResults} onOpenDocument={onOpenDocument} />}
        </React.Fragment>
      );
    }
    return workPart(part, i);
  });

  // An older reply that was only a care-team offer, with no text: show its fixed reply (the
  // referral) from code so the message is not empty.
  const first = careteamParts[0]?.input as { situation?: unknown; language?: unknown } | undefined;
  const fallback =
    !hasText && !streaming && first && isCareteamSituation(first.situation)
      ? fixedReply(first.situation, typeof first.language === 'string' ? first.language : 'en')
      : null;

  return (
    <div className="space-y-2">
      {rendered}
      {fallback && <Markdown text={fallback} linkableHosts={hosts} />}
    </div>
  );
}

interface SearchResult {
  ref?: number;
  title: string;
  source?: string | null;
  url?: string | null;
  /** "web" for webSearch results. */
  kind?: 'web';
  /** Knowledge-base document (its original file opens through /api/agent/sources/:id). */
  documentId?: string;
  /** The community resource directory: used for the answer, but not listed as a source. */
  hideAsSource?: boolean;
}

/** ref → search result, over every searchKnowledge / webSearch call in this reply (refs are shared). */
function collectSearchResults(message: UIMessage): Map<number, SearchResult> {
  const byRef = new Map<number, SearchResult>();
  for (const part of message.parts) {
    if (!isToolUIPart(part) || !SEARCH_TOOLS.has(getToolName(part)) || part.state !== 'output-available') continue;
    for (const r of (part.output as { results?: SearchResult[] } | undefined)?.results ?? []) {
      if (typeof r.ref === 'number') byRef.set(r.ref, r);
    }
  }
  return byRef;
}

/** Web addresses written in a passage (with http:// or https://). */
const URL_IN_TEXT = /https?:\/\/[^\s<>()[\]{}"'`]+/gi;

/**
 * Hosts the answer's web links may point to: the page of each webSearch result, and any web
 * address written in a searchKnowledge result (for example a program's website in the community
 * resources directory). Addresses quoted inside a web page's excerpt do not count. "www." is
 * dropped, so www.example.org also allows example.org and its other subdomains.
 */
function linkableHosts(message: UIMessage): string[] {
  const hosts = new Set<string>();
  const add = (url: string | null | undefined) => {
    if (!url) return;
    try {
      // A sentence may end right after an address ("… at https://example.org.").
      hosts.add(new URL(url.replace(/[.,;:!?]+$/, '')).hostname.toLowerCase().replace(/^www\./, ''));
    } catch {
      // not a full web address
    }
  };
  for (const part of message.parts) {
    if (!isToolUIPart(part) || part.state !== 'output-available') continue;
    const name = getToolName(part);
    const results = (part.output as { results?: Array<{ url?: string | null; content?: string }> } | undefined)?.results ?? [];
    for (const r of results) {
      if (name === 'webSearch') add(r.url);
      else if (name === 'searchKnowledge') for (const url of String(r.content ?? '').match(URL_IN_TEXT) ?? []) add(url);
    }
  }
  return [...hosts];
}

/**
 * The documents the answer cited, folded into one "Sources (n)" line; the reader opens it to
 * see them. One entry per document: organization · title, linking to the original page, or for
 * a library document without one, opening its original file.
 * Web results get a globe icon so the reader can tell a website from the Happy Hearts library.
 */
function SourceChips({
  refs,
  results,
  onOpenDocument,
}: {
  refs: number[];
  results: Map<number, SearchResult>;
  onOpenDocument?: (documentId: string) => Promise<void>;
}) {
  const { t } = usePatientText();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const docs = new Map<string, SearchResult>();
  for (const ref of refs) {
    const r = results.get(ref);
    if (!r || r.hideAsSource) continue;
    const key = r.kind === 'web' && r.url ? r.url : r.title;
    if (!docs.has(key)) docs.set(key, r);
  }
  // Nothing to list (e.g. only the resource directory was cited): no "Sources" line at all.
  if (!docs.size) return null;

  const openDocument = async (key: string, documentId: string) => {
    if (!onOpenDocument || opening) return;
    setOpening(key);
    setFailed(null);
    try {
      await onOpenDocument(documentId);
    } catch {
      setFailed(key);
    } finally {
      setOpening(null);
    }
  };

  return (
    <div className="text-[13px]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-600 text-blue-600 hover:bg-blue-100"
      >
        <Icon name="BookOpenIcon" size={14} variant="outline" className="shrink-0" />
        {t.sources(docs.size)}
        <Icon name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={13} variant="outline" className="shrink-0" />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1">
          {Array.from(docs.entries()).map(([key, d]) => {
            const label = [displaySource(d.source), d.title].filter(Boolean).join(' · ');
            const row = 'w-full flex items-start gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-start text-foreground';
            const icon = (
              <Icon
                name={opening === key ? 'ArrowPathIcon' : d.kind === 'web' ? 'GlobeAltIcon' : 'DocumentTextIcon'}
                size={14}
                variant="outline"
                className={`shrink-0 mt-[2px] text-blue-500 ${opening === key ? 'animate-spin' : ''}`}
              />
            );
            return (
              <li key={key}>
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className={`${row} hover:bg-muted`}>
                    {icon}
                    <span className="min-w-0 break-words">{label}</span>
                  </a>
                ) : d.documentId && onOpenDocument ? (
                  <button type="button" onClick={() => void openDocument(key, d.documentId!)} className={`${row} hover:bg-muted`}>
                    {icon}
                    <span className="min-w-0 break-words">{label}</span>
                  </button>
                ) : (
                  <span className={row}>
                    {icon}
                    <span className="min-w-0 break-words">{label}</span>
                  </span>
                )}
                {failed === key && <p className="mt-0.5 ps-1 text-[12px] text-danger">{t.openSourceError}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Markdown({ text, linkableHosts }: { text: string; linkableHosts: string[] }) {
  const html = useMemo(() => md.render(text, { linkableHosts } satisfies RenderEnv), [text, linkableHosts]);
  return (
    <div
      // The answer's own direction (e.g. a Farsi answer while the app is in English).
      dir="auto"
      className="prose prose-sm max-w-none text-[13.5px] leading-relaxed text-foreground prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Rule 1 replies: hard to miss, with buttons that call 911 (and 988 for thoughts of self-harm). */
function EmergencyReply({ text, crisis, linkableHosts }: { text: string; crisis: boolean; linkableHosts: string[] }) {
  const { t } = usePatientText();
  const call = (number: string, primary: boolean) => (
    <a
      href={`tel:${number}`}
      className={`inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-[15px] font-700 ${
        primary ? 'bg-danger text-white' : 'border-2 border-danger text-danger bg-card'
      }`}
    >
      <Icon name="PhoneIcon" size={17} variant="solid" className="shrink-0" />
      <span>{t.call(number)}</span>
    </a>
  );
  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50 px-3.5 py-3">
      <div className="flex items-start gap-2">
        <Icon name="ExclamationTriangleIcon" size={20} variant="solid" className="text-danger shrink-0 mt-1" />
        <div className="min-w-0 flex-1 font-500">
          <Markdown text={text} linkableHosts={linkableHosts} />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {call('911', true)}
        {crisis && call('988', false)}
      </div>
    </div>
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
  results?: { chunkId: string; title: string; section?: string; source?: string | null; url?: string | null; content: string }[];
}

function SearchCard({ part, web = false }: { part: ToolPart; web?: boolean }) {
  const [open, setOpen] = useState(false);
  const query = (part.input as { query?: string } | undefined)?.query ?? '';
  const results = part.state === 'output-available' ? ((part.output as SearchOutput)?.results ?? []) : [];
  const running = isRunning(part);

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px]">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-2 text-left text-secondary-foreground" disabled={running || results.length === 0}>
        <Icon
          name={running ? 'ArrowPathIcon' : web ? 'GlobeAltIcon' : 'MagnifyingGlassIcon'}
          size={13}
          variant="outline"
          className={`shrink-0 ${running ? 'animate-spin' : ''}`}
        />
        <span className="flex-1 truncate">
          {web
            ? running
              ? 'Searching trusted websites'
              : 'Searched trusted websites'
            : running
              ? 'Searching the knowledge base'
              : 'Searched the knowledge base'}
          {query && <span className="text-muted-foreground"> · “{query}”</span>}
        </span>
        {part.state === 'output-available' && (
          <span className="text-muted-foreground shrink-0">
            {results.length} result{results.length === 1 ? '' : 's'}
          </span>
        )}
        {part.state === 'output-error' && <span className="text-danger shrink-0">failed</span>}
        {results.length > 0 && (
          <Icon name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={12} variant="outline" className="shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && results.length > 0 && (
        <ul className="mt-2 space-y-2 pl-5">
          {results.map((r) => (
            <li key={r.chunkId}>
              <p className="font-600 text-foreground">
                {web && r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {r.title}
                  </a>
                ) : (
                  r.title
                )}
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

function GenericToolCard({ name, part }: { name: string; part: ToolPart }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-secondary-foreground flex items-center gap-2">
      <Icon name="WrenchScrewdriverIcon" size={13} variant="outline" />
      {name} · {part.state}
    </div>
  );
}
