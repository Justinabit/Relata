import { useSyncExternalStore } from 'react';
import type { FirstRunState } from '../lib/firstrun';
import { readString, removeKey, writeString } from '../lib/storage';

export const FIRSTRUN_KEYS = {
  terms: 'relata:terms:v1',
  onboarded: 'relata:onboarded:v1',
  cookies: 'relata:cookies:v1',
} as const;

function load(): FirstRunState {
  const cookies = readString(FIRSTRUN_KEYS.cookies);
  return {
    termsAccepted: !!readString(FIRSTRUN_KEYS.terms),
    termsDeferred: false,
    onboarded: readString(FIRSTRUN_KEYS.onboarded) === '1',
    cookies: cookies === 'accepted' || cookies === 'closed' ? cookies : null,
  };
}

// Held in memory as well as in localStorage, so a choice still holds for the visit when storage is blocked.
let state: FirstRunState = load();
const listeners = new Set<() => void>();
const set = (patch: Partial<FirstRunState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const firstRun = {
  acceptTerms() {
    writeString(FIRSTRUN_KEYS.terms, new Date().toISOString());
    set({ termsAccepted: true });
  },
  deferTerms() {
    set({ termsDeferred: true });
  },
  finishOnboarding() {
    writeString(FIRSTRUN_KEYS.onboarded, '1');
    set({ onboarded: true });
  },
  setCookies(choice: 'accepted' | 'closed') {
    writeString(FIRSTRUN_KEYS.cookies, choice);
    set({ cookies: choice });
  },
  /** From the Cookie Policy page: bring the notice back so the choice can be changed. */
  resetCookies() {
    removeKey(FIRSTRUN_KEYS.cookies);
    set({ cookies: null });
  },
};

export function useFirstRun(): FirstRunState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}
