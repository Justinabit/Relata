import { config } from '../config.js';
import { AppError } from '../lib/errors.js';
import { TtlCache } from '../lib/cache.js';
import { cleanText, extractKeywords, joinUniqueWords, sha256, truncate } from '../lib/text.js';
import type { AIInfo, AIProviderPreference, AnalyzeResponse, InputKind, TopicAnalysis } from '../../shared/types.js';
import { MAX_CONCEPT_CHARS, MAX_EXPANDED_CHARS, MAX_QUERY_CHARS } from '../../shared/search.js';
import { runStructured, unavailableInfo } from './manager.js';
import { ANALYZE_SYSTEM, buildAnalyzeUser } from './prompts.js';
import { TopicAnalysisSchema } from './schemas.js';

const cache = new TtlCache<{ analysis: TopicAnalysis; ai: AIInfo }>(200, config.retention.analysisCacheSeconds * 1000);

export function classifyInput(text: string, origin: 'text' | 'document'): InputKind {
  if (origin === 'document') return 'document';
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words <= 5 && !text.includes('?')) return 'keyword';
  if (text.length <= 300 && words <= 45) return 'question';
  return 'passage';
}

function tidyQuery(s: string): string {
  return s.replace(/[?!.]+$/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Shortens a search string at a word boundary, without an ellipsis. Text with no spaces (Chinese, Japanese, Thai) is cut hard. */
function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return (cut.replace(/\s+\S*$/, '') || cut).trim();
}

/**
 * Search plan that needs no AI: used directly when AI is off/unavailable and as a base otherwise.
 * Every string fits the /api/search limits, and the primary query is never empty, so a plan can always be searched.
 */
export function deterministicPlan(text: string, kind: InputKind) {
  const head = text.slice(0, 8000);
  const extractedKeywords = extractKeywords(head, 8).map((k) => clip(k, MAX_CONCEPT_CHARS));
  // Text with no usable keywords (only numbers or very short words) still gets searched with its own opening words.
  const fallback = tidyQuery(text).split(' ').slice(0, 10).join(' ');
  if (kind === 'keyword' || kind === 'question') {
    const q = tidyQuery(text);
    const short = q.split(' ').length <= 12;
    return {
      primaryQuery: short ? q : clip(joinUniqueWords(extractedKeywords, 6), MAX_QUERY_CHARS) || fallback,
      expandedQueries: short ? [] : [fallback],
      extractedKeywords,
    };
  }
  return {
    primaryQuery: clip(joinUniqueWords(extractedKeywords, 7), MAX_QUERY_CHARS) || fallback,
    expandedQueries: [clip(joinUniqueWords(extractedKeywords.slice(0, 3), 4), MAX_EXPANDED_CHARS)].filter(Boolean),
    extractedKeywords,
  };
}

export async function analyzeInput(opts: {
  text: string;
  origin: 'text' | 'document';
  useAI: boolean;
  preference: AIProviderPreference;
  signal?: AbortSignal;
}): Promise<AnalyzeResponse> {
  const text = cleanText(opts.text);
  const kind = classifyInput(text, opts.origin);
  const plan = deterministicPlan(text, kind);
  // Input such as "?!" passes the length check but leaves nothing to search for.
  if (!plan.primaryQuery) throw new AppError(400, 'EMPTY_INPUT', 'Enter a topic, question or passage with at least one word to search for.');

  if (!opts.useAI) {
    return { inputKind: kind, plan, analysis: null, ai: { status: 'disabled', message: 'AI analysis was turned off for this search.' }, cache: { hit: false } };
  }

  // Only the leading part of the text is ever sent to an AI provider.
  const aiText = truncate(text, config.ai.maxInputChars);
  const cacheable = opts.origin === 'text' && text.length <= 600; // documents are never cached
  const key = sha256(`${opts.preference}|${aiText}`);
  if (cacheable) {
    const hit = cache.get(key);
    if (hit) return finish(kind, plan, text, hit.value.analysis, hit.value.ai, true);
  }

  try {
    const { data, ai } = await runStructured({
      system: ANALYZE_SYSTEM,
      user: buildAnalyzeUser(aiText, kind === 'document' ? 'document excerpt' : kind === 'passage' ? 'pasted passage' : kind === 'question' ? 'research question or topic' : 'keyword or short phrase'),
      schema: TopicAnalysisSchema,
      maxOutputTokens: 3500,
      preference: opts.preference,
      signal: opts.signal,
    });
    if (cacheable) cache.set(key, { analysis: data, ai });
    return finish(kind, plan, text, data, ai, false);
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    return { inputKind: kind, plan, analysis: null, ai: unavailableInfo(err), cache: { hit: false } };
  }
}

function finish(kind: InputKind, base: ReturnType<typeof deterministicPlan>, text: string, analysis: TopicAnalysis, ai: AIInfo, hit: boolean): AnalyzeResponse {
  const aiQueries = analysis.searchQueries.map(tidyQuery).filter(Boolean);
  const words = text.split(/\s+/).length;
  // The user's own wording is searched first whenever it is a reasonably short query.
  const useOriginal = (kind === 'keyword' || kind === 'question') && words <= 12;
  const primary = useOriginal ? tidyQuery(text) : aiQueries[0] ?? base.primaryQuery;
  const expanded = (useOriginal ? aiQueries : aiQueries.slice(1)).filter((q) => q.toLowerCase() !== primary.toLowerCase()).slice(0, 2);
  return {
    inputKind: kind,
    plan: { primaryQuery: primary, expandedQueries: expanded, extractedKeywords: base.extractedKeywords },
    analysis,
    ai,
    cache: { hit },
  };
}
