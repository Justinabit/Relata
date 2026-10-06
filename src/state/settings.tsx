import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AIProviderPreference, YearsBack } from '../../shared/types';
import { readJson, writeJson } from '../lib/storage';

export type ThemePref = 'system' | 'light' | 'dark';
export interface Settings {
  theme: ThemePref;
  aiProvider: AIProviderPreference;
  yearsBack: YearsBack;
  perPage: 10 | 20 | 50;
  reducedMotion: boolean;
}
const KEY = 'relata:settings:v1';
const DEFAULTS: Settings = { theme: 'system', aiProvider: 'auto', yearsBack: 10, perPage: 10, reducedMotion: false };

const oneOf = <T,>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/**
 * Stored settings are untrusted: an old version, manual edit or corruption must never produce a
 * value the server rejects (e.g. yearsBack: 7 would make every search fail with HTTP 400).
 */
export function sanitizeSettings(raw: Partial<Record<keyof Settings, unknown>>): Settings {
  return {
    theme: oneOf(raw.theme, ['system', 'light', 'dark'] as const, DEFAULTS.theme),
    aiProvider: oneOf(raw.aiProvider, ['auto', 'gemini', 'openai'] as const, DEFAULTS.aiProvider),
    yearsBack: oneOf(raw.yearsBack, [1, 3, 5, 10] as const, DEFAULTS.yearsBack),
    perPage: oneOf(raw.perPage, [10, 20, 50] as const, DEFAULTS.perPage),
    reducedMotion: raw.reducedMotion === true,
  };
}

interface Value {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  resolvedTheme: 'light' | 'dark';
  toggleTheme: () => void;
}
const Ctx = createContext<Value | null>(null);

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => sanitizeSettings(readJson<Settings>(KEY, DEFAULTS)));
  const [sysDark, setSysDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setSysDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const resolvedTheme: 'light' | 'dark' = settings.theme === 'system' ? (sysDark ? 'dark' : 'light') : settings.theme;

  useEffect(() => {
    const el = document.documentElement;
    if (el.dataset.theme !== resolvedTheme) {
      el.classList.add('theme-fade');
      el.dataset.theme = resolvedTheme;
      const t = window.setTimeout(() => el.classList.remove('theme-fade'), 300);
      return () => window.clearTimeout(t);
    }
  }, [resolvedTheme]);

  useEffect(() => {
    const el = document.documentElement;
    if (settings.reducedMotion) el.dataset.motion = 'reduce';
    else delete el.dataset.motion;
  }, [settings.reducedMotion]);

  // Persist from an effect: state updater functions must stay free of side effects.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    writeJson(KEY, settings);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => sanitizeSettings({ ...s, ...patch })), []);

  const toggleTheme = useCallback(() => update({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' }), [resolvedTheme, update]);
  const value = useMemo(() => ({ settings, update, resolvedTheme, toggleTheme }), [settings, update, resolvedTheme, toggleTheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error('SettingsProvider missing');
  return v;
}
