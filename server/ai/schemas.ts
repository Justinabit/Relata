import { z } from 'zod';
import { cleanAIString, hasForbiddenReference } from './guard.js';

const clean = (max: number) => z.string().transform((s) => cleanAIString(s, max));
/** A required string that must be non-empty and must not contain links, DOIs or citation-like text. */
const core = (min: number, max: number) =>
  clean(max).refine((s) => s.length >= min, 'too short').refine((s) => !hasForbiddenReference(s), 'contains reference-like text');
/** Optional list entries that fail the guard are dropped instead of failing the whole response. */
const softList = <T>(item: z.ZodType<T | null>, max: number) =>
  z.array(z.unknown()).transform((arr) => {
    const out: T[] = [];
    for (const raw of arr) {
      const r = item.safeParse(raw);
      if (r.success && r.data !== null) out.push(r.data);
      if (out.length >= max) break;
    }
    return out;
  });
const softString = (max: number) =>
  z.unknown().transform((v) => {
    if (typeof v !== 'string') return null;
    const s = cleanAIString(v, max);
    return s && !hasForbiddenReference(s) ? s : null;
  });

export const TopicAnalysisSchema = z.object({
  mainTopic: core(2, 140),
  definition: core(20, 700),
  simpleExplanation: core(20, 600),
  academicField: clean(100).refine((s) => !hasForbiddenReference(s)).catch(''),
  relatedFields: softList<string>(softString(80), 6).catch([]),
  keywords: softList<string>(softString(80), 12).refine((a) => a.length >= 1, 'needs keywords'),
  synonyms: softList<string>(softString(80), 10).catch([]),
  concepts: softList(
    z.object({ term: softString(80), explanation: softString(320) }).transform((c) => (c.term && c.explanation ? { term: c.term, explanation: c.explanation } : null)),
    8,
  ).catch([]),
  relatedTopics: softList(
    z
      .object({ name: softString(80), definition: softString(320), relevance: softString(320) })
      .transform((t) => (t.name && t.definition && t.relevance ? { name: t.name, definition: t.definition, relevance: t.relevance } : null)),
    8,
  ).catch([]),
  researchDirections: softList<string>(softString(260), 6).catch([]),
  searchQueries: softList<string>(
    softString(140).transform((s) => (s && s.split(' ').length >= 1 && !/\b(AND|OR|NOT)\b|["()]/.test(s) ? s : null)),
    5,
  ).refine((a) => a.length >= 1, 'needs search queries'),
});

export const TopicAnalysisJsonHint = `{
  "mainTopic": "string, 2-8 words naming the central topic",
  "definition": "string, 1-2 sentences, a conservative generic definition of the main topic",
  "simpleExplanation": "string, 1-2 plain-language sentences for a student",
  "academicField": "string, e.g. Educational Technology",
  "relatedFields": ["up to 6 academic fields"],
  "keywords": ["5-10 research keywords or short phrases"],
  "synonyms": ["up to 8 alternative academic terms"],
  "concepts": [{"term": "string", "explanation": "one plain sentence"}],
  "relatedTopics": [{"name": "string", "definition": "one sentence", "relevance": "one sentence on how it relates to the input"}],
  "researchDirections": ["up to 5 possible research questions or directions, phrased as suggestions"],
  "searchQueries": ["3-5 academic search strings, 2-7 words each, plain words only"]
}`;

export const SummarizeSchema = z.object({
  items: z.array(
    z.object({
      ref: z.string().max(20),
      relevance: z.unknown().optional(),
      summary: z.unknown().optional(),
      keyFindings: z.unknown().optional(),
    }),
  ),
});
export type SummarizeOutput = z.infer<typeof SummarizeSchema>;
