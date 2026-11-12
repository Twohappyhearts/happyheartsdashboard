import 'server-only';
import { createHash } from 'crypto';
import { en } from '@/lib/i18n/staff/en';
import {
  RESOURCE_CATEGORIES,
  hasCurrentSummary,
  type ArticleEntryProblem,
  type CommunityResource,
} from '@/lib/community-resources';

/**
 * The knowledge article generated from the directory: ONE Markdown document with every active
 * resource, under its category heading (Bo, 2026-11-11). Each entry repeats its category in its
 * own lines, so a chunk that holds only that entry still says what kind of service it is.
 *
 * The text depends only on the directory (no publish date), so publishing an unchanged
 * directory again is recognized by the file's hash.
 */

export const ARTICLE_TITLE = 'Community resources directory';
export const ARTICLE_FILE = 'community-resources.md';
export const ARTICLE_DESCRIPTION =
  'Generated from the community resource directory (dashboard: Content > Community Resources). Publishing there replaces this document; edits made here are lost.';

export const INTRO =
  'This directory of community programs is kept by the Happy Hearts research team; programs, hours and rules can change, so call a program to confirm before you go.';

const CATEGORY_NAMES = en.resources.categories;

/** One line of text: no line breaks, no runs of spaces. */
const line = (s: string) => s.replace(/\s+/g, ' ').trim();

const checkedOn = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' })
    : '';

function entry(r: CommunityResource): string {
  const category = CATEGORY_NAMES[r.category];
  const fields: string[] = [`- Category: ${category}`];
  const add = (label: string, value: string) => {
    if (line(value)) fields.push(`- ${label}: ${line(value)}`);
  };
  add('About', r.description);
  if (hasCurrentSummary(r)) add(`From the organization's website, checked ${checkedOn(r.aiFetchedAt)}`, r.aiSummary);
  add('Phone', r.phone);
  add('Text', r.textNumber);
  add('Website', r.website);
  add('Address', r.address);
  add('Area served', r.areaServed);
  if (r.isFree !== null) add('Cost', r.isFree ? 'Free' : 'Not free (there may be a cost)');
  add('Who can get it', r.eligibility);
  return [`### ${line(r.name).replace(/^#+\s*/, '')}`, '', ...fields].join('\n');
}

export interface Article {
  title: string;
  markdown: string;
  hash: string;
  entryCount: number;
  withSummary: number;
  failed: ArticleEntryProblem[];
  pending: ArticleEntryProblem[];
}

const problem = (r: CommunityResource, error = ''): ArticleEntryProblem => ({
  id: r.id,
  name: r.name,
  category: r.category,
  website: r.website,
  error,
});

export function buildArticle(resources: CommunityResource[]): Article {
  const active = resources.filter((r) => r.active);
  const byName = (a: CommunityResource, b: CommunityResource) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
  const sections: string[] = [];
  for (const code of RESOURCE_CATEGORIES) {
    const list = active.filter((r) => r.category === code).sort(byName);
    if (!list.length) continue;
    sections.push(`## ${CATEGORY_NAMES[code]}`, ...list.map(entry));
  }
  const markdown = [`# ${ARTICLE_TITLE}`, INTRO, ...sections].join('\n\n') + '\n';
  const withWebsite = active.filter((r) => r.website);
  return {
    title: ARTICLE_TITLE,
    markdown,
    hash: articleHash(markdown),
    entryCount: active.length,
    withSummary: active.filter(hasCurrentSummary).length,
    failed: withWebsite.filter((r) => r.aiStatus === 'failed').sort(byName).map((r) => problem(r, r.aiError)),
    pending: withWebsite
      .filter((r) => r.aiStatus === 'pending' || (r.aiStatus === 'ok' && r.aiSourceUrl !== r.website))
      .sort(byName)
      .map((r) => problem(r)),
  };
}

export const articleHash = (markdown: string) => createHash('sha256').update(markdown, 'utf8').digest('hex');
