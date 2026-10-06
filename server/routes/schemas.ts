import { z } from 'zod';
import { config } from '../config.js';

export const providerPref = z.enum(['auto', 'gemini', 'openai']).default('auto');

export const analyzeBody = z.object({
  text: z.string().min(1).max(config.limits.maxInputChars * 2),
  origin: z.enum(['text', 'document']).default('text'),
  useAI: z.boolean().default(true),
  provider: providerPref,
});

const queryString = (max: number) => z.string().trim().min(1).max(max);

export const searchBody = z.object({
  query: queryString(300),
  expandedQueries: z.array(queryString(200)).max(2).default([]),
  concepts: z.array(queryString(100)).max(16).default([]),
  filters: z
    .object({
      yearsBack: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10), z.literal(15), z.literal(25)]).default(10),
      sources: z.array(z.enum(['openalex', 'crossref'])).min(1).max(2).default(['openalex']),
      openAccessOnly: z.boolean().default(false),
      type: z.enum(['any', 'article', 'review', 'conference-paper', 'preprint', 'dataset', 'other']).default('any'),
      sort: z.enum(['relevance', 'newest', 'oldest', 'cited']).default('relevance'),
    })
    .default({ yearsBack: 10, sources: ['openalex'], openAccessOnly: false, type: 'any', sort: 'relevance' }),
  page: z.number().int().min(1).max(20).default(1),
  perPage: z.union([z.literal(10), z.literal(20), z.literal(50)]).default(10),
});

export const summarizeBody = z.object({
  ids: z.array(z.string().max(300)).min(1).max(12),
  topic: z.string().min(1).max(2000),
  provider: providerPref,
});

export const topicCountsBody = z.object({
  names: z.array(queryString(80)).min(1).max(8),
  yearsBack: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(10), z.literal(15), z.literal(25)]).default(10),
});
