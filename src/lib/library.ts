import { z } from 'zod';
import type { Study } from '../../shared/types';

export type StoredStudy = Omit<Study, 'abstract' | 'keywords'> & { abstract: null; keywords: string[] };
export interface SavedStudy { studyId: string; savedAt: string; metadata: StoredStudy; collectionIds: string[] }
export interface SavedTopic { name: string; savedAt: string }
export interface SavedQuery { text: string; savedAt: string }
export interface Collection { id: string; name: string; createdAt: string }
export interface LibraryData { version: 1; studies: SavedStudy[]; topics: SavedTopic[]; queries: SavedQuery[]; collections: Collection[] }

const text = z.string().refine((s) => s.trim().length > 0);
const timestamp = z.iso.datetime({ offset: true });
const source = z.enum(['openalex', 'crossref']);
const nullableText = z.string().nullable();
const count = z.number().int().nonnegative();
const url = z.string().refine((s) => {
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password;
  } catch { return false; }
});
const publicationDate = z.union([
  z.iso.date(),
  z.string().regex(/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/),
]).nullable();

/** Every field consumed by cards, details, and exports is checked before trusting storage. */
const metadata: z.ZodType<StoredStudy> = z.object({
  id: text,
  title: text,
  authors: z.array(z.object({ name: text, id: url.optional(), orcid: url.optional() })),
  authorCount: count,
  publicationDate,
  publicationYear: z.number().int().min(1).max(9999),
  journal: nullableText,
  publisher: nullableText,
  doi: text.nullable(),
  abstract: z.null(),
  abstractSource: source.nullable(),
  url: url.nullable(),
  urlKind: z.enum(['doi', 'source']).nullable(),
  openAccess: z.object({ isOa: z.boolean().nullable(), status: nullableText, url: url.nullable() }),
  citationCount: count.nullable(),
  citationSource: source.nullable(),
  source,
  sources: z.array(source).min(1),
  sourceId: text,
  openalexId: text.nullable(),
  pmid: text.nullable(),
  topics: z.array(z.object({ id: text.optional(), name: text })),
  keywords: z.array(z.string()),
  type: z.enum(['article', 'review', 'conference-paper', 'preprint', 'dataset', 'other']),
  rawType: nullableText,
  isRetracted: z.boolean(),
  verification: z.object({
    doi: z.enum(['verified', 'not-in-crossref', 'unchecked', 'no-doi']),
    verifiedBy: z.array(source).min(1),
    conflicts: z.array(z.object({
      field: z.enum(['title', 'publication year', 'first author']),
      openalex: z.string(), crossref: z.string(), displayed: source,
    })),
  }),
  matchedQueries: count,
  retrievedAt: timestamp,
});

const savedStudy = z.object({ studyId: text, savedAt: timestamp, metadata, collectionIds: z.array(text) });
const savedTopic = z.object({ name: text, savedAt: timestamp });
const savedQuery = z.object({ text, savedAt: timestamp });
const collection = z.object({ id: text, name: text, createdAt: timestamp });

function validEntries<T>(raw: unknown, schema: z.ZodType<T>, key: (entry: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of Array.isArray(raw) ? raw : []) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) continue;
    const id = key(parsed.data);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(parsed.data);
  }
  return out;
}

/** Read-only recovery: skip malformed entries individually without rewriting the stored library. */
export function sanitizeLibrary(raw: unknown): LibraryData {
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const collections = validEntries(data.collections, collection, (c) => c.id);
  const collectionIds = new Set(collections.map((c) => c.id));
  const studies = validEntries(data.studies, savedStudy, (s) => s.studyId).map((s) => ({
    ...s, collectionIds: [...new Set(s.collectionIds.filter((id) => collectionIds.has(id)))],
  }));
  return {
    version: 1,
    studies,
    topics: validEntries(data.topics, savedTopic, (t) => t.name.trim().toLowerCase()),
    queries: validEntries(data.queries, savedQuery, (q) => q.text.trim().toLowerCase()),
    collections,
  };
}
