import { config } from '../config.js';
import { UpstreamError } from './errors.js';

/**
 * Outbound requests are restricted to a fixed allow-list of API hosts. User input can
 * influence query strings only — never the host, protocol or path of a request.
 */
const ALLOWED_HOSTS = new Set<string>(
  [config.openalex.baseUrl, config.crossref.baseUrl, config.ai.gemini.baseUrl, config.ai.openai.baseUrl].map((u) => new URL(u).host),
);

export interface FetchJsonOptions {
  service: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Retries for 5xx / network errors. 429 and 4xx are never retried. */
  retries?: number;
}

function assertAllowed(service: string, u: URL): void {
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.host)) {
    throw new UpstreamError(service, 'blocked', `Outbound request to ${u.host} is not permitted.`);
  }
}

const MAX_REDIRECTS = 3;

export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions): Promise<T> {
  assertAllowed(opts.service, new URL(url));
  const attempts = (opts.retries ?? 1) + 1;
  let last: UpstreamError | null = null;
  for (let i = 0; i < attempts; i++) {
    if (opts.signal?.aborted) throw new UpstreamError(opts.service, 'cancelled', 'Request cancelled.');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      // Redirects (e.g. OpenAlex merged-work ids) are followed by hand, and only to allow-listed hosts.
      let target = url;
      let res: Response;
      for (let hop = 0; ; hop++) {
        res = await fetch(target, {
          method: opts.method ?? 'GET',
          headers: { accept: 'application/json', ...(opts.body ? { 'content-type': 'application/json' } : {}), ...opts.headers },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          signal: ctrl.signal,
          redirect: 'manual',
        });
        const loc = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
        if (!loc) break;
        if (hop >= MAX_REDIRECTS) throw new UpstreamError(opts.service, 'http', `${opts.service} redirected too many times.`, res.status);
        await res.body?.cancel().catch(() => undefined);
        const next = new URL(loc, target);
        assertAllowed(opts.service, next);
        target = next.toString();
      }
      if (res.status === 429) {
        const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
        throw new UpstreamError(opts.service, 'rate_limited', `${opts.service} rate limit reached.`, 429, Number.isFinite(retryAfter) ? retryAfter : undefined);
      }
      if (!res.ok) {
        // Never echo upstream bodies (they may contain request details) — status only.
        throw new UpstreamError(opts.service, 'http', `${opts.service} responded with HTTP ${res.status}.`, res.status);
      }
      try {
        return (await res.json()) as T;
      } catch {
        throw new UpstreamError(opts.service, 'invalid', `${opts.service} returned an unreadable response.`);
      }
    } catch (err) {
      if (opts.signal?.aborted) throw new UpstreamError(opts.service, 'cancelled', 'Request cancelled.');
      if (err instanceof UpstreamError) {
        last = err;
        if (err.kind === 'rate_limited' || err.kind === 'blocked' || (err.status && err.status < 500)) throw err;
      } else if ((err as Error).name === 'AbortError') {
        last = new UpstreamError(opts.service, 'timeout', `${opts.service} did not respond in time.`);
      } else {
        last = new UpstreamError(opts.service, 'network', `${opts.service} could not be reached.`);
      }
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  throw last ?? new UpstreamError(opts.service, 'network', `${opts.service} could not be reached.`);
}
