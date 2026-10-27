/**
 * Source line of a rule 3 answer. The model ends the answer with "[sources: 2, 4]" (ref numbers
 * of the searchKnowledge results it used); the app replaces that line with source chips built
 * from the search results, so the organization names never depend on the model.
 * Shared by server and client, so no server-only imports here.
 */

const SOURCES_LINE = /\n*\s*\[sources?:\s*([\d\s,]*)\]\s*$/i;

/** The answer without its "[sources: …]" line, and the refs it listed. */
export function splitSources(text: string): { text: string; refs: number[] } {
  const m = SOURCES_LINE.exec(text);
  if (!m) return { text, refs: [] };
  const refs = m[1]
    .split(',')
    .map((r) => Number(r.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return { text: text.slice(0, m.index).trimEnd(), refs };
}

/** "the National Institutes of Health (Eunice Kennedy Shriver …)" → "National Institutes of Health". */
export function displaySource(source: string | null | undefined): string | null {
  if (!source) return null;
  const name = source.replace(/\s*\(.*\)\s*$/, '').replace(/^the\s+/i, '').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}
