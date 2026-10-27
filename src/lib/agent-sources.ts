/**
 * Source line of a rule 3 answer. The model ends the answer with "[sources: 2, 4]" (ref numbers
 * of the searchKnowledge results it used); the app replaces that line with source chips built
 * from the search results, so the organization names never depend on the model.
 * Shared by server and client, so no server-only imports here.
 */

// Usually the last line, but the model sometimes puts it before the closing sentence.
const SOURCES_MARKER = /[ \t]*\[sources?:\s*([\d\s,]*)\][ \t]*/gi;

/** The answer without its "[sources: …]" marker(s), and the refs listed. */
export function splitSources(text: string): { text: string; refs: number[] } {
  const refs: number[] = [];
  const stripped = text.replace(SOURCES_MARKER, (_m, list: string) => {
    for (const r of list.split(',')) {
      const n = Number(r.trim());
      if (Number.isInteger(n) && n > 0 && !refs.includes(n)) refs.push(n);
    }
    return '';
  });
  return refs.length ? { text: stripped.replace(/\n{3,}/g, '\n\n').trimEnd(), refs } : { text, refs };
}

/** "the National Institutes of Health (Eunice Kennedy Shriver …)" → "National Institutes of Health". */
export function displaySource(source: string | null | undefined): string | null {
  if (!source) return null;
  const name = source.replace(/\s*\(.*\)\s*$/, '').replace(/^the\s+/i, '').trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : null;
}
