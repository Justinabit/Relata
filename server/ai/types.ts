import type { AIProviderName } from '../../shared/types.js';

export interface GenerateRequest {
  system: string;
  user: string;
  maxOutputTokens: number;
  signal?: AbortSignal;
}

/** One concrete model vendor. Providers only transport text; validation happens in the manager. */
export interface AIProvider {
  readonly name: AIProviderName;
  isConfigured(): boolean;
  /** Returns the model's raw text, which is expected to be a JSON document. */
  generateJson(req: GenerateRequest): Promise<string>;
}

export class AIUnavailableError extends Error {
  constructor(
    public reason: 'not_configured' | 'failed',
    message: string,
    public attempts: { provider: AIProviderName; error: string }[] = [],
  ) {
    super(message);
  }
}
