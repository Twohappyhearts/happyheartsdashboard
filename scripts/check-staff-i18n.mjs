#!/usr/bin/env node
/**
 * Checks that the staff dashboard's Spanish text (src/lib/i18n/staff/es.ts) has exactly the
 * same keys as the English text (en.ts), with the same kind of value (text, list, or function
 * with the same number of arguments). `tsc --noEmit` checks the same through the StaffText
 * type; this script also lists the Spanish entries that are still identical to English.
 *
 *   npm run check:i18n
 *
 * Needs Node 22.18 or newer (loads the .ts files directly).
 */
import { en } from '../src/lib/i18n/staff/en.ts';
import { es } from '../src/lib/i18n/staff/es.ts';

const problems = [];
const same = [];

const kind = (v) => (Array.isArray(v) ? 'list' : v === null ? 'null' : typeof v);

function compare(a, b, path) {
  const ka = kind(a);
  const kb = kind(b);
  if (ka !== kb) {
    problems.push(`${path}: English is ${ka}, Spanish is ${kb}`);
    return;
  }
  if (ka === 'object') {
    for (const key of Object.keys(a)) {
      if (!(key in b)) problems.push(`${path}.${key}: missing in Spanish`);
      else compare(a[key], b[key], `${path}.${key}`);
    }
    for (const key of Object.keys(b)) if (!(key in a)) problems.push(`${path}.${key}: not in English`);
  } else if (ka === 'list') {
    if (a.length !== b.length) problems.push(`${path}: ${a.length} items in English, ${b.length} in Spanish`);
    a.forEach((v, i) => i < b.length && compare(v, b[i], `${path}[${i}]`));
  } else if (ka === 'function') {
    if (a.length !== b.length) problems.push(`${path}: takes ${a.length} argument(s) in English, ${b.length} in Spanish`);
  } else if (ka === 'string' && a === b && /[a-z]{3,}/i.test(a)) {
    same.push(`${path}: ${JSON.stringify(a)}`);
  }
}

compare(en, es, 'staff');

const count = (o) => (kind(o) === 'object' ? Object.values(o).reduce((n, v) => n + count(v), 0) : 1);
console.log(`English entries: ${count(en)}, Spanish entries: ${count(es)}`);
if (same.length) {
  console.log(`\nSame text in both languages (${same.length}; names and technical words are expected here):`);
  for (const line of same) console.log(`  ${line}`);
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const line of problems) console.error(`  ${line}`);
  process.exit(1);
}
console.log('\nKeys match.');
