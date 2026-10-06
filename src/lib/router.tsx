import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

interface RouterValue {
  path: string;
  search: URLSearchParams;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}
const Ctx = createContext<RouterValue | null>(null);

/** Scrolls to `#id` once the target page has rendered, or to the top when there is no hash. */
function settleScroll(hash: string) {
  if (!hash) {
    window.scrollTo({ top: 0 });
    return;
  }
  // Two frames: the page for a new path mounts first, then its sections exist to scroll to.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      let id = hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* keep the raw id */ }
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ block: 'start' });
      else window.scrollTo({ top: 0 });
    }),
  );
}

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState(() => ({ path: window.location.pathname, search: window.location.search }));
  useEffect(() => {
    const onPop = () => {
      setLoc({ path: window.location.pathname, search: window.location.search });
      if (window.location.hash) settleScroll(window.location.hash);
    };
    window.addEventListener('popstate', onPop);
    // A fresh load of an address that has a hash (for example /#checks) scrolls to it.
    if (window.location.hash) settleScroll(window.location.hash);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const url = new URL(to, window.location.origin);
    const next = url.pathname + url.search + url.hash;
    const here = window.location.pathname + window.location.search + window.location.hash;
    if (next === here) return;
    const samePage = url.pathname + url.search === window.location.pathname + window.location.search;
    window.history[opts?.replace ? 'replaceState' : 'pushState'](null, '', next);
    if (!samePage) setLoc({ path: url.pathname, search: url.search });
    settleScroll(url.hash);
  }, []);
  const value = useMemo(() => ({ path: loc.path.replace(/\/+$/, '') || '/', search: new URLSearchParams(loc.search), navigate }), [loc, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouter(): RouterValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('RouterProvider missing');
  return v;
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const { navigate } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Relata` : 'Relata: Discover the research behind your topic';
  }, [title]);
}
