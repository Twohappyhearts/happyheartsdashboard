import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Websites the AI assistant's web search is limited to (public.agent_web_domains).
 * Staff manage the list on the Trusted Websites page; the agent reads it on every turn
 * (src/lib/server/agent/web-domains.ts), so a change applies to the next question.
 * A domain covers its subdomains: "acog.org" also allows "www.acog.org".
 * Shared by server and client, so no server-only imports here.
 */

export interface WebDomain {
  id: string;
  domain: string;
  /** Publisher name shown on the source of an answer, e.g. "March of Dimes". */
  label: string;
  active: boolean;
  createdAt: string;
}

/** OpenAI accepts up to 100 allowed domains; we stay well below. */
export const MAX_ACTIVE_WEB_DOMAINS = 50;

const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/**
 * "https://www.ACOG.org/womens-health?x=1" → "acog.org". Null when it is not a domain name.
 * "www." is dropped because a domain already covers its subdomains.
 */
export function cleanDomain(input: string): string | null {
  const d = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^[^/@]*@/, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  return d.length <= 253 && DOMAIN_RE.test(d) ? d : null;
}

export class WebDomainError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

type Row = Record<string, unknown>;

function fail(e: { code?: string; message?: string } | null, fallback: string): WebDomainError {
  if (!e) return new WebDomainError(fallback);
  if (e.code === '42501') return new WebDomainError('Your account does not have staff permission for this.', e.code);
  if (e.code === '23505') return new WebDomainError('This website is already on the list.', e.code);
  if (e.code === '23514') return new WebDomainError('Enter a website address like acog.org, and keep the name under 120 characters.', e.code);
  if (e.code === 'PGRST205' || e.code === '42P01') return new WebDomainError('Run the agent_web_domains migration first.', e.code);
  return new WebDomainError(e.message || fallback, e.code);
}

const COLUMNS = 'id, domain, label, is_active, created_at';

const toDomain = (r: Row): WebDomain => ({
  id: String(r.id),
  domain: String(r.domain ?? ''),
  label: String(r.label ?? ''),
  active: r.is_active === true,
  createdAt: String(r.created_at ?? ''),
});

export async function listWebDomains(supabase: SupabaseClient): Promise<WebDomain[]> {
  const { data, error } = await supabase.from('agent_web_domains').select(COLUMNS).order('domain');
  if (error) throw fail(error, 'Could not load the websites.');
  return ((data as Row[] | null) ?? []).map(toDomain);
}

export async function createWebDomain(supabase: SupabaseClient, input: { domain: string; label: string }): Promise<WebDomain> {
  const domain = cleanDomain(input.domain);
  if (!domain) throw new WebDomainError('Enter a website address like acog.org.');
  const { data, error } = await supabase
    .from('agent_web_domains')
    .insert({ domain, label: input.label.trim() })
    .select(COLUMNS)
    .single();
  if (error) throw fail(error, 'Could not add the website.');
  return toDomain(data as Row);
}

export async function updateWebDomain(
  supabase: SupabaseClient,
  id: string,
  patch: { domain?: string; label?: string; active?: boolean },
): Promise<WebDomain> {
  const row: Row = {};
  if (patch.domain !== undefined) {
    const domain = cleanDomain(patch.domain);
    if (!domain) throw new WebDomainError('Enter a website address like acog.org.');
    row.domain = domain;
  }
  if (patch.label !== undefined) row.label = patch.label.trim();
  if (patch.active !== undefined) row.is_active = patch.active;
  const { data, error } = await supabase.from('agent_web_domains').update(row).eq('id', id).select(COLUMNS).maybeSingle();
  if (error) throw fail(error, 'Could not save the website.');
  if (!data) throw new WebDomainError('This website is no longer on the list. Refresh the page.');
  return toDomain(data as Row);
}

export async function deleteWebDomain(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('agent_web_domains').delete().eq('id', id);
  if (error) throw fail(error, 'Could not remove the website.');
}
