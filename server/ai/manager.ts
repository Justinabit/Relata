import type { ZodType } from 'zod';
import { config } from '../config.js';
import type { AIInfo, AIProviderName, AIProviderPreference } from '../../shared/types.js';
import { GeminiProvider } from './gemini.js';
import { OpenAIProvider } from './openai.js';
import { AIUnavailableError, type AIProvider } from './types.js';

export const providers: Record<AIProviderName, AIProvider> = {
  gemini: new GeminiProvider(),
  openai: new OpenAIProvider(),
};

export function parseJsonLoose(raw: string): unknown {
  const t = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('not json');
  }
}

/**
 * Provider order:
 *  - "auto": PRIMARY_AI_PROVIDER first, then the other provider as a fallback.
 *  - explicit "gemini" / "openai": only that provider. The user's text is never sent to a
 *    provider they did not choose.
 */
export function providerOrder(pref: AIProviderPreference): AIProvider[] {
  if (pref !== 'auto') return [providers[pref]];
  const first = config.ai.primary;
  const second: AIProviderName = first === 'gemini' ? 'openai' : 'gemini';
  return [providers[first], providers[second]];
}

export interface StructuredResult<T> {
  data: T;
  ai: AIInfo;
}

/**
 * Runs a prompt through the provider chain and validates the output against a schema.
 * Output that fails validation is treated exactly like a provider failure.
 */
export async function runStructured<T>(opts: {
  system: string;
  user: string;
  schema: ZodType<T>;
  maxOutputTokens: number;
  preference: AIProviderPreference;
  signal?: AbortSignal;
}): Promise<StructuredResult<T>> {
  const order = providerOrder(opts.preference).filter((p) => p.isConfigured());
  if (!order.length) throw new AIUnavailableError('not_configured', 'No AI provider is configured on the server.');
  const attempts: { provider: AIProviderName; error: string }[] = [];
  for (const p of order) {
    try {
      const raw = await p.generateJson({ system: opts.system, user: opts.user, maxOutputTokens: opts.maxOutputTokens, signal: opts.signal });
      const parsed = opts.schema.safeParse(parseJsonLoose(raw));
      if (!parsed.success) throw new Error('Output failed schema validation.');
      return { data: parsed.data, ai: { status: 'ok', provider: p.name, fallbackUsed: attempts.length > 0 } };
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      // Log the provider and a coarse reason only — never prompts, documents or keys.
      attempts.push({ provider: p.name, error: err instanceof Error ? err.message : 'unknown' });
      console.warn(`[ai] ${p.name} failed: ${attempts[attempts.length - 1].error}`);
    }
  }
  throw new AIUnavailableError('failed', 'AI analysis is temporarily unavailable.', attempts);
}

export function unavailableInfo(err: unknown): AIInfo {
  if (err instanceof AIUnavailableError && err.reason === 'not_configured') {
    return { status: 'not_configured', message: 'No AI provider is configured on this server. Verified scholarly search is still available.' };
  }
  return { status: 'unavailable', message: 'AI analysis is temporarily unavailable. You can still search verified scholarly sources.' };
}
