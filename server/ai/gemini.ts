import { aiConfigured, config } from '../config.js';
import { fetchJson } from '../lib/http.js';
import { UpstreamError } from '../lib/errors.js';
import type { AIProvider, GenerateRequest } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const;
  isConfigured(): boolean {
    return aiConfigured('gemini');
  }
  async generateJson(req: GenerateRequest): Promise<string> {
    const { apiKey, model, baseUrl } = config.ai.gemini;
    const data = await fetchJson<any>(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      service: 'Gemini',
      method: 'POST',
      timeoutMs: config.ai.timeoutMs,
      signal: req.signal,
      retries: 0,
      headers: { 'x-goog-api-key': apiKey! },
      body: {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2,
          maxOutputTokens: req.maxOutputTokens,
          // 2.5-flash counts hidden "thinking" against maxOutputTokens, which can truncate the JSON.
          // Structured extraction does not need it. (2.5-pro cannot disable thinking, so it is left alone.)
          ...(/^gemini-2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      },
    });
    if (data?.promptFeedback?.blockReason) throw new UpstreamError('Gemini', 'invalid', 'Gemini declined to process the request.');
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts ?? []).filter((p: any) => typeof p?.text === 'string' && !p.thought).map((p: any) => p.text).join('');
    if (!text) throw new UpstreamError('Gemini', 'invalid', 'Gemini returned no content.');
    if (cand?.finishReason === 'MAX_TOKENS') throw new UpstreamError('Gemini', 'invalid', 'Gemini output was truncated.');
    return text;
  }
}
