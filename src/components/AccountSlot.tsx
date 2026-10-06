import { useAuth } from '../state/auth';

/**
 * Reserved spot for the sign-in link and user menu. It renders nothing while accounts are
 * disabled, so today's pages are unchanged. See `src/state/auth.tsx` for the steps to fill it.
 */
export function AccountSlot({ variant }: { variant: 'header' | 'sidebar' }) {
  const { enabled, status, user } = useAuth();
  if (!enabled) return null;
  return (
    <div className={`account account--${variant}`}>
      {status === 'authenticated' && user ? <span className="account__name">{user.displayName}</span> : null}
    </div>
  );
}
