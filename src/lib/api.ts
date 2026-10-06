import type {
  AIProviderPreference, AnalyzeResponse, ApiErrorBody, HealthResponse, SearchFilters, SearchResponse, Study,
  SummarizeResponse, TopicCount, UploadResponse,
} from '../../shared/types';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

/** Hard ceiling so a hung connection ends in an error message instead of an endless spinner. */
const REQUEST_TIMEOUT_MS = 90_000;

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal: rest.signal ? AbortSignal.any([rest.signal, timeout]) : timeout,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...rest.headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err; // cancelled by the app, not an error
    if ((err as Error).name === 'TimeoutError') throw new ApiError('TIMEOUT', 'The server took too long to respond. Please try again.');
    throw new ApiError('NETWORK', 'Could not reach the Relata server. Check your connection and try again.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(e?.code ?? 'HTTP_' + res.status, e?.message ?? 'The server returned an unexpected response.', res.status, e?.retryAfterSeconds);
  }
  return data as T;
}

export interface SearchRequest {
  query: string;
  expandedQueries: string[];
  concepts: string[];
  filters: SearchFilters;
  page: number;
  perPage: number;
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>('/api/health', { signal }),
  analyze: (body: { text: string; origin: 'text' | 'document'; useAI: boolean; provider: AIProviderPreference }, signal?: AbortSignal) =>
    request<AnalyzeResponse>('/api/analyze', { method: 'POST', json: body, signal }),
  search: (body: SearchRequest, signal?: AbortSignal) => request<SearchResponse>('/api/search', { method: 'POST', json: body, signal }),
  summarize: (body: { ids: string[]; topic: string; provider: AIProviderPreference }, signal?: AbortSignal) =>
    request<SummarizeResponse>('/api/ai/summarize', { method: 'POST', json: body, signal }),
  topicCounts: (body: { names: string[]; yearsBack: number }, signal?: AbortSignal) =>
    request<{ available: boolean; counts: TopicCount[] }>('/api/topics/counts', { method: 'POST', json: body, signal }),
  study: (id: string, signal?: AbortSignal) => request<{ study: Study; retrievedLive: boolean }>(`/api/studies/${encodeURIComponent(id)}`, { signal }),
  upload: (file: File, signal?: AbortSignal) => {
    const fd = new FormData();
    fd.append('file', file);
    return request<UploadResponse>('/api/upload', { method: 'POST', body: fd, signal });
  },
};

export const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';
