import { createContext, useContext, type ReactNode } from 'react';

/**
 * FUTURE(auth): client-side identity seam.
 *
 * Relata has no accounts yet, so everyone is anonymous and `enabled` is false. The UI already
 * asks this context where it would need to know (the account slot in the header and sidebar,
 * and the `requiresAuth` flag on routes), so adding login later means filling this provider in,
 * not touching every page.
 *
 * Steps when the time comes (the matching server seam is `server/auth/context.ts`):
 *  1. Make `AuthProvider` load the session (for example `GET /api/session`) and expose
 *     `signIn`, `signOut` and a real `user`. Set `enabled` to true.
 *  2. Add `/login` to `shared/routes.ts` and the route table in `App.tsx`.
 *  3. Render the sign-in link and the user menu in `AccountSlot`.
 *  4. Add a remote `LibraryStore` in `src/state/library.tsx` that saves to the server, and pick
 *     it when `status === 'authenticated'`. Keep the browser store for signed-out visitors.
 *  5. Update the Privacy Policy, Terms and Cookie Policy. They currently say there are no accounts.
 */
export type AuthStatus = 'anonymous' | 'authenticated';

export interface AuthUser {
  id: string;
  displayName: string;
}

export interface AuthValue {
  /** False until accounts exist. While false, no sign-in UI is shown anywhere. */
  enabled: boolean;
  status: AuthStatus;
  user: AuthUser | null;
}

const ANONYMOUS: AuthValue = { enabled: false, status: 'anonymous', user: null };

const Ctx = createContext<AuthValue>(ANONYMOUS);

export function AuthProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={ANONYMOUS}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  return useContext(Ctx);
}
