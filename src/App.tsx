import { lazy, Suspense, useEffect, useRef, type ComponentType } from 'react';
import { Link, RouterProvider, useRouter } from './lib/router';
import { isAppPath, legacyTarget, ROUTES } from './lib/routes';
import { AuthProvider, useAuth } from './state/auth';
import { HealthProvider } from './state/health';
import { LibraryProvider } from './state/library';
import { ResearchProvider } from './state/research';
import { SettingsProvider } from './state/settings';
import { ToastProvider } from './state/toast';
import { BottomNav, Footer, PublicHeader, Sidebar, TopBar } from './components/Shell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FirstRun } from './components/FirstRun';
import { Skeleton } from './components/ui';
import LandingPage from './pages/LandingPage';
import SearchPage from './pages/SearchPage';

const ResearchPage = lazy(() => import('./pages/ResearchPage'));
const SavedPage = lazy(() => import('./pages/SavedPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
// Named exports of one module, each split into its own lazily-loaded chunk reference.
const infoPage = (pick: 'AboutPage' | 'PrivacyPage' | 'CookiesPage' | 'TermsPage' | 'DisclaimerPage' | 'AiUsePage' | 'ContactPage') =>
  lazy(() => import('./pages/InfoPages').then((m) => ({ default: m[pick] })));

interface RouteDef {
  component: ComponentType;
  /**
   * FUTURE(auth): set to true on routes that need an account. While accounts are disabled no
   * route sets it, so nothing changes today. See src/state/auth.tsx.
   */
  requiresAuth?: boolean;
}

/** One entry per address. Which layout wraps the page is decided by the path (see `isAppPath`). */
const ROUTE_TABLE: Record<string, RouteDef> = {
  [ROUTES.home]: { component: LandingPage },
  [ROUTES.app]: { component: SearchPage },
  [ROUTES.research]: { component: ResearchPage },
  [ROUTES.saved]: { component: SavedPage },
  [ROUTES.settings]: { component: SettingsPage },
  [ROUTES.about]: { component: infoPage('AboutPage') },
  [ROUTES.privacy]: { component: infoPage('PrivacyPage') },
  [ROUTES.cookies]: { component: infoPage('CookiesPage') },
  [ROUTES.terms]: { component: infoPage('TermsPage') },
  [ROUTES.disclaimer]: { component: infoPage('DisclaimerPage') },
  [ROUTES.aiUse]: { component: infoPage('AiUsePage') },
  [ROUTES.contact]: { component: infoPage('ContactPage') },
};

function NotFound() {
  const { path } = useRouter();
  const inApp = isAppPath(path);
  return (
    <div className="page page--narrow">
      <h1>Page not found</h1>
      <p className="muted">That page doesn’t exist.{inApp ? ' Try the search page instead.' : ' Try the home page or the search page instead.'}</p>
      <p className="row">
        <Link className="btn btn--primary" to={ROUTES.app}>Go to Search</Link>
        {!inApp && <Link className="btn" to={ROUTES.home}>Home page</Link>}
      </p>
    </div>
  );
}

/** Shown for a `requiresAuth` route when nobody is signed in. Unreachable until accounts exist. */
function SignInRequired() {
  return (
    <div className="page page--narrow">
      <h1>Sign in required</h1>
      <p className="muted">This page needs an account. Accounts are not available yet.</p>
      <p><Link className="btn btn--primary" to={ROUTES.app}>Go to Search</Link></p>
    </div>
  );
}

function Routes() {
  const { path, navigate } = useRouter();
  const auth = useAuth();
  const legacy = legacyTarget(path, typeof window === 'undefined' ? '' : window.location.search);

  useEffect(() => {
    if (legacy) navigate(legacy, { replace: true });
  }, [legacy, navigate]);

  if (legacy) return null; // redirecting
  const route = ROUTE_TABLE[path];
  if (!route) return <NotFound />;
  if (route.requiresAuth && auth.status !== 'authenticated') return <SignInRequired />;
  const Page = route.component;
  return <Page />;
}

function PageFallback() {
  return (
    <div className="page" aria-busy="true">
      <Skeleton w="40%" h={30} />
      <Skeleton h={16} className="mt14" />
      <Skeleton w="85%" h={16} className="mt8" />
    </div>
  );
}

function Page() {
  const { path } = useRouter();
  return (
    <ErrorBoundary key={path}>
      <Suspense fallback={<PageFallback />}>
        <Routes />
      </Suspense>
    </ErrorBoundary>
  );
}

function Shell() {
  const { path } = useRouter();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);
  const inApp = isAppPath(path);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // Move keyboard and screen-reader focus to the new page. Hash links on one page keep focus where it is.
    main.current?.focus({ preventScroll: true });
  }, [path]);

  if (inApp) {
    return (
      <>
        <a href="#main" className="skip-link">Skip to main content</a>
        <div className="app">
          <Sidebar />
          <TopBar />
          <div className="content">
            <main id="main" ref={main} tabIndex={-1} key={path} className="main">
              <Page />
            </main>
            <Footer />
          </div>
          <BottomNav />
        </div>
      </>
    );
  }
  return (
    <>
      <a href="#main" className="skip-link">Skip to main content</a>
      <div className="public">
        <PublicHeader />
        <main id="main" ref={main} tabIndex={-1} key={path} className="pubmain">
          <Page />
        </main>
        <Footer />
      </div>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <SettingsProvider>
        <RouterProvider>
          <AuthProvider>
            <HealthProvider>
              <LibraryProvider>
                <ResearchProvider>
                  <ToastProvider>
                    <Shell />
                    <FirstRun />
                  </ToastProvider>
                </ResearchProvider>
              </LibraryProvider>
            </HealthProvider>
          </AuthProvider>
        </RouterProvider>
      </SettingsProvider>
    </ErrorBoundary>
  );
}
