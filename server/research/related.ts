import { lookupStudy } from './lookup.js';
import { getOpenAlexRelatedIds } from './openalex.js';
import { AppError } from '../lib/errors.js';
import { dedupe } from './dedupe.js';
import type { Study } from '../../shared/types.js';

export async function relatedStudies(id: string, signal?: AbortSignal): Promise<{ studies: Study[]; partial: boolean }> {
  const parent = await lookupStudy(id, signal);
  if (!parent.openalexId) return { studies: [], partial: false };
  let ids: string[];
  try { ids = await getOpenAlexRelatedIds(parent.openalexId, signal); }
  catch (error) {
    if (signal?.aborted) throw error;
    throw new AppError(503, 'RESEARCH_UNAVAILABLE', 'Related studies could not be retrieved. Please try again later.');
  }
  const found: (Study | undefined)[] = new Array(ids.length);
  let partial = false;
  const queue = ids.map((id, index) => ({ id, index }));
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()!;
      try { found[next.index] = await lookupStudy(next.id, signal); }
      catch (error) {
        if (signal?.aborted) throw error;
        if (!(error instanceof AppError && error.status === 404)) partial = true;
      }
    }
  }));
  const studies = dedupe(found.filter((s): s is Study => !!s && s.id !== parent.id && (!parent.doi || s.doi !== parent.doi)).map((study) => ({ study, score: 1 }))).unique.map((x) => x.study);
  if (!studies.length && partial) throw new AppError(503, 'RESEARCH_UNAVAILABLE', 'Related studies could not be verified. Please try again later.');
  return { studies, partial };
}
