import { z } from 'zod';
import { getVectorStore, type CollectionName } from '../vectorstore/chroma.js';

export const searchHybridSchema = z.object({
  query: z.string().describe('Search query across all LangChain resources'),
  include_docs: z.boolean().default(true).describe('Include documentation in search'),
  include_code: z.boolean().default(true).describe('Include source code in search'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe('Maximum number of results to return'),
  collections: z
    .array(
      z.enum(['docs', 'langchain', 'langchainjs', 'langgraph', 'langgraphjs', 'deepagents', 'deepagentsjs'])
    )
    .optional()
    .describe('Filter by repository/collection'),
});

export type SearchHybridInput = z.infer<typeof searchHybridSchema>;

export async function searchHybrid(input: SearchHybridInput): Promise<string> {
  const vectorStore = await getVectorStore();

  const results = await vectorStore.searchAll(input.query, {
    limit: input.limit,
    includeDocs: input.include_docs,
    includeCode: input.include_code,
    collections: input.collections as CollectionName[] | undefined,
  });

  if (results.length === 0) {
    return 'No results found matching your query.';
  }

  const formatted = results.map((r, i) => {
    const meta = r.metadata;
    const isCode = meta.source === 'source_code';
    const header = `## Result ${i + 1}: ${meta.topic || meta.filePath}`;
    const sourceType = isCode ? 'Code' : 'Documentation';
    const source = `**[${sourceType}]** ${meta.collection} | ${meta.filePath}`;
    const info = isCode
      ? (meta.codeType ? `**Type:** ${meta.codeType}` : '')
      : (meta.product ? `**Product:** ${meta.product}` : '');

    const codeExt = isCode ? (meta.language || '') : 'markdown';
    const contentBlock = `\`\`\`${codeExt}\n${r.content.slice(0, 1500)}\n\`\`\``;

    return [header, source, info, '', contentBlock, ''].filter(Boolean).join('\n');
  });

  return formatted.join('\n---\n\n');
}
