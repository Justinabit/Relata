import { AppError, UpstreamError } from '../lib/errors.js';
import type { Study } from '../../shared/types.js';
import { getOpenAlexWork, lookupOpenAlexByDois } from './openalex.js';
import { getCrossrefWork, lookupCrossrefByDois } from './crossref.js';
import { doiFromCrossrefStudyId, openalexShortId } from './ids.js';
import { reconcile } from './reconcile.js';
import { rememberStudies, studyStore } from './store.js';
import { validateStudy } from './validate.js';

/** Rebuild from scholarly sources on any instance. Browser metadata is never accepted. */
export async function lookupStudy(raw: string, signal?: AbortSignal): Promise<Study> {
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
  if (validateStudy(study, { fromYear: 1500, toYear: new Date().getUTCFullYear(), years: 0, label: '', outsideDefault: true })) {
    throw new AppError(404, 'NOT_FOUND', 'No verified study was found for this result.');
  }
  rememberStudies([study]);
  studyStore.set(raw, study);
  return study;
}
