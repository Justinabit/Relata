import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { activeStep, showCookieNotice } from '../lib/firstrun';
import { Link, useRouter } from '../lib/router';
import { isAppPath, ROUTES } from '../lib/routes';
import { firstRun, useFirstRun } from '../state/firstrun';
import { IconButton } from './ui';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * While a popup is open: the page behind it is inert and does not scroll, and Tab stays inside the popup
 * and the cookie notice below it. Focus returns to where it was when the popup closes.
 */
function useModalEffects(open: boolean, onEscape: () => void) {
  const escape = useRef(onEscape);
  escape.current = onEscape;
  useEffect(() => {
    if (!open) return;
    const root = document.getElementById('root');
    const previous = document.activeElement as HTMLElement | null;
    root?.setAttribute('inert', '');
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); escape.current(); return; }
      if (e.key !== 'Tab') return;
      const items = [...document.querySelectorAll<HTMLElement>('[data-fr-scope]')]
        .flatMap((el) => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)])
        .filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      const inside = items.includes(active as HTMLElement);
      if (e.shiftKey && (active === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      root?.removeAttribute('inert');
      document.documentElement.style.overflow = prevOverflow;
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open]);
}

function Popup({ title, titleId, onClose, closeLabel, actions, children }: {
  title: string; titleId: string; onClose: () => void; closeLabel: string; actions: ReactNode; children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, []);
  return (
    <div
      className="fr-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      ref={card}
      data-fr-scope
    >
      <header className="fr-card__head">
        <h2 id={titleId} className="fr-card__title">{title}</h2>
        <IconButton label={closeLabel} onClick={onClose}><X size={18} aria-hidden="true" /></IconButton>
      </header>
      <div className="fr-card__body">{children}</div>
      <div className="fr-card__foot">{actions}</div>
    </div>
  );
}

function TermsPopup() {
  return (
    <Popup
      title="Terms and Conditions" titleId="fr-terms" closeLabel="Close for now" onClose={firstRun.deferTerms}
      actions={
        <div className="fr-actions">
          <button type="button" className="btn btn--primary" onClick={firstRun.acceptTerms}>Accept and continue</button>
          <Link to={ROUTES.terms} className="btn">Read the full terms</Link>
        </div>
      }
    >
      <p className="fr-lead">Before you use Relata, please read this summary of the main points.</p>
      <ul className="fr-list">
        <li>Relata is a discovery tool. Check each study at its original source before you rely on it or cite it.</li>
        <li>AI notes can be incomplete or wrong. They are labelled and limited to the records Relata retrieved.</li>
        <li>Study details come from OpenAlex and Crossref and can contain errors or gaps.</li>
        <li>Use Relata lawfully, and upload only files you have the right to process.</li>
        <li>The service is provided as it is and can change or go offline.</li>
      </ul>
      <p className="fr-note">
        This is a summary. The full <Link to={ROUTES.terms}>Terms and Conditions</Link> and <Link to={ROUTES.privacy}>Privacy Policy</Link> apply.
      </p>
    </Popup>
  );
}

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Start with a topic or a file',
    text: 'Paste a research question, lesson topic or abstract, or upload a PDF, DOCX, TXT or Markdown file. Relata finds the main topic and searches OpenAlex and Crossref.',
  },
  {
    title: 'Every study comes from a source record',
    text: 'Authors, year, journal and DOI come from OpenAlex and Crossref, never from AI. Where records disagree or a DOI cannot be checked, Relata says so. AI notes are labelled and can be switched off for any search.',
  },
  {
    title: 'Save, cite and export',
    text: 'Save studies in this browser, with no account. Copy citations in APA 7, MLA 9 or Chicago 17, or export .txt, .csv or .json. Settings has the research window, theme and AI provider.',
  },
];

function OnboardingPopup() {
  const [i, setI] = useState(0);
  const step = STEPS[i] as { title: string; text: string };
  const last = i === STEPS.length - 1;
  const finish = (focusSearch: boolean) => {
    firstRun.finishOnboarding();
    if (focusSearch) requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('main textarea')?.focus());
  };
  return (
    <Popup
      title="Welcome to Relata" titleId="fr-onboarding" closeLabel="Skip the introduction" onClose={() => finish(false)}
      actions={
        <div className="fr-actions fr-actions--split">
          <div className="fr-actions">
            {i > 0 && <button type="button" className="btn" onClick={() => setI(i - 1)}>Back</button>}
            {!last && <button type="button" className="btn btn--primary" onClick={() => setI(i + 1)}>Next</button>}
            {last && <button type="button" className="btn btn--primary" onClick={() => finish(true)}>Start searching</button>}
          </div>
          {!last && <button type="button" className="btn btn--ghost" onClick={() => finish(false)}>Skip</button>}
        </div>
      }
    >
      <p className="fr-step" aria-live="polite">Step {i + 1} of {STEPS.length}</p>
      <h3 className="fr-step__title">{step.title}</h3>
      <p className="fr-lead">{step.text}</p>
    </Popup>
  );
}

function CookieNotice({ inApp }: { inApp: boolean }) {
  return (
    <section className={`fr-banner ${inApp ? 'fr-banner--app' : ''}`} aria-label="Cookie notice" data-fr-scope>
      <p className="fr-banner__text">
        <strong>Cookies.</strong> Relata does not set cookies at the moment. Your settings and saved studies stay in this browser’s local storage.
        Accept cookies to record your choice, or close this notice. <Link to={`${ROUTES.cookies}#your-choice`}>Cookie settings</Link>
      </p>
      <div className="fr-banner__actions">
        <button type="button" className="btn btn--primary btn--sm" onClick={() => firstRun.setCookies('accepted')}>Accept cookies</button>
        <button type="button" className="btn btn--sm" onClick={() => firstRun.setCookies('closed')}>Close</button>
      </div>
    </section>
  );
}

/** Terms popup, first-visit introduction and cookie notice. Rendered once, outside the page layouts. */
export function FirstRun() {
  const fr = useFirstRun();
  const { path } = useRouter();
  const step = activeStep(fr, path);
  const notice = showCookieNotice(fr);
  useModalEffects(step !== null, () => (step === 'terms' ? firstRun.deferTerms() : firstRun.finishOnboarding()));

  return createPortal(
    <>
      {step && (
        <div className={`fr-overlay ${notice ? 'fr-overlay--notice' : ''}`}>
          {step === 'terms' ? <TermsPopup /> : <OnboardingPopup />}
        </div>
      )}
      {notice && <CookieNotice inApp={isAppPath(path)} />}
    </>,
    document.body,
  );
}
