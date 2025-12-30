import { z } from 'zod';
import { getVectorStore, routeToCollection, type CollectionName, type Language, type ProductName } from '../vectorstore/chroma.js';

export const searchCodeSchema = z.object({
  query: z.string().describe('Search query for code'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe('Maximum number of results to return'),
  product: z
    .enum(['langchain', 'langgraph', 'deepagents'])
    .optional()
    .describe('Filter by product (langchain, langgraph, deepagents)'),
  language: z
    .enum(['python', 'javascript'])
    .optional()
    .describe('Filter by programming language (python or javascript). When used with product, routes to the correct repo collection.'),
  code_type: z
    .enum(['function', 'class', 'module'])
    .optional()
    .describe('Filter by code type'),
});

export type SearchCodeInput = z.infer<typeof searchCodeSchema>;

export async function searchCode(input: SearchCodeInput): Promise<string> {
  const vectorStore = await getVectorStore();

  // Route to the correct collection based on product + language
  let collections: CollectionName[] | undefined;
  if (input.product && input.language) {
    // Both specified: route to specific collection
    collections = [routeToCollection(input.product as ProductName, input.language as Language)];
  } else if (input.product) {
    // Only product: search both python and js collections for that product
    collections = [
      input.product as CollectionName,
      `${input.product}js` as CollectionName,
    ];
  } else if (input.language) {
    // Only language: search all collections for that language
    if (input.language === 'python') {
      collections = ['langchain', 'langgraph', 'deepagents'];
    } else {
      collections = ['langchainjs', 'langgraphjs', 'deepagentsjs'];
    }
  }

  const results = await vectorStore.searchCode(input.query, {
    limit: input.limit,
    codeType: input.code_type,
    collections,
  });

  if (results.length === 0) {
    return 'No code found matching your query.';
  }

  const formatted = results.map((r, i) => {
    const meta = r.metadata;
    const header = `## Result ${i + 1}: ${meta.filePath}`;
    const source = `**Source:** ${meta.collection} | ${meta.language || 'unknown'}`;
    const codeType = meta.codeType ? `**Type:** ${meta.codeType}` : '';

    const codeBlock = `\`\`\`${meta.language || ''}\n${r.content.slice(0, 2000)}\n\`\`\``;

    return [header, source, codeType, '', codeBlock, ''].filter(Boolean).join('\n');
  });

  return formatted.join('\n---\n\n');
}
