import type { AIProviderName, AIProviderPreference, HealthResponse } from '../../shared/types';

export const PROVIDER_LABEL: Record<AIProviderName, string> = { gemini: 'Google Gemini', openai: 'OpenAI' };

/**
 * Whether AI can run for this preference on this server. A specific provider is never swapped for the other, so it
 * must itself be configured. Before the server has answered, AI counts as available.
 */
export function aiUsable(pref: AIProviderPreference, h: HealthResponse | null): boolean {
  if (!h) return true;
  return pref === 'auto' ? h.ai.anyConfigured : h.ai[pref];
}

/** Who receives the text for this preference, in words. Only configured providers are named. */
export function providerNames(pref: AIProviderPreference, h: HealthResponse | null): string {
  if (!h) return 'an AI provider';
  if (pref !== 'auto') return PROVIDER_LABEL[pref];
  const order: AIProviderName[] = h.ai.primary === 'gemini' ? ['gemini', 'openai'] : ['openai', 'gemini'];
  const on = order.filter((p) => h.ai[p]);
  if (!on.length) return 'an AI provider';
  return on.length === 2 ? `${PROVIDER_LABEL[on[0]]} (with ${PROVIDER_LABEL[on[1]]} as a fallback)` : PROVIDER_LABEL[on[0]];
}
