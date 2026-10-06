export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export type UpstreamKind = 'rate_limited' | 'timeout' | 'http' | 'network' | 'invalid' | 'blocked' | 'cancelled';

export class UpstreamError extends Error {
  constructor(
    public service: string,
    public kind: UpstreamKind,
    message: string,
    public status?: number,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
