import { z } from 'zod';
import { getVectorStore, type CollectionName, type Language } from '../vectorstore/chroma.js';

export const searchDocsSchema = z.object({
  query: z.string().describe('Natural language search query'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Maximum number of results to return'),
  product: z
    .enum(['langsmith', 'langchain', 'langgraph', 'deepagents', 'oss'])
    .optional()
    .describe('Filter by product area (extracted from doc path)'),
  language: z
    .enum(['python', 'javascript'])
    .optional()
    .describe('Filter by programming language (python or javascript). Filters docs by language metadata.'),
});

export type SearchDocsInput = z.infer<typeof searchDocsSchema>;

export async function searchDocs(input: SearchDocsInput): Promise<string> {
  const vectorStore = await getVectorStore();

  // Docs are in a single collection, use language as metadata filter
  const results = await vectorStore.searchDocs(input.query, {
    limit: input.limit,
    product: input.product,
    language: input.language as Language | undefined,
    collections: ['docs'],  // Docs are always in 'docs' collection
  });

  if (results.length === 0) {
    return 'No documentation found matching your query.';
  }

  const formatted = results.map((r, i) => {
    const meta = r.metadata;
    const header = `## Result ${i + 1}: ${meta.topic || meta.filePath}`;
    const source = `**Source:** ${meta.collection} | ${meta.filePath}`;
    const product = meta.product ? `**Product:** ${meta.product}` : '';

    return [header, source, product, '', '```', r.content.slice(0, 1500), '```', ''].filter(Boolean).join('\n');
  });

  return formatted.join('\n---\n\n');
}
