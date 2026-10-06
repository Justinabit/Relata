import { ROUTES } from './routes';

/** What the person has already dealt with on this device. */
export interface FirstRunState {
  termsAccepted: boolean;
  /** The terms popup was closed without accepting, for this page session only. Not saved. */
  termsDeferred: boolean;
  onboarded: boolean;
  /** `null` means the cookie notice has not been answered yet. */
  cookies: 'accepted' | 'closed' | null;
}

export type FirstRunStep = 'terms' | 'onboarding' | null;

/**
 * Which popup, if any, to show on this page.
 * - Terms: landing page only, until accepted (or closed for now).
 * - Onboarding: landing page or the Search page, once, after terms are dealt with.
 * Policy pages, results and settings never get a popup, so the terms and cookie policy can always be read.
 */
export function activeStep(s: FirstRunState, path: string): FirstRunStep {
  const onLanding = path === ROUTES.home;
  if (onLanding && !s.termsAccepted && !s.termsDeferred) return 'terms';
  if ((onLanding || path === ROUTES.app) && !s.onboarded) return 'onboarding';
  return null;
}

/** The cookie notice is shown on every page until it is answered. */
export const showCookieNotice = (s: FirstRunState): boolean => s.cookies === null;
