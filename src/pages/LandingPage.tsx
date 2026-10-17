import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Ban, Bookmark, CalendarCheck, Check, Database, EyeOff, FileText, GitCompareArrows, Link2, Quote, Search, ShieldCheck, Upload } from 'lucide-react';
import { computeWindow } from '../../shared/window';
import { aiUsable } from '../lib/ai';
import { nf } from '../lib/format';
import { Link, useDocumentTitle, useRouter } from '../lib/router';
import { ROUTES } from '../lib/routes';
import { useHealth } from '../state/health';
import { useResearch } from '../state/research';
import { useSettings } from '../state/settings';
import { AITag, Badge } from '../components/ui';

const CHECKS: { term: string; icon: ReactNode; text: string }[] = [
  {
    term: 'Dates',
    icon: <CalendarCheck size={18} aria-hidden="true" />,
    text: 'A study without a valid publication date is excluded, as is anything outside your selected research window. Older work can be included on purpose and is labelled as outside the window.',
  },
  {
    term: 'DOIs',
    icon: <ShieldCheck size={18} aria-hidden="true" />,
    text: 'Only DOIs returned by a source are shown. OpenAlex DOIs are checked against Crossref and marked “Verified DOI”, “DOI not found in Crossref” or “DOI unchecked”.',
  },
  {
    term: 'Links',
    icon: <Link2 size={18} aria-hidden="true" />,
    text: 'A study links to its DOI or to a landing page returned by a source. If neither exists, Relata shows “Source link unavailable” instead of guessing.',
  },
  {
    term: 'Conflicting records',
    icon: <GitCompareArrows size={18} aria-hidden="true" />,
    text: 'When OpenAlex and Crossref disagree, Relata shows “Metadata conflict detected”, lists both values, and displays Crossref’s under a fixed rule.',
  },
];

