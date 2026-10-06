import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { FileText, Search as SearchIcon, ShieldCheck, Upload, X } from 'lucide-react';
import type { UploadResponse } from '../../shared/types';
import { computeWindow } from '../../shared/window';
import { api, ApiError } from '../lib/api';
import { nf, excerpt } from '../lib/format';
import { Link, useDocumentTitle, useRouter } from '../lib/router';
import { ROUTES } from '../lib/routes';
import { useHealth } from '../state/health';
import { useLibrary } from '../state/library';
import { useResearch } from '../state/research';
import { useSettings } from '../state/settings';
import { TrustPanel } from '../components/Panels';
import { Callout } from '../components/ui';

const EXAMPLES = [
  'Effects of AI on student learning',
  'Climate change and agricultural productivity',
  'Social media and mental health',
  'Arduino-based smart irrigation systems',
  'Machine learning in healthcare',
];
const ACCEPT = '.pdf,.docx,.txt,.md,.markdown';
const EXT_OK = /\.(pdf|docx|txt|md|markdown)$/i;
export const UNSUPPORTED = "This file type isn't supported. Please upload a PDF, DOCX, TXT, or Markdown file.";

function providerNames(pref: string, h: ReturnType<typeof useHealth>['health']): string {
  if (!h) return 'an AI provider';
  const label = { gemini: 'Google Gemini', openai: 'OpenAI' } as const;
  if (pref === 'gemini' || pref === 'openai') return label[pref];
  const order = h.ai.primary === 'gemini' ? (['gemini', 'openai'] as const) : (['openai', 'gemini'] as const);
  const on = order.filter((p) => h.ai[p]);
  return on.length === 2 ? `${label[on[0]]} (with ${label[on[1]]} as a fallback)` : label[on[0]];
}

