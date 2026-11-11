import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_ATTACHMENTS } from '@/lib/uploads';

/**
 * Staff side of education content (public.content_items) and its categories
 * (public.content_categories). Patients only ever see rows with is_active=true
 * (enforced by RLS), so toggling "Active" here hides/shows content in the app.
 * group_id / group_number / created_* / updated_* are set by the database.
 */

export type ContentKind = 'session' | 'resource';

export interface ContentCategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  usageCount: number;
}

/** A link in a lesson's References block. */
export interface ReferenceLink {
  title: string;
  url: string;
}

export const MAX_REFERENCE_LINKS = 30;

/**
 * A file staff uploaded to the lesson's Materials list (bucket "lesson-materials").
 * Stored in content_items.attachments as {name, url, kind, size_bytes}; at most 20.
 */
export interface LessonAttachment {
  /** Shown to patients; the original file name unless staff renamed it. */
  name: string;
  url: string;
  kind: 'image' | 'pdf';
  sizeBytes: number | null;
}

export interface ContentItem {
  id: string;
  kind: ContentKind;
  title: string;
  description: string;
  categoryId: string | null;
  categoryName: string | null;
  videoUrl: string;
  audioUrl: string;
  thumbnailUrl: string;
  thumbnailAlt: string;
  infographicUrl: string;
  quizUrl: string;
  script: string;
  videoDuration: string;
  audioDuration: string;
  groupId: string;
  groupNumber: number;
  groupName: string;
  tags: string[];
  /** Links staff added to the References block (the lesson's own links are added by the app). */
  references: ReferenceLink[];
  /** Images and PDFs uploaded for the lesson (Materials). */
  attachments: LessonAttachment[];
  active: boolean;
  updatedAt: string;
}

/** Fields staff can edit (everything else is assigned by the database). */
export type ContentInput = Pick<
  ContentItem,
  | 'title'
  | 'description'
  | 'categoryId'
  | 'videoUrl'
  | 'audioUrl'
  | 'thumbnailUrl'
  | 'thumbnailAlt'
  | 'infographicUrl'
  | 'quizUrl'
  | 'script'
  | 'videoDuration'
  | 'audioDuration'
  | 'groupName'
  | 'tags'
  | 'references'
  | 'attachments'
  | 'active'
>;

export class ContentError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

const COLUMNS =
  'id, kind, title, description, category_id, video_url, audio_url, thumbnail_url, thumbnail_alt, ' +
  'infographic_url, quiz_url, script_html, video_duration, audio_duration, group_id, group_number, ' +
  'group_name, tags, reference_links, attachments, is_active, updated_at, category:content_categories(name)';

type Row = Record<string, unknown>;

function toReferences(v: unknown): ReferenceLink[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((r) => ({ title: String((r as Row | null)?.title ?? '').trim(), url: String((r as Row | null)?.url ?? '').trim() }))
    .filter((r) => r.url);
}

function toAttachments(v: unknown): LessonAttachment[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((a) => {
      const r = (a ?? {}) as Row;
      const size = Number(r.size_bytes);
      return {
        name: String(r.name ?? '').trim(),
        url: String(r.url ?? '').trim(),
        kind: r.kind === 'pdf' ? ('pdf' as const) : ('image' as const),
        sizeBytes: r.size_bytes == null || !Number.isFinite(size) ? null : size,
      };
    })
    .filter((a) => a.url);
}