export default function LandingPage() {
  useDocumentTitle('');
  const { start } = useResearch();
  const { navigate } = useRouter();
  const { settings } = useSettings();
  const { health } = useHealth();
  const [text, setText] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const win = computeWindow(settings.yearsBack);
  const maxChars = health?.limits.maxInputChars ?? 20000;
  const maxMb = health?.limits.maxUploadMb ?? 8;
  // Same rule as the Search page: AI is on when the provider chosen in Settings is set up, and can be turned off there.
  const aiOn = aiUsable(settings.aiProvider, health);
  const canSubmit = text.trim().length >= 2;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) {
      areaRef.current?.focus();
      return;
    }
    const t = text.trim();
    start(t, { origin: 'text', useAI: aiOn });
    navigate(ROUTES.research + (t.length <= 300 ? `?q=${encodeURIComponent(t)}` : ''));
  };

  return (
    <div className="lp">
      {/* ---------- Hero ---------- */}
      <section className="lp-hero lp-wrap" aria-labelledby={`${id}-h1`}>
        <div className="lp-hero__text">
          <p className="label lp-eyebrow">Academic research discovery</p>
          <h1 id={`${id}-h1`}>Find the research behind your question.</h1>
          <p className="lp-lead">
            Explore recent studies from OpenAlex and Crossref. Build your reading list, follow related ideas, and cite the original sources.
          </p>
          <ul className="lp-facts">
            <li><Database size={16} aria-hidden="true" /> Records from OpenAlex and Crossref</li>
            <li><ShieldCheck size={16} aria-hidden="true" /> DOIs checked against Crossref</li>
            <li><Quote size={16} aria-hidden="true" /> APA 7, MLA 9 and Chicago 17</li>
          </ul>
          <p className="lp-note">No account needed. Uploaded files are read in server memory and are not saved.</p>
        </div>

        <form className="panel lp-composer" onSubmit={submit}>
          <div className="lp-composer__head">
            <label htmlFor={`${id}-t`} className="lp-composer__title">What are you researching?</label>
            <span className="lp-note lp-note--sm">Research window: {win.label}</span>
          </div>
          <textarea
            ref={areaRef} id={`${id}-t`} className="input textarea" rows={5} maxLength={maxChars} value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            placeholder="A question, a topic, or an abstract..."
            spellCheck
          />
          <div className="lp-composer__actions">
            <button type="submit" className="btn btn--primary btn--lg" disabled={!canSubmit}><Search size={18} aria-hidden="true" /> Analyze Topic</button>
            <Link to={ROUTES.app} className="btn btn--lg"><Upload size={18} aria-hidden="true" /> Upload Document</Link>
          </div>
          <p className="lp-note lp-note--sm">
            PDF, DOCX, TXT or Markdown, up to {nf.format(maxMb)} MB. AI analysis is optional and can be switched off for each search.
          </p>
        </form>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how-it-works" className="lp-section" aria-labelledby={`${id}-how`}>
        <div className="lp-wrap lp-stack">
          <p className="lp-kicker">How it works</p>
          <h2 id={`${id}-how`}>How a search works</h2>
          <ol className="lp-steps">
            <li>
              <span className="lp-step-number" aria-label="Step 1">01</span>
              <h3>Enter a topic or a document</h3>
              <p>Start with a question or upload a document. Relata extracts search terms, with optional AI to explain the topic and suggest related ideas.</p>
            </li>
            <li>
              <span className="lp-step-number" aria-label="Step 2">02</span>
              <h3>Scholarly sources are searched</h3>
              <p>Find studies through OpenAlex, with Crossref checking DOIs and publisher records. Every paper comes from a scholarly index. Duplicates are merged.</p>
            </li>
            <li>
              <span className="lp-step-number" aria-label="Step 3">03</span>
              <h3>Filter, save and cite</h3>
              <p>Filter by date, access or publication type. Save studies in this browser, cite in APA 7, MLA 9 or Chicago 17, and export your reading list.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ---------- What each result shows ---------- */}
      <section className="lp-section lp-section--alt" aria-labelledby={`${id}-res`}>
        <div className="lp-wrap lp-split">
          <div className="lp-stack lp-split__text">
            <p className="lp-kicker lp-kicker--flush">Results</p>
            <h2 id={`${id}-res`}>What each result shows</h2>
            <p>Every result is a record from a scholarly source, with the facts needed to find and cite the original. Relata does not give studies a quality score, and it does not label work as peer-reviewed because the source data does not say so reliably.</p>
            <p>Where an AI note appears, it is labelled and sits apart from the bibliographic details.</p>
          </div>
          <div className="lp-split__demo">
            <div className="study lp-sample" role="group" aria-label="Example result layout with placeholder text">
              <h3 className="study__title">[Study title from the source record]</h3>
              <p className="study__authors">[Authors]</p>
              <p className="study__meta"><span>[Year]</span><span className="study__venue">[Journal]</span><span>Cited by [n]</span></p>
              <div className="badges">
                <Badge tone="ok" icon={<ShieldCheck size={13} aria-hidden="true" />}>Verified DOI</Badge>
                <Badge tone="info">Open Access</Badge>
                <Badge>OpenAlex + Crossref</Badge>
                <Badge>Article</Badge>
              </div>
              <div className="study__ai">
                <div className="study__block">
                  <p className="study__label">Why this is relevant <AITag /></p>
                  <p>[Short note on how this study relates to your topic, written only from the retrieved record.]</p>
                </div>
              </div>
              <p className="study__actions small muted">View study opens the DOI resolver or the source landing page.</p>
            </div>
            <p className="lp-note lp-note--sm">Layout example. Bracketed text is placeholder content, not a real study.</p>
          </div>
        </div>
      </section>

      {/* ---------- Checks ---------- */}
      <section id="checks" className="lp-section" aria-labelledby={`${id}-chk`}>
        <div className="lp-wrap lp-stack">
          <p className="lp-kicker">Verification</p>
          <h2 id={`${id}-chk`}>What Relata checks, and what it says when it cannot</h2>
          <dl className="lp-checks">
            {CHECKS.map((c) => (
              <div key={c.term}>
                <span className="lp-checks__icon">{c.icon}</span>
                <dt>{c.term}</dt>
                <dd>{c.text}</dd>
              </div>
            ))}
          </dl>
          <p className="lp-measure">If the scholarly sources cannot be reached, Relata says so and shows no results. It never fills the gap with generated studies. Results are relevant studies found through the available sources, not a complete list of everything written on a topic.</p>
        </div>
      </section>

      {/* ---------- AI ---------- */}
      <section id="ai" className="lp-section lp-section--alt" aria-labelledby={`${id}-ai`}>
        <div className="lp-wrap lp-stack">
          <p className="lp-kicker">AI use</p>
          <h2 id={`${id}-ai`}>Where AI is used, and where it is not</h2>
          <div className="lp-two">
            <div className="lp-stack lp-stack--sm lp-two__yes">
              <h3><Check size={20} aria-hidden="true" /> AI is used for</h3>
              <ul className="lp-list">
                <li>Finding the main topic and expanding keywords</li>
                <li>Short definitions of concepts</li>
                <li>Suggesting related topics and research directions</li>
                <li>Short relevance notes on studies that were already retrieved</li>
              </ul>
            </div>
            <div className="lp-stack lp-stack--sm lp-two__no">
              <h3><Ban size={20} aria-hidden="true" /> AI is not used for</h3>
              <ul className="lp-list">
                <li>Deciding whether a paper exists</li>
                <li>Adding or changing authors, dates, DOIs or links</li>
                <li>Any statement containing a link, DOI or number that is not in the source record. Those statements are discarded.</li>
              </ul>
            </div>
          </div>
          <p className="lp-measure">Relata can use Google Gemini or OpenAI. Only the opening part of your text is sent, and only when AI is switched on for that search. You can choose a provider in <Link to={ROUTES.settings}>settings</Link>. <Link to={ROUTES.aiUse}>Read the AI disclosure</Link></p>
        </div>
      </section>

      {/* ---------- Data ---------- */}
      <section className="lp-section" aria-labelledby={`${id}-data`}>
        <div className="lp-wrap lp-split">
          <div className="lp-split__text">
            <p className="lp-kicker lp-kicker--flush">Privacy</p>
            <h2 id={`${id}-data`}>Your data stays with you</h2>
          </div>
          <div className="lp-stack lp-stack--sm lp-split__demo">
            <ul className="lp-privacy">
              <li><EyeOff size={18} aria-hidden="true" /><p>There are no accounts, no analytics and no advertising trackers.</p></li>
              <li><FileText size={18} aria-hidden="true" /><p>Uploaded documents are read in server memory and discarded.</p></li>
              <li><Bookmark size={18} aria-hidden="true" /><p>Saved studies, topics, searches and collections are stored in your own browser and can be cleared from settings.</p></li>
            </ul>
            <p><Link to={ROUTES.privacy}>Privacy Policy</Link> · <Link to={ROUTES.terms}>Terms and Conditions</Link></p>
          </div>
        </div>
      </section>

      {/* ---------- Closing call to action ---------- */}
      <section className="lp-cta" aria-labelledby={`${id}-cta`}>
        <div className="lp-wrap lp-cta__in">
          <h2 id={`${id}-cta`}>Start with a topic you are working on now.</h2>
          <Link to={ROUTES.app} className="btn btn--lg lp-cta__btn">Go to the search page <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
      </section>
    </div>
  );
}
