import { config } from '../config.js';
import { TtlCache } from '../lib/cache.js';
import type { Study } from '../../shared/types.js';

/**
 * Server-side record of studies this server verified recently. The AI summarisation endpoint
 * reads studies from here by id — the client can never hand the AI "a study" to summarise,
 * which is what keeps AI input restricted to metadata that came from a scholarly source.
 */
export const studyStore = new TtlCache<Study>(3000, config.retention.studyStoreSeconds * 1000);

export function rememberStudies(studies: Study[]): void {
  for (const s of studies) studyStore.set(s.id, s);
}
