import { Router } from 'express';
import multer from 'multer';
import { aiConfigured, config } from '../config.js';
import { AppError, UpstreamError } from '../lib/errors.js';
import { cleanText } from '../lib/text.js';
import { analyzeInput } from '../ai/analyze.js';
import { summarizeStudies } from '../ai/summarize.js';
import { extractDocument } from '../documents/extract.js';
import { aiLimiter, requestSignal, searchLimiter, uploadLimiter } from '../middleware/security.js';
import { runSearch } from '../research/pipeline.js';
import { countWorks, getOpenAlexTopic, getOpenAlexWork, lookupOpenAlexByDois } from '../research/openalex.js';
import { getCrossrefWork, lookupCrossrefByDois } from '../research/crossref.js';
import { doiFromCrossrefStudyId, openalexShortId } from '../research/ids.js';
import { reconcile } from '../research/reconcile.js';
import { rememberStudies } from '../research/store.js';
import { computeWindow } from '../../shared/window.js';
import type { HealthResponse, SearchFilters, Study, TopicCount } from '../../shared/types.js';
import { analyzeBody, searchBody, summarizeBody, topicCountsBody } from './schemas.js';

export const api = Router();

const upload = multer({
  storage: multer.memoryStorage(), // never touches disk
  limits: { fileSize: config.limits.maxUploadBytes, files: 1, fields: 0, parts: 2 },
});

// GET /api/health — reports which capabilities exist, never any secret.
api.get('/health', (_req, res) => {
  const gemini = aiConfigured('gemini');
  const openai = aiConfigured('openai');
  const body: HealthResponse = {
    status: 'ok',
    time: new Date().toISOString(),
    version: config.version,
    ai: { gemini, openai, primary: config.ai.primary, anyConfigured: gemini || openai },
    research: { openalex: { keyConfigured: Boolean(config.openalex.apiKey) }, crossref: { enabled: true } },
    limits: {
      maxUploadMb: Math.round(config.limits.maxUploadBytes / 1048576),
      maxExtractedChars: config.limits.maxExtractedChars,
      maxInputChars: config.limits.maxInputChars,
      aiInputChars: config.ai.maxInputChars,
    },
    retention: { uploadedDocuments: 'none', searchCacheSeconds: config.retention.searchCacheSeconds },
    contactEmail: config.contactEmail,
  };
  res.json(body);
});

// POST /api/analyze — topic analysis (AI optional) + deterministic search plan.
api.post('/analyze', aiLimiter, async (req, res) => {
  const body = analyzeBody.parse(req.body);
  const text = cleanText(body.text).slice(0, config.limits.maxInputChars);
  if (text.length < 2) throw new AppError(400, 'EMPTY_INPUT', 'Enter a topic, question or passage to analyse.');
  const result = await analyzeInput({ text, origin: body.origin, useAI: body.useAI, preference: body.provider, signal: requestSignal(req, res) });
  res.json(result);
});

// POST /api/search — verified scholarly search.
api.post('/search', searchLimiter, async (req, res) => {
  const b = searchBody.parse(req.body);
  const filters: SearchFilters = { ...b.filters };
  const result = await runSearch({ query: b.query, expandedQueries: b.expandedQueries, concepts: b.concepts, filters, page: b.page, perPage: b.perPage }, requestSignal(req, res));
  res.json(result);
});

// POST /api/upload — extract text from PDF / DOCX / TXT / MD, in memory only.
api.post('/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Choose a file to upload.');
  const out = await extractDocument(req.file);
  req.file.buffer = Buffer.alloc(0);
  res.json(out);
});

// POST /api/ai/summarize — summaries for studies this server verified (looked up by id, never client-supplied).
api.post('/ai/summarize', aiLimiter, async (req, res) => {
  const b = summarizeBody.parse(req.body);
  const out = await summarizeStudies({ ids: [...new Set(b.ids)], topic: b.topic, preference: b.provider, signal: requestSignal(req, res) });
  res.json(out);
});

// POST /api/topics/counts — real OpenAlex work counts for suggested topic names.
api.post('/topics/counts', searchLimiter, async (req, res) => {
  const b = topicCountsBody.parse(req.body);
  const w = computeWindow(b.yearsBack);
  if (!config.openalex.topicCounts) {
    res.json({ available: false, counts: b.names.map((name): TopicCount => ({ name, works: null })) });
    return;
  }
  const signal = requestSignal(req, res);
  let anyOk = false;
  const counts = await Promise.all(
    b.names.map(async (name): Promise<TopicCount> => {
      try {
        const works = await countWorks(name, w.fromYear, w.toYear, signal);
        anyOk = anyOk || works !== null;
        return { name, works };
      } catch {
        return { name, works: null };
      }
    }),
  );
  res.json({ available: anyOk, counts });
});

// GET /api/topics/:id — OpenAlex topic record (e.g. T10001).
api.get('/topics/:id', searchLimiter, async (req, res) => {
  const id = openalexShortId(String(req.params.id));
  if (!id || !id.startsWith('T')) throw new AppError(400, 'INVALID_ID', 'Topic ids look like T10001.');
  const topic = await getOpenAlexTopic(id, requestSignal(req, res));
  if (!topic) throw new AppError(404, 'NOT_FOUND', 'No OpenAlex topic was found for this id.');
  res.json({ topic, source: 'openalex' });
});

// GET /api/studies/:id — fresh, re-verified record ("W…" OpenAlex id or "cr-…" Crossref id).
api.get('/studies/:id', searchLimiter, async (req, res) => {
  const signal = requestSignal(req, res);
  const raw = String(req.params.id);
  let study: Study | null = null;
  try {
    const oaId = openalexShortId(raw);
    if (oaId?.startsWith('W')) {
      const oa = await getOpenAlexWork(oaId, signal);
      if (oa?.doi) {
        const { records } = await lookupCrossrefByDois([oa.doi], signal);
        const cr = records.get(oa.doi);
        study = cr ? reconcile(oa, cr) : { ...oa, verification: { ...oa.verification, doi: records.has(oa.doi) ? 'not-in-crossref' : 'unchecked' } };
      } else study = oa;
    } else {
      const doi = doiFromCrossrefStudyId(raw);
      if (!doi) throw new AppError(400, 'INVALID_ID', 'Unrecognised study id.');
      const cr = await getCrossrefWork(doi, signal);
      if (cr) {
        let merged: Study = cr;
        try {
          const oa = (await lookupOpenAlexByDois([doi], signal)).get(doi);
          if (oa) merged = { ...reconcile(oa, cr), source: 'crossref' };
        } catch {
          /* OpenAlex enrichment is optional */
        }
        study = merged;
      }
    }
  } catch (err) {
    if (err instanceof UpstreamError) throw new AppError(503, 'RESEARCH_UNAVAILABLE', 'Research services are temporarily unavailable. Please try again later.');
    throw err;
  }
  if (!study) throw new AppError(404, 'NOT_FOUND', 'No verified study was found for this result.');
  rememberStudies([study]);
  res.json({ study, retrievedLive: true });
});

api.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } });
});
