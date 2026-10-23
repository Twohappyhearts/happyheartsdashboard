import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { KNOWLEDGE_BUCKET } from '@/lib/server/knowledge';

/** Remove everything stored for these documents: original, parsed Markdown and images. */
export async function removeDocumentFiles(admin: SupabaseClient, docIds: string[]) {
  const bucket = admin.storage.from(KNOWLEDGE_BUCKET);
  for (const id of docIds) {
    const paths: string[] = [];
    for (const folder of [id, `${id}/assets`]) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket.list(folder, { limit: 1000, offset });
        if (error) throw new Error(`Could not list stored files: ${error.message}`);
        const files = (data ?? []).filter((f) => f.id); // folders have no id
        paths.push(...files.map((f) => `${folder}/${f.name}`));
        if ((data ?? []).length < 1000) break;
      }
    }
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await bucket.remove(paths.slice(i, i + 100));
      if (error) throw new Error(`Could not delete stored files: ${error.message}`);
    }
  }
}
