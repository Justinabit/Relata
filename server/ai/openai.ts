import { aiConfigured, config } from '../config.js';
import { fetchJson } from '../lib/http.js';
import { UpstreamError } from '../lib/errors.js';
import type { AIProvider, GenerateRequest } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai' as const;
  isConfigured(): boolean {
    return aiConfigured('openai');
  }
  async generateJson(req: GenerateRequest): Promise<string> {
    const { apiKey, model, baseUrl } = config.ai.openai;
    const data = await fetchJson<any>(`${baseUrl}/v1/chat/completions`, {
      service: 'OpenAI',
      method: 'POST',
      timeoutMs: config.ai.timeoutMs,
      signal: req.signal,
      retries: 0,
      headers: { authorization: `Bearer ${apiKey}` },
      body: {
        model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: { type: 'json_object' },
        max_completion_tokens: req.maxOutputTokens,
      },
    }).catch((err: unknown) => {
      // Logged on the server only: a retired or mistyped model name otherwise shows up as a bare "HTTP 404".
      if (err instanceof UpstreamError && err.status === 404) {
        throw new UpstreamError('OpenAI', 'http', `OpenAI model "${model}" is not available to this API key. Set OPENAI_MODEL to a current model.`, 404);
      }
      throw err;
    });
    const choice = data?.choices?.[0];
    const text = choice?.message?.content;
    if (typeof text !== 'string' || !text) throw new UpstreamError('OpenAI', 'invalid', 'OpenAI returned no content.');
    if (choice?.finish_reason === 'length') throw new UpstreamError('OpenAI', 'invalid', 'OpenAI output was truncated.');
    return text;
  }
}
