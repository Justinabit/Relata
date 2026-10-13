import { config } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import { cleanText, sha256, truncate } from '../lib/text.js';
import type { AIInfo, AIProviderPreference, Study, StudyInsight, SummarizeResponse } from '../../shared/types.js';
import { cleanAIString, hasForbiddenReference, numbersGrounded } from './guard.js';
import { runStructured, unavailableInfo } from './manager.js';
import { SUMMARIZE_SYSTEM, buildSummarizeUser, type SourceRecordForAI } from './prompts.js';
import { SummarizeSchema } from './schemas.js';
import { lookupStudy } from '../research/lookup.js';
import { studyStore } from '../research/store.js';

const insightCache = new TtlCache<StudyInsight>(2000, config.retention.insightCacheSeconds * 1000);
const MIN_ABSTRACT = 150;

function sourceText(s: Study): string {
  return [s.title, s.abstract ?? '', s.journal ?? '', s.topics.map((t) => t.name).join(' '), String(s.publicationYear)].join(' ');
}

function textOrNull(v: unknown, max: number, source: string): string | null {
  if (typeof v !== 'string') return null;
  const s = cleanAIString(v, max);
  if (!s || hasForbiddenReference(s)) return null;
  if (!numbersGrounded(s, source)) return null; // no numbers that the source does not contain
  return s;
}

export async function summarizeStudies(opts: {
  ids: string[];
  topic: string;
  preference: AIProviderPreference;
  signal?: AbortSignal;
}): Promise<SummarizeResponse> {
  const topic = truncate(cleanText(opts.topic), 600);
  const topicKey = sha256(topic).slice(0, 16);
  const insights: Record<string, StudyInsight> = {};
  const missing: string[] = [];
  const skipped: string[] = [];
  const pending: { ref: string; study: Study; requestedId: string }[] = [];

  // Bound concurrent recovery so cold instances do not serialize every upstream roundtrip.
  const recovered = new Map<string, Study>();
  const queue = [...new Set(opts.ids)];
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift()!;
      let study = studyStore.get(id)?.value;
      if (!study) {
        try { study = await lookupStudy(id, opts.signal); }
        catch { if (opts.signal?.aborted) throw opts.signal.reason; }
      }
      if (study) recovered.set(id, study);
    }
  }));
  for (const id of opts.ids) {
    const study = recovered.get(id);
    if (!study) {
      missing.push(id);
      continue;
    }
    if (study.isRetracted) { skipped.push(id); continue; }
    const cached = insightCache.get(`${id}|${topicKey}`)?.value;
    if (cached) insights[id] = { ...cached, fromCache: true };
    else pending.push({ ref: `s${pending.length + 1}`, study, requestedId: id });
  }

  let ai: AIInfo = { status: 'ok' };
  if (pending.length) {
    const records: SourceRecordForAI[] = pending.map(({ ref, study }) => ({
      ref,
      title: study.title,
      year: study.publicationYear,
      venue: study.journal,
      topics: study.topics.map((t) => t.name).slice(0, 6),
      abstract: study.abstract && study.abstract.length >= MIN_ABSTRACT ? truncate(study.abstract, 1800) : null,
    }));
    try {
      const out = await runStructured({
        system: SUMMARIZE_SYSTEM,
        user: buildSummarizeUser(topic, records),
        schema: SummarizeSchema,
        maxOutputTokens: 3000,
        preference: opts.preference,
        signal: opts.signal,
      });
      ai = out.ai;
      const byRef = new Map(pending.map((p) => [p.ref, p]));
      const done = new Set<string>();
      for (const item of out.data.items) {
        const record = byRef.get(item.ref);
        if (!record || done.has(item.ref)) continue;
        const { study, requestedId } = record; // refs the model made up are ignored
        done.add(item.ref);
        const src = sourceText(study);
        const hasAbstract = !!study.abstract && study.abstract.length >= MIN_ABSTRACT;
        const relevance = textOrNull(item.relevance, 420, src);
        const summary = hasAbstract ? textOrNull(item.summary, 900, src) : null;
        const findings = hasAbstract && Array.isArray(item.keyFindings)
          ? item.keyFindings.map((f) => textOrNull(f, 260, src)).filter((f): f is string => !!f).slice(0, 3)
          : [];
        const insight: StudyInsight = {
          relevance,
          summary,
          keyFindings: findings,
          basis: hasAbstract ? 'abstract' : 'title-and-topics',
          status: summary || relevance ? 'ok' : 'insufficient',
          fromCache: false,
        };
        insights[requestedId] = insight;
        // An empty result may be a transient model miss; only successful notes are cached.
        if (insight.status === 'ok') insightCache.set(`${requestedId}|${topicKey}`, insight);
      }
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      ai = unavailableInfo(err);
    }
  }
  return { insights, ai, missing, skipped };
}
