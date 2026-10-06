/**
 * Shared contracts between the Relata API and the web client.
 *
 * Provenance rule: everything in `Study` is bibliographic metadata that came
 * from an external scholarly index (OpenAlex / Crossref). AI-generated content
 * lives in separate structures (`StudyInsight`, `TopicAnalysis`) and is never
 * merged into `Study`.
 */

export type SourceId = 'openalex' | 'crossref';
export type StudyType = 'article' | 'review' | 'conference-paper' | 'preprint' | 'dataset' | 'other';
export type SortKey = 'relevance' | 'newest' | 'oldest' | 'cited';
export type TypeFilter = 'any' | StudyType;
export type YearsBack = 1 | 3 | 5 | 10 | 15 | 25;

export interface Author {
  name: string;
  /** OpenAlex author id URL, only if returned by OpenAlex */
  id?: string;
  /** ORCID URL, only if returned by a source */
  orcid?: string;
}

export interface MetadataConflict {
  field: 'title' | 'publication year' | 'first author';
  openalex: string;
  crossref: string;
  /** Deterministic source-priority rule: Crossref (DOI metadata) is displayed. */
  displayed: SourceId;
}

export type DoiStatus =
  | 'verified' // DOI exists in Crossref and was matched to this record
  | 'not-in-crossref' // DOI supplied by OpenAlex but not found in Crossref (may be another DOI agency)
  | 'unchecked' // Crossref could not be reached
  | 'no-doi'; // the source record has no DOI

export interface Verification {
  doi: DoiStatus;
  verifiedBy: SourceId[];
  conflicts: MetadataConflict[];
}

export interface Study {
  /** Internal id: OpenAlex short id ("W123…") when known, else "cr-" + base64url(doi). */
  id: string;
  title: string;
  authors: Author[];
  /** Total authors reported by the source (authors[] may be truncated). */
  authorCount: number;
  /** ISO date or partial ("2024-05", "2024") exactly as given by the source. Never guessed. */
  publicationDate: string | null;
  publicationYear: number;
  journal: string | null;
  publisher: string | null;
  doi: string | null;
  abstract: string | null;
  abstractSource: SourceId | null;
  /** DOI URL or publisher/landing URL returned by a source. Null when none is available. */
  url: string | null;
  urlKind: 'doi' | 'source' | null;
  openAccess: { isOa: boolean | null; status: string | null; url: string | null };
  citationCount: number | null;
  citationSource: SourceId | null;
  /** First source this record was discovered through. */
  source: SourceId;
  /** Every source whose record was matched to this work. */
  sources: SourceId[];
  sourceId: string;
  openalexId: string | null;
  pmid: string | null;
  topics: { id?: string; name: string }[];
  keywords: string[];
  type: StudyType;
  rawType: string | null;
  isRetracted: boolean;
  verification: Verification;
  /** How many of the search queries retrieved this record (internal "search relevance" signal). */
  matchedQueries: number;
  retrievedAt: string;
}

export interface SearchFilters {
  yearsBack: YearsBack;
  sources: SourceId[];
  openAccessOnly: boolean;
  type: TypeFilter;
  sort: SortKey;
}

export interface ResearchWindow {
  fromYear: number;
  toYear: number;
  years: number;
  label: string;
  /** True when the user explicitly widened the window beyond the default of 10 years. */
  outsideDefault: boolean;
}

export interface SourceReport {
  id: SourceId;
  role: 'discovery' | 'verification' | 'enrichment';
  status: 'ok' | 'error' | 'skipped';
  message?: string;
  resultCount?: number;
  totalMatches?: number;
}

export interface Notice {
  level: 'info' | 'warning';
  code: string;
  message: string;
}

export interface Aggregates {
  themes: { name: string; count: number }[];
  authors: { name: string; count: number; orcid?: string }[];
  types: { type: StudyType; count: number }[];
  openAccessCount: number;
  withAbstractCount: number;
}

export interface GapSignal {
  concept: string;
  matches: number;
  poolSize: number;
  statement: string;
}

export interface GapAnalysis {
  available: boolean;
  reason?: string;
  poolSize: number;
  withAbstract: number;
  signals: GapSignal[];
  disclaimer: string;
}

export interface SearchResponse {
  searchId: string;
  query: string;
  expandedQueries: string[];
  filters: SearchFilters;
  window: ResearchWindow;
  studies: Study[];
  page: number;
  perPage: number;
  hasMore: boolean;
  counts: {
    /** Raw records returned by all source requests, before de-duplication. */
    retrieved: number;
    duplicatesRemoved: number;
    rejected: Record<string, number>;
    /** Verified, de-duplicated, in-window records available for ranking. */
    eligible: number;
    displayed: number;
  };
  sources: SourceReport[];
  crossrefVerification: { checked: number; verified: number; notFound: number; failed: number };
  aggregates: Aggregates;
  gaps: GapAnalysis;
  notices: Notice[];
  cache: { metadata: 'live' | 'cached'; cachedAt: string | null };
  generatedAt: string;
}

// ---------- AI-generated structures (never authoritative metadata) ----------

export interface TopicAnalysis {
  mainTopic: string;
  definition: string;
  simpleExplanation: string;
  academicField: string;
  relatedFields: string[];
  keywords: string[];
  synonyms: string[];
  concepts: { term: string; explanation: string }[];
  relatedTopics: { name: string; definition: string; relevance: string }[];
  researchDirections: string[];
  searchQueries: string[];
}

export type AIStatus = 'ok' | 'unavailable' | 'not_configured' | 'disabled';
export type AIProviderName = 'gemini' | 'openai';
export type AIProviderPreference = 'auto' | AIProviderName;

export interface AIInfo {
  status: AIStatus;
  provider?: AIProviderName;
  /** True when the primary provider failed and the secondary answered. */
  fallbackUsed?: boolean;
  message?: string;
}

export type InputKind = 'keyword' | 'question' | 'passage' | 'document';

export interface AnalyzeResponse {
  inputKind: InputKind;
  /** Deterministic, non-AI search plan. Always present. */
  plan: { primaryQuery: string; expandedQueries: string[]; extractedKeywords: string[] };
  analysis: TopicAnalysis | null;
  ai: AIInfo;
  cache: { hit: boolean };
}

export interface StudyInsight {
  relevance: string | null;
  summary: string | null;
  keyFindings: string[];
  /** What the AI was allowed to read for this study. */
  basis: 'abstract' | 'title-and-topics';
  status: 'ok' | 'insufficient';
  fromCache: boolean;
}

export interface SummarizeResponse {
  insights: Record<string, StudyInsight>;
  ai: AIInfo;
  /** Ids requested that the server no longer holds verified records for. */
  missing: string[];
}

export interface TopicCount {
  name: string;
  works: number | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string; retryAfterSeconds?: number };
}

export interface HealthResponse {
  status: 'ok';
  time: string;
  version: string;
  ai: { gemini: boolean; openai: boolean; primary: AIProviderName; anyConfigured: boolean };
  research: { openalex: { keyConfigured: boolean }; crossref: { enabled: boolean } };
  limits: { maxUploadMb: number; maxExtractedChars: number; maxInputChars: number; aiInputChars: number };
  retention: { uploadedDocuments: 'none'; searchCacheSeconds: number };
  contactEmail: string | null;
}

export interface UploadResponse {
  fileName: string;
  kind: 'pdf' | 'docx' | 'txt' | 'md';
  charCount: number;
  truncated: boolean;
  pageCount: number | null;
  text: string;
}
