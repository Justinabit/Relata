import { aiConfigured, config } from '../config.js';
import { fetchJson } from '../lib/http.js';
import { UpstreamError } from '../lib/errors.js';
import type { AIProvider, GenerateRequest } from './types.js';

/**
 * Generation settings that depend on the model family.
 * - Gemini 3 and later set thinking with `thinkingLevel` (the numeric budget is for 2.5), and Google's Gemini 3 guide
 *   recommends leaving temperature at its default. "low" suits simple instruction following such as this JSON extraction.
 * - 2.5 Flash counts hidden "thinking" against maxOutputTokens, which can truncate the JSON, so it is switched off.
 *   (2.5 Pro cannot disable thinking, so it is left alone.)
 */
export function geminiGenerationSettings(model: string): Record<string, unknown> {
  if (/^gemini-([3-9]|\d{2,})/.test(model)) return { thinkingConfig: { thinkingLevel: 'low' } };
  if (/^gemini-2\.5-flash/.test(model)) return { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } };
  return { temperature: 0.2 };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;
  isConfigured(): boolean {
    return aiConfigured('gemini');
  }
  async generateJson(req: GenerateRequest): Promise<string> {
    const { apiKey, model, baseUrl } = config.ai.gemini;
    const call = (settings: Record<string, unknown>) =>
      fetchJson<any>(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        service: 'Gemini',
        method: 'POST',
        timeoutMs: config.ai.timeoutMs,
        signal: req.signal,
        retries: 0,
        headers: { 'x-goog-api-key': apiKey! },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: req.maxOutputTokens, ...settings },
        },
      });

    const settings = geminiGenerationSettings(model);
    let data: any;
    try {
      data = await call(settings);
    } catch (err) {
      if (!(err instanceof UpstreamError)) throw err;
      if (err.status === 404) {
        // Logged on the server only: tells the operator what to change instead of a bare "HTTP 404".
        throw new UpstreamError('Gemini', 'http', `Gemini model "${model}" is not available to this API key. Set GEMINI_MODEL to a current model.`, 404);
      }
      // A model that does not accept these thinking settings answers 400; one plain retry keeps AI working.
      if (err.status !== 400 || !('thinkingConfig' in settings)) throw err;
      const { thinkingConfig: _omit, ...plain } = settings;
      data = await call(plain);
    }
    if (data?.promptFeedback?.blockReason) throw new UpstreamError('Gemini', 'invalid', 'Gemini declined to process the request.');
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts ?? []).filter((p: any) => typeof p?.text === 'string' && !p.thought).map((p: any) => p.text).join('');
    if (!text) throw new UpstreamError('Gemini', 'invalid', 'Gemini returned no content.');
    if (cand?.finishReason === 'MAX_TOKENS') throw new UpstreamError('Gemini', 'invalid', 'Gemini output was truncated.');
    return text;
  }
}
