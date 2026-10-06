import 'dotenv/config';
import type { AIProviderName } from '../shared/types.js';
import { parsePublicUrl } from './spa.js';

const int = (v: string | undefined, d: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};
const str = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

const primary = (str(process.env.PRIMARY_AI_PROVIDER)?.toLowerCase() === 'openai' ? 'openai' : 'gemini') as AIProviderName;

/**
 * All secrets are read here, on the server, from environment variables.
 * Nothing in this object is ever serialised to a client response.
 */
export const config = {
  env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  port: int(process.env.PORT, 8787, 1, 65535),
  trustProxy: process.env.TRUST_PROXY === 'true',
  contactEmail: str(process.env.CONTACT_EMAIL) ?? null,
  /** The site's public address (origin only), for the sitemap, canonical links and share images. */
  publicUrl: parsePublicUrl(process.env.PUBLIC_URL),
  version: '1.0.0',

  openalex: {
    baseUrl: 'https://api.openalex.org',
    apiKey: str(process.env.OPENALEX_API_KEY),
    timeoutMs: int(process.env.OPENALEX_TIMEOUT_MS, 12000, 1000, 60000),
    topicCounts: process.env.OPENALEX_TOPIC_COUNTS !== 'false',
  },
  crossref: {
    baseUrl: 'https://api.crossref.org',
    // Crossref's "polite pool" asks for a contact address; optional.
    mailto: str(process.env.CROSSREF_MAILTO) ?? str(process.env.CONTACT_EMAIL),
    timeoutMs: int(process.env.CROSSREF_TIMEOUT_MS, 15000, 1000, 60000),
  },

  ai: {
    primary,
    timeoutMs: int(process.env.AI_TIMEOUT_MS, 30000, 3000, 120000),
    /** Maximum characters of user/document text ever sent to an AI provider. */
    maxInputChars: int(process.env.AI_MAX_INPUT_CHARS, 6000, 500, 30000),
    gemini: {
      apiKey: str(process.env.GEMINI_API_KEY),
      model: str(process.env.GEMINI_MODEL) ?? 'gemini-2.5-flash',
      baseUrl: 'https://generativelanguage.googleapis.com',
    },
    openai: {
      apiKey: str(process.env.OPENAI_API_KEY),
      model: str(process.env.OPENAI_MODEL) ?? 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com',
    },
  },

  limits: {
    maxUploadBytes: int(process.env.MAX_UPLOAD_MB, 8, 1, 50) * 1024 * 1024,
    maxExtractedChars: int(process.env.MAX_EXTRACTED_CHARS, 60000, 1000, 500000),
    maxPdfPages: int(process.env.MAX_PDF_PAGES, 150, 1, 1000),
    /** Largest text body accepted by /api/analyze. */
    maxInputChars: int(process.env.MAX_INPUT_CHARS, 20000, 500, 200000),
    maxPerPage: 50,
    maxDepthPerQuery: 100,
  },

  rate: {
    // requests per window, per client IP
    windowMs: 60_000,
    search: int(process.env.RATE_LIMIT_SEARCH, 40, 1),
    ai: int(process.env.RATE_LIMIT_AI, 20, 1),
    upload: int(process.env.RATE_LIMIT_UPLOAD, 8, 1),
    general: int(process.env.RATE_LIMIT_GENERAL, 240, 1),
  },

  /**
   * Retention. Uploaded documents are never persisted: they are parsed in memory and discarded
   * when the request ends. These settings only govern in-memory metadata caches.
   */
  retention: {
    searchCacheSeconds: int(process.env.SEARCH_CACHE_SECONDS, 900, 0, 86400),
    crossrefCacheSeconds: int(process.env.CROSSREF_CACHE_SECONDS, 86400, 0, 604800),
    studyStoreSeconds: int(process.env.STUDY_STORE_SECONDS, 3600, 60, 86400),
    analysisCacheSeconds: int(process.env.ANALYSIS_CACHE_SECONDS, 3600, 0, 86400),
    insightCacheSeconds: int(process.env.INSIGHT_CACHE_SECONDS, 21600, 0, 86400),
  },
} as const;

export function aiConfigured(name: AIProviderName): boolean {
  return Boolean(config.ai[name].apiKey);
}