export default function SearchPage() {
  useDocumentTitle('');
  const { start } = useResearch();
  const { navigate } = useRouter();
  const { settings } = useSettings();
  const { health } = useHealth();
  const lib = useLibrary();
  const [text, setText] = useState('');
  const [useAI, setUseAI] = useState(true);
  const [doc, setDoc] = useState<UploadResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const uploadCtl = useRef<AbortController | null>(null);
  const id = useId();
  const win = computeWindow(settings.yearsBack);
  const maxChars = health?.limits.maxInputChars ?? 20000;
  const maxMb = health?.limits.maxUploadMb ?? 8;
  const aiAvailable = health ? health.ai.anyConfigured : true;
  const aiOn = useAI && aiAvailable;
  const aiChars = health?.limits.aiInputChars ?? 6000;
  const canSubmit = doc ? true : text.trim().length >= 2;

  useEffect(() => () => uploadCtl.current?.abort(), []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) {
      areaRef.current?.focus();
      return;
    }
    if (doc) {
      start(doc.text, { origin: 'document', docName: doc.fileName, useAI: aiOn });
      navigate(ROUTES.research);
    } else {
      const t = text.trim();
      start(t, { origin: 'text', useAI: aiOn });
      navigate(ROUTES.research + (t.length <= 300 ? `?q=${encodeURIComponent(t)}` : ''));
    }
  };

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    setUploadError(null);
    if (!EXT_OK.test(file.name)) return setUploadError(UNSUPPORTED);
    if (file.size > maxMb * 1048576) return setUploadError(`This file is larger than the ${maxMb} MB limit.`);
    uploadCtl.current?.abort();
    const c = new AbortController();
    uploadCtl.current = c;
    setUploading(true);
    try {
      setDoc(await api.upload(file, c.signal));
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setUploadError(e instanceof ApiError ? e.message : 'The file could not be processed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    void handleFile(e.dataTransfer.files?.[0]);
  };

  const savedQueries = useMemo(() => lib.data.queries.slice(0, 4), [lib.data.queries]);

  return (
    <div className="page page--search">
      <div className="intro">
        <p className="label">Your research starts here</p>
        <h1>What would you like to explore?</h1>
        <p className="intro__sub">Start with a question, a passage, or a document. Find recent studies and the sources behind them.</p>
      </div>

      <form className={`composer ${drag ? 'composer--drag' : ''}`} onSubmit={submit} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false); }} onDrop={onDrop} aria-describedby={`${id}-notes`}>
        <div className="composer__head">
          <h2 id={`${id}-h`}>What are you researching?</h2>
          <p className="composer__window">Research window: <strong>{win.label}</strong> · <Link to={ROUTES.settings}>change</Link></p>
        </div>

        {doc ? (
          <div className="doc" aria-live="polite">
            <div className="doc__head">
              <FileText size={20} aria-hidden="true" />
              <div className="doc__meta">
                <p className="doc__name">{doc.fileName}</p>
                <p className="small muted">
                  {doc.kind.toUpperCase()} · {nf.format(doc.charCount)} characters{doc.pageCount ? ` · ${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'}` : ''}
                  {doc.truncated ? ` · only the first ${nf.format(doc.text.length)} characters were kept` : ''}
                </p>
              </div>
              <button type="button" className="btn btn--icon" onClick={() => setDoc(null)} aria-label="Remove document"><X size={18} aria-hidden="true" /></button>
            </div>
            <h3 className="label">Extracted text preview</h3>
            <pre className="doc__preview" tabIndex={0} aria-label="Extracted text preview">{excerpt(doc.text, 1400)}</pre>
            <p className="small muted">Review this to confirm the right text was extracted. Analysis uses the opening part of the document: it looks for the main topic, keywords and related studies.</p>
          </div>
        ) : (
          <>
            <textarea
              ref={areaRef} id={`${id}-t`} className="input textarea" aria-labelledby={`${id}-h`} rows={5} maxLength={maxChars} value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
              placeholder="Paste a topic, lesson, research question, abstract, or study here..."
              spellCheck
            />
            {text.length > maxChars * 0.7 && <p className="small muted right">{nf.format(text.length)} / {nf.format(maxChars)}</p>}
          </>
        )}

        {uploadError && <Callout tone="danger" live="assertive" title={uploadError === UNSUPPORTED ? 'Unsupported file' : 'Upload problem'}>{uploadError}</Callout>}

        <div className="composer__actions">
          <button type="submit" className="btn btn--primary btn--lg" disabled={!canSubmit || uploading}>
            <SearchIcon size={18} aria-hidden="true" /> Analyze Topic
          </button>
          <input ref={fileRef} type="file" accept={ACCEPT} className="sr-only" id={`${id}-f`} onChange={(e) => void handleFile(e.target.files?.[0])} tabIndex={-1} aria-hidden="true" />
          <button type="button" className="btn btn--lg" onClick={() => fileRef.current?.click()} disabled={uploading} aria-describedby={`${id}-types`}>
            <Upload size={18} aria-hidden="true" /> {uploading ? 'Reading file…' : 'Upload Document'}
          </button>
          <span id={`${id}-types`} className="composer__types">PDF, DOCX, TXT or Markdown · up to {maxMb} MB</span>
        </div>

        <div id={`${id}-notes`} className="composer__notes">
          <label className={`switch ${!aiAvailable ? 'switch--off' : ''}`}>
            <input type="checkbox" checked={aiOn} disabled={!aiAvailable} onChange={(e) => setUseAI(e.target.checked)} />
            <span className="switch__track" aria-hidden="true"><i /></span>
            <span>Use AI to analyze the topic</span>
          </label>
          <p className="small muted">
            {!aiAvailable
              ? 'AI analysis is not set up on this server, so Relata will search using keywords extracted from your text. Verified scholarly search works either way.'
              : aiOn
                ? <>The first {nf.format(aiChars)} characters of your text are sent to {providerNames(settings.aiProvider, health)} to extract topics and keywords. Search keywords are sent to OpenAlex and Crossref. <Link to={ROUTES.aiUse}>AI disclosure</Link></>
                : 'AI is off for this search. Your text stays on this server and only extracted keywords are sent to OpenAlex and Crossref.'}
          </p>
          {doc || uploading ? (
            <p className="small muted"><ShieldCheck size={14} aria-hidden="true" className="inline" /> Uploaded documents are processed for analysis and are not permanently stored by default. Text is read in server memory and discarded; nothing is written to disk.</p>
          ) : null}
        </div>
      </form>

      <div className="search-lower">
        <section aria-labelledby={`${id}-ex`} className="examples">
          <h2 id={`${id}-ex`} className="label">Try an example</h2>
          <ul className="examples__list">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button type="button" className="example" onClick={() => { setDoc(null); setText(ex); areaRef.current?.focus(); }}>{ex}</button>
              </li>
            ))}
          </ul>
          {savedQueries.length > 0 && (
            <>
              <h2 className="label mt14">Saved searches</h2>
              <ul className="examples__list">
                {savedQueries.map((q) => (
                  <li key={q.text}><button type="button" className="example example--saved" onClick={() => { setDoc(null); setText(q.text); areaRef.current?.focus(); }}>{excerpt(q.text, 80)}</button></li>
                ))}
              </ul>
            </>
          )}
        </section>
        <TrustPanel defaultOpen />
      </div>
    </div>
  );
}
