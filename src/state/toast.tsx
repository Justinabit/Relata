import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const Ctx = createContext<(msg: string) => void>(() => undefined);

/** Polite live region + short-lived toast. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const push = useCallback((m: string) => {
    setMsg('');
    window.setTimeout(() => setMsg(m), 20);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), 3200);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {msg && <div className="toast">{msg}</div>}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
