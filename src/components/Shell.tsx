import { type ReactNode } from 'react';
import { BookOpen, Bookmark, Moon, Search, Settings, Sun } from 'lucide-react';
import { Link, useRouter } from '../lib/router';
import { ROUTES } from '../lib/routes';
import { computeWindow } from '../../shared/window';
import { useLibrary } from '../state/library';
import { useResearch } from '../state/research';
import { useSettings } from '../state/settings';
import { AccountSlot } from './AccountSlot';
import { Wordmark } from './Logo';

/** Navigation inside the research tool. */
const NAV = [
  { to: ROUTES.app, label: 'Search', Icon: Search },
  { to: ROUTES.research, label: 'Research', Icon: BookOpen },
  { to: ROUTES.saved, label: 'Saved', Icon: Bookmark },
  { to: ROUTES.settings, label: 'Settings', Icon: Settings },
] as const;

function useActive() {
  const { path } = useRouter();
  // /app is the Search page and also the prefix of every other app route, so it must match exactly.
  return (to: string) => (to === ROUTES.app ? path === ROUTES.app : path === to || path.startsWith(to + '/'));
}

function ThemeToggle({ compact }: { compact?: boolean }) {
  const { resolvedTheme, toggleTheme } = useSettings();
  const dark = resolvedTheme === 'dark';
  return (
    <button type="button" className={`btn ${compact ? 'btn--icon' : 'btn--block'}`} onClick={toggleTheme} aria-pressed={dark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
      {!compact && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}

function NavBadge() {
  const { data } = useLibrary();
  const n = data.studies.length + data.topics.length + data.queries.length;
  return n ? <span className="nav__count" aria-label={`${n} saved items`}>{n}</span> : null;
}

/* ---------------- Research tool layout ---------------- */

export function Sidebar() {
  const active = useActive();
  const { session } = useResearch();
  const w = computeWindow(session.filters.yearsBack);
  return (
    <aside className="sidebar" aria-label="Primary">
      <Link to={ROUTES.home} className="sidebar__brand" aria-label="Relata home page"><Wordmark /></Link>
      <nav aria-label="Main">
        <ul className="nav">
          {NAV.map(({ to, label, Icon }) => (
            <li key={to}>
              <Link to={to} className="nav__link" aria-current={active(to) ? 'page' : undefined}>
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
                {to === ROUTES.saved && <NavBadge />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar__foot">
        <AccountSlot variant="sidebar" />
        <p className="sidebar__window"><span>Research window</span><strong>{w.label}</strong></p>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function TopBar() {
  return (
    <header className="topbar">
      <Link to={ROUTES.home} className="topbar__brand" aria-label="Relata home page"><Wordmark /></Link>
      <AccountSlot variant="header" />
      <ThemeToggle compact />
    </header>
  );
}

export function BottomNav() {
  const active = useActive();
  return (
    <nav className="bottomnav" aria-label="Main">
      <ul>
        {NAV.map(({ to, label, Icon }) => (
          <li key={to}>
            <Link to={to} className="bottomnav__link" aria-current={active(to) ? 'page' : undefined}>
              <span className="bottomnav__icon"><Icon size={20} aria-hidden="true" />{to === ROUTES.saved && <NavBadge />}</span>
              <span>{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ---------------- Public site layout (landing page, policies) ---------------- */

export function PublicHeader() {
  return (
    <header className="pubhead">
      <div className="pubhead__in">
        <Link to={ROUTES.home} className="pubhead__brand" aria-label="Relata home page"><Wordmark /></Link>
        <nav className="pubhead__nav" aria-label="Main">
          <Link to="/#how-it-works">How it works</Link>
          <Link to="/#checks">What we check</Link>
          <Link to="/#ai">AI use</Link>
          <Link to={ROUTES.privacy}>Privacy</Link>
          <Link to={ROUTES.terms}>Terms</Link>
        </nav>
        <div className="pubhead__actions">
          <AccountSlot variant="header" />
          <Link to={ROUTES.app} className="btn btn--primary btn--sm">Open Relata</Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="footer__grid">
        <div className="footer__about">
          <Wordmark />
          <p>Discover recent scholarly studies, related concepts and verified sources from a topic, question or document.</p>
        </div>
        <nav aria-label="Product" className="footer__col">
          <h2>Relata</h2>
          <ul>
            <li><Link to={ROUTES.home}>Home</Link></li>
            <li><Link to={ROUTES.app}>Search</Link></li>
            <li><Link to={ROUTES.about}>About</Link></li>
            <li><Link to={ROUTES.contact}>Contact</Link></li>
          </ul>
        </nav>
        <nav aria-label="Legal and policies" className="footer__col">
          <h2>Policies</h2>
          <ul>
            <li><Link to={ROUTES.privacy}>Privacy Policy</Link></li>
            <li><Link to={ROUTES.terms}>Terms and Conditions</Link></li>
            <li><Link to={ROUTES.cookies}>Cookie Policy</Link></li>
            <li><Link to={ROUTES.disclaimer}>Academic Disclaimer</Link></li>
            <li><Link to={ROUTES.aiUse}>AI Disclosure</Link></li>
          </ul>
        </nav>
      </div>
      <p className="footer__legal">© {year} Relata. Bibliographic metadata is provided by OpenAlex and Crossref. Relata is not affiliated with either organisation.</p>
    </footer>
  );
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}
