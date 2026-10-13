import { z } from 'zod';
import { config } from '../config.js';
import { searchFiltersSchema, searchQuerySchema } from '../../shared/search.js';
import { MAX_SEARCH_CONCEPTS } from '../../shared/search.js';

export const providerPref = z.enum(['auto', 'gemini', 'openai']).default('auto');

export const analyzeBody = z.object({
  text: z.string().min(1).max(config.limits.maxInputChars * 2),
  origin: z.enum(['text', 'document']).default('text'),
  useAI: z.boolean().default(true),
  provider: providerPref,
});

const queryString = (max: number) => z.string().trim().min(1).max(max);

export const searchBody = z.object({
  query: searchQuerySchema,
  expandedQueries: z.array(queryString(200)).max(2).default([]),
  concepts: z.array(queryString(100)).max(MAX_SEARCH_CONCEPTS).default([]),
  filters: searchFiltersSchema.default(() => searchFiltersSchema.parse({})),
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
