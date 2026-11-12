import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanDomain, MAX_ACTIVE_WEB_DOMAINS } from '@/lib/web-domains';
import type { AgentConfig } from './config';

/**
 * The trusted websites staff set on the Trusted Websites page (public.agent_web_domains), for web search.
 *
 * Read from the database so a change in the dashboard applies without a deploy; cached for a
 * short time because every agent turn asks. If the table cannot be read, the list from the
 * environment (AGENT_WEB_DOMAINS, or the built-in default) stays in use.
 */

const TTL_MS = 30_000;

type Listed = { domains: string[]; publishers: Record<string, string> };

let cache: { at: number; value: Listed } | null = null;

async function listed(admin: SupabaseClient): Promise<Listed | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const { data, error } = await admin
    .from('agent_web_domains')
    .select('domain, label')
    .eq('is_active', true)
    .order('domain')
    .limit(MAX_ACTIVE_WEB_DOMAINS);
  if (error) {
    console.warn('[agent] could not read agent_web_domains; using the configured list', error.message);
    // A stale list is better than the default one.
    return cache?.value ?? null;
  }
  const value: Listed = { domains: [], publishers: {} };
  for (const row of (data ?? []) as { domain: unknown; label: unknown }[]) {
    const domain = cleanDomain(String(row.domain ?? ''));
    if (!domain || value.domains.includes(domain)) continue;
    value.domains.push(domain);
    const label = String(row.label ?? '').trim();
    if (label) value.publishers[domain] = label;
  }
  cache = { at: Date.now(), value };
  return value;
}

/**
 * cfg with the web-search sites from the database. No active site → web search is off for
 * this turn (the assistant answers from the knowledge base only).
 */
export async function withWebDomains(cfg: AgentConfig, admin: SupabaseClient): Promise<AgentConfig> {
  if (!cfg.webSearch) return cfg;
  const list = await listed(admin);
  if (!list) return cfg;
  if (!list.domains.length) return { ...cfg, webSearch: null };
  return { ...cfg, webSearch: { ...cfg.webSearch, domains: list.domains, publishers: list.publishers } };
}

/** For tests. */
export function clearWebDomainsCache() {
  cache = null;
}
