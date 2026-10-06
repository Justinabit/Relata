interface Entry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

/** Small in-memory TTL cache with in-flight de-duplication. Nothing is written to disk. */
export class TtlCache<T> {
  private map = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();
  constructor(
    private maxEntries: number,
    private defaultTtlMs: number,
  ) {}

  get(key: string): { value: T; storedAt: number } | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // refresh recency
    this.map.delete(key);
    this.map.set(key, e);
    return { value: e.value, storedAt: e.storedAt };
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): void {
    if (ttlMs <= 0) return;
    this.map.set(key, { value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value as string;
      this.map.delete(oldest);
    }
  }

  async getOrLoad(key: string, loader: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<{ value: T; cached: boolean; storedAt: number }> {
    const hit = this.get(key);
    if (hit) return { value: hit.value, cached: true, storedAt: hit.storedAt };
    let p = this.inflight.get(key);
    const owner = !p;
    if (!p) {
      p = loader().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    let value: T;
    try {
      value = await p;
    } catch (err) {
      // The caller that started the shared load may have been cancelled (browser navigated away).
      // That must not fail everyone else waiting on the same key: they load it themselves once.
      if (owner || (err as { kind?: string })?.kind !== 'cancelled') throw err;
      value = await loader();
    }
    this.set(key, value, ttlMs);
    return { value, cached: false, storedAt: Date.now() };
  }

  clear(): void {
    this.map.clear();
  }
  get size(): number {
    return this.map.size;
  }
}