const HREF = /<a\b[^>]*\bhref\s*=\s*["'](https:\/\/[^"'\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const decode = (t: string) =>
  t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/**
 * The lesson's own links, which the app lists in the References block before the ones staff
 * added: the video, the audio and every link in the lesson notes. Keep in step with
 * lessonReferences() in the app (lib/services/content_service.dart).
 */
export function lessonOwnReferences(item: Pick<ContentItem, 'videoUrl' | 'audioUrl' | 'script'>): ReferenceLink[] {
  const out: ReferenceLink[] = [];
  if (item.videoUrl.trim()) out.push({ title: 'Lesson video', url: item.videoUrl.trim() });
  if (item.audioUrl.trim()) out.push({ title: 'Lesson audio', url: item.audioUrl.trim() });
  for (const m of item.script.matchAll(HREF)) {
    const url = decode(m[1]);
    const text = decode(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
    out.push({ title: text && text !== url ? text : '', url });
  }
  return dedupeReferences(out);
}

/** Every link to an uploaded file the lesson uses (thumbnail, infographic, materials). */
export function lessonFileUrls(item: Pick<ContentItem, 'thumbnailUrl' | 'infographicUrl' | 'attachments'>): string[] {
  return [item.thumbnailUrl, item.infographicUrl, ...item.attachments.map((a) => a.url)].filter(Boolean);
}

/** First mention of each link wins. */
export function dedupeReferences(links: ReferenceLink[]): ReferenceLink[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const key = l.url.replace(/\/+$/, '').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toItem(r: Row): ContentItem {
  const cat = (Array.isArray(r.category) ? r.category[0] : r.category) as Row | null;
  return {
    id: String(r.id),
    kind: r.kind === 'resource' ? 'resource' : 'session',
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    categoryId: (r.category_id as string | null) ?? null,
    categoryName: (cat?.name as string | undefined) ?? null,
    videoUrl: (r.video_url as string | null) ?? '',
    audioUrl: (r.audio_url as string | null) ?? '',
    thumbnailUrl: (r.thumbnail_url as string | null) ?? '',
    thumbnailAlt: (r.thumbnail_alt as string | null) ?? '',
    infographicUrl: (r.infographic_url as string | null) ?? '',
    quizUrl: (r.quiz_url as string | null) ?? '',
    script: (r.script_html as string | null) ?? '',
    videoDuration: (r.video_duration as string | null) ?? '',
    audioDuration: (r.audio_duration as string | null) ?? '',
    groupId: String(r.group_id ?? ''),
    groupNumber: Number(r.group_number ?? 0),
    groupName: String(r.group_name ?? ''),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    references: toReferences(r.reference_links),
    attachments: toAttachments(r.attachments),
    active: r.is_active === true,
    updatedAt: String(r.updated_at ?? ''),
  };
}

const blankToNull = (v: string) => (v.trim() === '' ? null : v.trim());

function toRow(input: ContentInput): Row {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    category_id: input.categoryId || null,
    video_url: blankToNull(input.videoUrl),
    audio_url: blankToNull(input.audioUrl),
    thumbnail_url: blankToNull(input.thumbnailUrl),
    thumbnail_alt: blankToNull(input.thumbnailAlt),
    infographic_url: blankToNull(input.infographicUrl),
    quiz_url: blankToNull(input.quizUrl),
    script_html: input.script,
    video_duration: blankToNull(input.videoDuration),
    audio_duration: blankToNull(input.audioDuration),
    group_name: input.groupName.trim(),
    tags: input.tags,
    reference_links: input.references
      .map((r) => ({ title: r.title.trim(), url: r.url.trim() }))
      .filter((r) => r.url)
      .slice(0, MAX_REFERENCE_LINKS),
    attachments: input.attachments
      .filter((a) => a.url.trim())
      .slice(0, MAX_ATTACHMENTS)
      .map((a) => ({
        name: (a.name.trim() || 'File').slice(0, 200),
        url: a.url.trim(),
        kind: a.kind,
        ...(a.sizeBytes != null ? { size_bytes: a.sizeBytes } : {}),
      })),
    is_active: input.active,
  };
}

function fail(e: { code?: string; message?: string } | null, fallback: string): ContentError {
  if (!e) return new ContentError(fallback);
  if (e.code === '42501') return new ContentError('Your account does not have staff permission for this.', e.code);
  if (e.code === '23514') {
    const m = e.message ?? '';
    if (m.includes('reference_links')) return new ContentError('Every reference needs a link starting with https:// (at most 30 references).', e.code);
    if (m.includes('attachments')) return new ContentError('Every material needs a name and an https:// link (at most 20 files).', e.code);
    if (m.includes('url')) return new ContentError('Every link must start with https://', e.code);
    if (m.includes('duration')) return new ContentError('Durations must look like 5:47 (MM:SS).', e.code);
    return new ContentError('Some fields are too long or in the wrong format.', e.code);
  }
  if (e.code === 'PGRST204' || e.code === '42703') return new ContentError('The database is missing a column. Run the latest migration first.', e.code);
  if (e.code === '23505') return new ContentError('A category with this name already exists.', e.code);
  if (e.code === '23503') {
    return new ContentError('This category is still used by some content. Deactivate it instead.', e.code);
  }
  return new ContentError(`${fallback}${e.message ? `: ${e.message}` : ''}`, e.code);
}

// ---- Content -------------------------------------------------------------------

export async function listContent(supabase: SupabaseClient, kind: ContentKind): Promise<ContentItem[]> {
  const { data, error } = await supabase
    .from('content_items')
    .select(COLUMNS)
    .eq('kind', kind)
    .order('group_number', { ascending: true });
  if (error) throw fail(error, 'Could not load content');
  return ((data ?? []) as unknown as Row[]).map(toItem);
}

export async function createContent(
  supabase: SupabaseClient,
  kind: ContentKind,
  input: ContentInput
): Promise<ContentItem> {
  const { data, error } = await supabase
    .from('content_items')
    .insert({ kind, ...toRow(input) })
    .select(COLUMNS)
    .single();
  if (error) throw fail(error, 'Could not create content');
  return toItem(data as unknown as Row);
}

export async function updateContent(
  supabase: SupabaseClient,
  id: string,
  input: ContentInput
): Promise<ContentItem> {
  const { data, error } = await supabase
    .from('content_items')
    .update(toRow(input))
    .eq('id', id)
    .select(COLUMNS)
    .single();
  if (error) throw fail(error, 'Could not save changes');
  return toItem(data as unknown as Row);
}

export async function setContentActive(supabase: SupabaseClient, id: string, active: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('content_items')
    .update({ is_active: active })
    .eq('id', id)
    .select('id');
  if (error) throw fail(error, 'Could not change visibility');
  if (!data || data.length === 0) throw new ContentError('This content no longer exists. Refresh the page.');
}

export async function deleteContent(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('content_items').delete().eq('id', id);
  if (error) throw fail(error, 'Could not delete content');
}

/** What the database will assign to the next item (shown as a preview only). */
export function previewNextGroupId(kind: ContentKind, items: ContentItem[]): { groupId: string; groupName: string } {
  const next = items.reduce((m, i) => Math.max(m, i.groupNumber), 0) + 1;
  return kind === 'session'
    ? { groupId: `session${next}`, groupName: `Session ${next}` }
    : { groupId: `resource${next}`, groupName: 'Community Resources' };
}

// ---- Categories -----------------------------------------------------------------

export async function listCategories(supabase: SupabaseClient): Promise<ContentCategory[]> {
  const [{ data, error }, usage] = await Promise.all([
    supabase.from('content_categories').select('id, name, sort_order, is_active').order('sort_order').order('name'),
    supabase.from('content_items').select('category_id').not('category_id', 'is', null),
  ]);
  if (error) throw fail(error, 'Could not load categories');
  const counts = new Map<string, number>();
  ((usage.data ?? []) as Row[]).forEach((r) => {
    const id = String(r.category_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    sortOrder: Number(r.sort_order ?? 0),
    isActive: r.is_active === true,
    usageCount: counts.get(String(r.id)) ?? 0,
  }));
}

export async function createCategory(supabase: SupabaseClient, name: string, sortOrder: number): Promise<void> {
  const { error } = await supabase.from('content_categories').insert({ name: name.trim(), sort_order: sortOrder });
  if (error) throw fail(error, 'Could not add category');
}

export async function updateCategory(
  supabase: SupabaseClient,
  id: string,
  patch: { name?: string; sortOrder?: number; isActive?: boolean }
): Promise<void> {
  const row: Row = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  const { error } = await supabase.from('content_categories').update(row).eq('id', id);
  if (error) throw fail(error, 'Could not update category');
}

export async function deleteCategory(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('content_categories').delete().eq('id', id);
  if (error) throw fail(error, 'Could not delete category');
}
