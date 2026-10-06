import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { HealthResponse } from '../../shared/types';
import { api } from '../lib/api';

const Ctx = createContext<{ health: HealthResponse | null; failed: boolean }>({ health: null, failed: false });

export function HealthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ health: HealthResponse | null; failed: boolean }>({ health: null, failed: false });
  useEffect(() => {
    const c = new AbortController();
    api.health(c.signal).then((health) => setState({ health, failed: false })).catch((e) => e?.name !== 'AbortError' && setState({ health: null, failed: true }));
    return () => c.abort();
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export const useHealth = () => useContext(Ctx);
