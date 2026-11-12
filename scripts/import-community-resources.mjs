#!/usr/bin/env node
/**
 * One-time import of the community resource directory (public.community_resources) from a JSON
 * file. The data file is not kept in this repository.
 *
 *   node --env-file=.env --env-file=.env.local scripts/import-community-resources.mjs <file.json> [--dry-run]
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (service role: writes past RLS).
 *
 * The file is a JSON array of objects whose keys are the table's column names:
 *   name, category (both required), description, phone, text_number, website, address,
 *   area_served, is_free, eligibility, last_verified_on, is_active, source.
 * Strings are trimmed and "" becomes null. Only the keys present in an object are written, so
 * a missing key leaves that column as it is. The ai_* columns are never touched (a changed
 * website clears its old summary through the table's trigger).
 *
 * Rows are matched on category + name (trimmed, case-insensitive), the same as the table's
 * unique index: a match is updated (skipped when nothing differs), anything else is inserted.
 * Nothing is deleted. The whole file is checked before anything is written; any problem stops
 * the import.
 *
 * --dry-run checks the file and prints what would happen; with credentials it also reads the
 * table to count inserts and updates. It never writes.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const CATEGORIES = new Set([
  'emergency_211', 'food_diapers', 'mental_health', 'pregnancy_postpartum', 'parenting', 'child_health',
  'breastfeeding', 'domestic_violence', 'housing', 'financial', 'technology', 'wellness', 'doula',
  'childbirth_classes', 'child_care', 'other',
]);
const TEXT_LIMITS = {
  name: 200, description: 2000, phone: 300, text_number: 300, website: 2000, address: 1000,
  area_served: 300, eligibility: 2000, source: 200,
};
const COLUMNS = [...Object.keys(TEXT_LIMITS), 'category', 'is_free', 'last_verified_on', 'is_active'];
const WEBSITE_RE = /^https?:\/\/[^\s/?#]+\S*$/i;
const BATCH = 50;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Usage: node --env-file=.env --env-file=.env.local scripts/import-community-resources.mjs <file.json> [--dry-run]');
  process.exit(2);
}

const keyOf = (category, name) => `${category}\u0000${name.trim().toLowerCase()}`;

/** A row the table accepts, or a list of problems. */
function clean(raw, i) {
  const problems = [];
  const where = `#${i + 1}${raw && typeof raw.name === 'string' ? ` (${raw.name.trim().slice(0, 60)})` : ''}`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { problems: [`${where}: not an object`] };
  const row = {};
  for (const key of Object.keys(raw)) {
    if (!COLUMNS.includes(key)) problems.push(`${where}: unknown field "${key}"`);
  }
  for (const [key, max] of Object.entries(TEXT_LIMITS)) {
    if (!(key in raw)) continue;
    const v = raw[key];
    if (v !== null && typeof v !== 'string') {
      problems.push(`${where}: ${key} must be text or null`);
      continue;
    }
    const t = (v ?? '').replace(/\r\n?/g, '\n').trim();
    if (t.length > max) problems.push(`${where}: ${key} is ${t.length} characters (max ${max})`);
    row[key] = t === '' ? null : t;
  }
  if (!row.name) problems.push(`${where}: name is required`);
  if (!CATEGORIES.has(raw.category)) problems.push(`${where}: unknown category "${raw.category}"`);
  else row.category = raw.category;
  if (row.website && !WEBSITE_RE.test(row.website)) problems.push(`${where}: website must start with https:// or http://`);
  for (const key of ['is_free', 'is_active']) {
    if (!(key in raw)) continue;
    if (raw[key] !== null && typeof raw[key] !== 'boolean') problems.push(`${where}: ${key} must be true, false or null`);
    else if (key === 'is_active' && raw[key] === null) problems.push(`${where}: is_active cannot be null`);
    else row[key] = raw[key];
  }
  if ('last_verified_on' in raw) {
    const d = raw.last_verified_on;
    if (d !== null && !(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d)))) {
      problems.push(`${where}: last_verified_on must be yyyy-mm-dd or null`);
    } else row.last_verified_on = d;
  }
  return { row, problems };
}

const same = (a, b) => (a ?? null) === (b ?? null);

async function main() {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${file}: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(data)) {
    console.error('The file must contain a JSON array.');
    process.exit(1);
  }

  const rows = [];
  const problems = [];
  const seen = new Map();
  data.forEach((raw, i) => {
    const r = clean(raw, i);
    problems.push(...r.problems);
    if (!r.problems.length) {
      const key = keyOf(r.row.category, r.row.name);
      if (seen.has(key)) problems.push(`#${i + 1} (${r.row.name}): same name and category as #${seen.get(key) + 1}`);
      seen.set(key, i);
      rows.push(r.row);
    }
  });
  if (problems.length) {
    console.error(`${problems.length} problem(s); nothing was written:`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const byCategory = {};
  for (const r of rows) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  console.log(`${rows.length} valid resources in ${file}`);
  for (const [c, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    if (dryRun) {
      console.log('\nDry run without credentials: the table was not read.');
      return;
    }
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (use --env-file=.env --env-file=.env.local).');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const existing = new Map();
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from('community_resources')
      .select(`id, ${COLUMNS.join(', ')}`)
      .order('id')
      .range(from, from + 999);
    if (error) {
      console.error(`Could not read community_resources: ${error.message}`);
      process.exit(1);
    }
    for (const r of page ?? []) existing.set(keyOf(r.category, r.name), r);
    if ((page ?? []).length < 1000) break;
  }

  const inserts = [];
  const updates = [];
  let unchanged = 0;
  for (const row of rows) {
    const old = existing.get(keyOf(row.category, row.name));
    if (!old) inserts.push(row);
    else if (Object.keys(row).some((k) => !same(row[k], old[k]))) updates.push({ id: old.id, row });
    else unchanged++;
  }
  console.log(`\nIn the table now: ${existing.size}. To insert: ${inserts.length}. To update: ${updates.length}. Unchanged: ${unchanged}.`);
  if (dryRun) {
    console.log('Dry run: nothing was written.');
    return;
  }

  let inserted = 0;
  for (let i = 0; i < inserts.length; i += BATCH) {
    const { error } = await supabase.from('community_resources').insert(inserts.slice(i, i + BATCH));
    if (error) {
      console.error(`Insert failed after ${inserted} rows: ${error.message}`);
      process.exit(1);
    }
    inserted += Math.min(BATCH, inserts.length - i);
  }
  let updated = 0;
  for (const { id, row } of updates) {
    const { error } = await supabase.from('community_resources').update(row).eq('id', id);
    if (error) {
      console.error(`Update of "${row.name}" failed after ${updated} updates: ${error.message}`);
      process.exit(1);
    }
    updated++;
  }
  console.log(`Done: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
