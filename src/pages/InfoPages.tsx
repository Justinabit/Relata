import type { ReactNode } from 'react';
import { Link, useDocumentTitle } from '../lib/router';
import { firstRun, useFirstRun } from '../state/firstrun';
import { useHealth } from '../state/health';
import { Callout } from '../components/ui';

const UPDATED = '2 October 2026';

function Doc({ title, lead, draft, children }: { title: string; lead?: ReactNode; draft?: boolean; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <article className="page page--doc">
      <header className="pagehead">
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
        {draft !== false && <p className="small muted">Last updated {UPDATED}</p>}
      </header>
      {draft && (
        <Callout tone="warn" title="Draft text for a personal-use deployment">
          This document describes how Relata is built to behave. It has not been reviewed by a lawyer. Have it reviewed, and complete the operator details, before any public or commercial deployment.
        </Callout>
      )}
      <div className="prose">{children}</div>
    </article>
  );
}

function ContactLine() {
  const { health } = useHealth();
  return health?.contactEmail
    ? <a href={`mailto:${health.contactEmail}`}>{health.contactEmail}</a>
    : <em>no contact address has been configured yet. The operator should set CONTACT_EMAIL before publishing</em>;
}

/* ------------------------------------------------------------------ About */
export function AboutPage() {
  return (
    <Doc title="About Relata" lead="Relata helps you start a research project: it turns a topic, question or document into recent, verifiable scholarly sources, related concepts and a transparent search trail." draft={false}>
      <h2>What it does</h2>
      <p>Paste a lesson topic, research question, abstract or keyword, or upload a PDF, DOCX, TXT or Markdown file. Relata identifies the main topic and key concepts, searches scholarly databases, and lists related studies with their authors, year, journal, DOI and a link to the original source. It also shows themes, authors who recur across the retrieved studies, and where the retrieved literature appears thinner.</p>

      <h2>How research is retrieved</h2>
      <p>Every study you see comes from a scholarly metadata service, never from an AI model. <strong>OpenAlex</strong> is the primary discovery source. <strong>Crossref</strong> verifies DOIs and publisher-deposited metadata, and can also be searched directly. Relata then merges duplicates (by DOI, OpenAlex ID, PubMed ID, or normalised title + author + year), checks dates, links and metadata, and ranks the results. If OpenAlex is unavailable, Relata says so and falls back to Crossref results. It never fills the gap with generated studies.</p>

      <h2>How AI is used</h2>
      <p>AI (Google Gemini or OpenAI, with an optional fallback) is used for topic analysis, keyword expansion, concept definitions, and short relevance notes and summaries of studies that have already been retrieved. AI never decides whether a paper exists and cannot add, change or overwrite bibliographic metadata. Its output is checked against a schema, and statements with links, DOIs, citation-like text or numbers that are not in the source record are discarded. Details are on the <Link to="/ai-use">AI Disclosure</Link> page.</p>

      <h2>How sources are verified</h2>
      <ul>
        <li><strong>Dates</strong>: a study without a valid publication date or year is excluded, as is anything outside your selected research window.</li>
        <li><strong>DOIs</strong>: only DOIs returned by a source are shown. OpenAlex DOIs are checked against Crossref and labelled “Verified DOI”, “DOI not found in Crossref” or “DOI unchecked”.</li>
        <li><strong>Links</strong>: study links are the DOI resolver URL or a landing-page URL returned by a source. If neither exists, Relata shows “Source link unavailable”.</li>
        <li><strong>Conflicts</strong>: when OpenAlex and Crossref disagree, Relata shows “Metadata conflict detected”, lists both values, and displays Crossref’s values under a fixed priority rule.</li>
        <li><strong>Peer review</strong>: Relata does not label work “peer-reviewed”, because the metadata it receives does not reliably say so. It shows publication type, venue, year and citation count as factual indicators, with no quality score.</li>
      </ul>

      <h2>Why only recent research by default</h2>
      <p>Many assignments and literature reviews ask for sources from roughly the last ten years. Relata’s default window is the current year minus ten, calculated every time, so it moves forward each January. You can narrow it to 1, 3 or 5 years, or deliberately include older work. Older results are then clearly labelled as outside the default window.</p>

      <h2>Privacy principles</h2>
      <p>No accounts, no analytics and no advertising trackers. Uploaded documents are read in server memory and discarded; they are not saved. Only the opening part of your text is sent to an AI provider, and only if AI is switched on. Saved items stay in your browser. Read the <Link to="/privacy">Privacy Policy</Link> for specifics.</p>

      <h2>Limits you should know about</h2>
      <ul>
        <li>Results are relevant studies found through the available sources and search strategy. They are not all studies on your topic, and this is not a systematic literature review.</li>
        <li>Scholarly indexes have gaps, especially for non-English, very new, or regional work. Abstracts are missing for many records, which limits summaries.</li>
        <li>“Research gaps” compare concepts within the retrieved set only. They are prompts for investigation, not findings.</li>
        <li>Scanned PDFs are not supported (no OCR).</li>
      </ul>

      <h2>Roadmap</h2>
      <p>Possible future work, not promises: additional sources (PubMed, Semantic Scholar, arXiv, DOAJ, CORE, institutional repositories), user accounts with cloud-saved libraries, collections with notes and tags, search history, and richer citation exports. Account features are not implemented, and the code is structured so they can be added later without a rewrite.</p>

      <h2>About the name</h2>
      <p><em>Relata</em> is the Latin plural of <em>relatum</em>, “things that are related”. Other, unrelated projects and products also use the name “Relata”, including an experimental scholarly-indexing tool from MIT and the Society for Cultural Anthropology. Check for conflicts before using the name publicly.</p>
    </Doc>
  );
}

/* ---------------------------------------------------------------- Privacy */
export function PrivacyPage() {
  return (
    <Doc title="Privacy Policy" lead="Relata is designed to collect as little as possible. This page explains what is processed, by whom, and for how long." draft>
      <h2>1. Who operates Relata</h2>
      <p>Relata is a personal research tool operated by an individual (the “operator”), who is based in the Philippines. Contact: <ContactLine />.</p>

      <h2>2. What data is processed</h2>
      <ul>
        <li><strong>Search text you enter</strong> (topics, questions, passages). It is sent to the Relata server. Short search terms derived from it are sent to OpenAlex and Crossref to find studies. If AI analysis is on, up to the first 6,000 characters are sent to the AI provider you selected (Google Gemini or OpenAI).</li>
        <li><strong>Uploaded documents.</strong> The file is read in server memory to extract text, then discarded when the request ends. It is never written to disk, never cached, and never logged. The extracted text is returned to your browser. If AI is on, only the opening part is sent to the AI provider, as described above. Do not upload documents that contain personal information about other people.</li>
        <li><strong>Technical data.</strong> Your IP address is used in memory to apply rate limits. Server logs record the request method, path, status code and duration. They do not record search text, query strings or document contents.</li>
        <li><strong>Server memory caches.</strong> To save cost and time, the server keeps scholarly metadata, AI analysis of short typed searches (keyed by a hash), and AI study notes in memory for a limited time (by default 15 minutes for search results, 1 hour for analyses, up to 24 hours for DOI lookups). Caches are cleared when the server restarts and are never used to identify you.</li>
      </ul>

      <h2>3. What is not collected</h2>
      <p>Relata has no accounts or login, and it does not use analytics, advertising or tracking scripts, or fingerprinting. It does not sell or share data for marketing. It does not set cookies (see the <Link to="/cookies">Cookie Policy</Link>).</p>

      <h2>4. Data stored in your browser</h2>
      <p>Relata stores your preferences, saved studies, topics, searches and collections, and your chosen citation style, in your browser’s local storage. This never leaves your device unless you export it. You can delete it at any time under Settings → Clear local research data.</p>

      <h2>5. Third-party services</h2>
      <ul>
        <li><strong>OpenAlex</strong> (openalex.org) and <strong>Crossref</strong> (crossref.org) receive search terms and DOIs from the Relata server. They see the server’s IP address, not yours.</li>
        <li><strong>Google (Gemini)</strong> and <strong>OpenAI</strong> receive text only if AI is switched on and configured. Under “Automatic” the second provider is used only when the first fails. If you pick a specific provider in Settings, the other is never used. Each provider handles data under its own terms and privacy policy; review them before sending sensitive material.</li>
        <li>When you open a study link, you leave Relata and the destination site’s policies apply.</li>
        <li>Fonts are bundled with the app and are not loaded from a third party.</li>
      </ul>

      <h2>6. Retention</h2>
      <p>Uploaded documents: not retained. Server caches: in memory only, for the periods above. Local-storage data: until you delete it. The operator may configure shorter cache periods through environment settings.</p>

      <h2>7. Security</h2>
      <p>API keys are held only in server environment variables and are never sent to the browser. Requests are validated, rate-limited and time-limited; uploads are checked for type, size and signature and are never executed; outbound requests go only to a fixed list of API hosts. Deploy Relata behind HTTPS. No system is perfectly secure, so avoid uploading highly sensitive or unpublished material unless you have reviewed the AI and hosting configuration.</p>

      <h2>8. Your rights</h2>
      <p>In the Philippines, the Data Privacy Act of 2012 (Republic Act No. 10173) gives individuals rights over their personal data, including to be informed, to access, to object, to correct, to erase or block, and to claim damages. The National Privacy Commission (privacy.gov.ph) handles complaints. Because Relata keeps no account data and no per-person records on the server, there is generally nothing to retrieve or erase beyond what is in your own browser, but you can contact the operator with any request. This draft does not claim compliance with the GDPR, the CCPA or any other regime, and the operator should confirm which obligations apply before a public launch.</p>

      <h2>9. Changes</h2>
      <p>If this policy changes, the “last updated” date above will change. Material changes to what is collected should be announced on this page before they take effect.</p>

      <h2>10. Contact</h2>
      <p><ContactLine />.</p>
    </Doc>
  );
}

/* ---------------------------------------------------------------- Cookies */
function CookieChoice() {
  const { cookies } = useFirstRun();
  const status =
    cookies === 'accepted' ? 'You accepted cookies on this device.'
    : cookies === 'closed' ? 'You closed the cookie notice without accepting.'
    : 'You have not answered the cookie notice yet. It is shown at the bottom of the page.';
  return (
    <>
      <h2 id="your-choice">Your cookie setting</h2>
      <p>{status}</p>
      {cookies !== null && <p><button type="button" className="btn btn--sm" onClick={firstRun.resetCookies}>Change my choice</button></p>}
    </>
  );
}

export function CookiesPage() {
  return (
    <Doc title="Cookie Policy" lead="Relata does not use cookies." draft>
      <h2>Cookies</h2>
      <p>Relata itself does not set or read any cookies: no essential, preference, analytics, advertising or third-party cookies. There is no login or session cookie because there are no accounts.</p>

      <h2>Local storage</h2>
      <p>Relata uses your browser’s local storage, which is separate from cookies and is not sent to the server with requests. It keeps these items on your device:</p>
      <table className="table">
        <thead><tr><th scope="col">Key</th><th scope="col">Purpose</th></tr></thead>
        <tbody>
          <tr><th scope="row"><code>relata:settings:v1</code></th><td>Theme, AI provider preference, research window, results per page, reduced-motion setting.</td></tr>
          <tr><th scope="row"><code>relata:library:v1</code></th><td>Your saved studies (verified metadata), topics, searches and collections.</td></tr>
          <tr><th scope="row"><code>relata:terms:v1</code></th><td>The date you accepted the Terms and Conditions summary, so the popup is not shown again.</td></tr>
          <tr><th scope="row"><code>relata:onboarded:v1</code></th><td>Whether you have seen or skipped the first-visit introduction.</td></tr>
          <tr><th scope="row"><code>relata:cookies:v1</code></th><td>Your answer to the cookie notice: accepted, or closed.</td></tr>
          <tr><th scope="row"><code>relata:citestyle</code></th><td>Your last-used citation style (APA, MLA or Chicago).</td></tr>
        </tbody>
      </table>
      <p>Delete these any time with Settings → Clear local research data, or through your browser’s site-data controls.</p>

      <CookieChoice />

      <h2>Third parties</h2>
      <p>Relata does not embed third-party scripts, fonts or widgets that could set cookies. Sites you reach through study links, such as publishers, may set their own cookies under their own policies.</p>

      <h2>Changes</h2>
      <p>If Relata ever adds cookies, for example for accounts, this page will be updated first.</p>
    </Doc>
  );
}

/* ------------------------------------------------------------------ Terms */
export function TermsPage() {
  return (
    <Doc title="Terms and Conditions" lead="By using Relata you agree to these terms." draft>
      <h2>1. Acceptable use</h2>
      <p>Use Relata lawfully and for research, study and teaching. Do not attempt to overload, probe or bypass its protections (rate limits, file limits), upload malware, scrape the service at scale, or use it to harass others or to infringe someone’s rights. Do not upload material you have no right to process.</p>

      <h2>2. Academic use and limitations</h2>
      <p>Relata is a discovery tool. It is not a substitute for reading and evaluating the original publications, and you remain responsible for the accuracy, citation and integrity of your own work, including following your institution’s academic-integrity rules. Search results are not a systematic literature review.</p>

      <h2>3. AI limitations</h2>
      <p>AI-generated definitions, topic suggestions, relevance notes and summaries can be incomplete or wrong, even though Relata restricts them to retrieved metadata and filters risky output. Always verify against the original source. See the <Link to="/ai-use">AI Disclosure</Link>.</p>

      <h2>4. Research accuracy</h2>
      <p>Bibliographic details come from third-party indexes and may contain errors, omissions or delays. Relata flags conflicts it detects but cannot guarantee that any record is complete or correct. Absence of a study from the results does not mean it does not exist.</p>

      <h2>5. Third-party sources</h2>
      <p>OpenAlex, Crossref and AI providers are independent services with their own terms. Relata is not affiliated with or endorsed by them. Their availability, rate limits and costs may affect Relata.</p>

      <h2>6. Intellectual property</h2>
      <p>Relata’s software and design belong to its operator. Bibliographic metadata is provided by OpenAlex (CC0) and Crossref and remains subject to their terms. Abstracts and publications belong to their authors and publishers. Relata links to them and does not republish full texts. You keep the rights to text you submit.</p>

      <h2>7. External links</h2>
      <p>Links lead to sites Relata does not control. Relata is not responsible for their content or practices.</p>

      <h2>8. Service availability</h2>
      <p>Relata is provided as-is and may be changed, limited or taken offline at any time, including when upstream services or API budgets are unavailable.</p>

      <h2>9. Limitation of liability</h2>
      <p>To the fullest extent allowed by law, the operator is not liable for indirect or consequential loss, or for any loss arising from reliance on search results or AI-generated text. Nothing here limits liability that cannot be limited by law.</p>

      <h2>10. Changes to the service and terms</h2>
      <p>Features and these terms may change. The “last updated” date will change with them. Continued use means you accept the updated terms.</p>

      <h2>11. Contact</h2>
      <p><ContactLine />.</p>
    </Doc>
  );
}

/* ------------------------------------------------------------- Disclaimer */
export function DisclaimerPage() {
  return (
    <Doc title="Academic Disclaimer" draft={false}>
      <Callout tone="info" title="Please read">
        This application is a research discovery and educational assistance tool. It is not a substitute for reading and evaluating original scholarly publications. AI-generated summaries may contain errors and should be verified against the original source.
      </Callout>
      <h2>Not a systematic literature review</h2>
      <p>Search results are not a systematic literature review. They are relevant studies found through the available sources and search strategy. They are not all studies about your topic. A systematic review requires a documented protocol, multiple databases, defined inclusion criteria and independent screening, none of which Relata performs or validates.</p>
      <h2>Verify before you cite</h2>
      <p>Open the original source, read the publication, and confirm title, authors, date, DOI and findings before citing. Citation text produced by Relata is formatted from retrieved metadata and may be incomplete; unavailable fields are marked with placeholders such as “[Author unavailable]”.</p>
      <h2>What the indicators mean</h2>
      <p>Citation counts, publication year, open-access status and indexing are factual metadata. They are not measures of quality, and Relata has no quality score. “Search relevance” only describes how strongly a record matched your search terms. Relata does not assert that a work is peer-reviewed.</p>
      <h2>Research gaps</h2>
      <p>Gap signals compare concepts within the retrieved set only. They are a preliminary literature-discovery signal, not evidence that a topic is unstudied.</p>
    </Doc>
  );
}

/* --------------------------------------------------------------- AI Use */
export function AiUsePage() {
  return (
    <Doc title="AI Disclosure" lead="Where AI is used in Relata, what it is allowed to touch, and what it never does." draft={false}>
      <div className="two-col">
        <section className="panel" aria-labelledby="ai-gen">
          <h2 id="ai-gen" className="panel__title">AI-generated</h2>
          <ul>
            <li>Topic overview: definition, plain-language explanation, academic field</li>
            <li>Query expansion and suggested keywords</li>
            <li>Related-topic cards and concept explanations</li>
            <li>Possible research directions (suggestions only)</li>
            <li>Per-study “Why this is relevant” notes and summaries</li>
          </ul>
          <p className="small muted">Shown with an “AI-generated” label.</p>
        </section>
        <section className="panel" aria-labelledby="ai-src">
          <h2 id="ai-src" className="panel__title">Source-verified</h2>
          <ul>
            <li>Title and authors</li>
            <li>Publication date and year</li>
            <li>DOI and source link</li>
            <li>Journal / source and publisher</li>
            <li>Citation count, open-access status, publication type</li>
            <li>Topic tags, abstracts, and the database record itself</li>
          </ul>
          <p className="small muted">Comes from OpenAlex and/or Crossref. AI cannot create or modify these fields.</p>
        </section>
      </div>

      <div className="prose">
        <h2>What AI is used for</h2>
        <p>Query expansion, topic classification, definition generation, summarisation of retrieved records, relationship identification and search assistance.</p>

        <h2>Safeguards</h2>
        <ul>
          <li><strong>No invented research.</strong> The AI never supplies the list of studies. Studies come only from scholarly APIs, and the summary step receives records by server-side ID. A client cannot submit its own “study” to be summarised.</li>
          <li><strong>Grounding.</strong> Summaries use only the title, venue, topics and abstract of the retrieved record. Records without enough abstract text get no summary, and the card says so.</li>
          <li><strong>Output validation.</strong> AI output must match a strict schema. Malformed output is rejected. Text containing links, DOIs, citation-like phrases (“Smith et al. (2024)”) or numbers that do not appear in the source is dropped. AI-supplied IDs, DOIs, URLs, dates or authors can never overwrite database metadata.</li>
          <li><strong>Prompt-injection resistance.</strong> System instructions, the request, document text and external abstracts are kept in separate, fenced sections. Anything inside document or source text is treated as data to analyse, never as instructions. The AI has no tools, files or network access and no access to keys.</li>
          <li><strong>Minimum data.</strong> Only the opening part of your text (6,000 characters by default) is sent, and only when AI is on. Search terms, not documents, go to OpenAlex and Crossref.</li>
          <li><strong>Graceful failure.</strong> If the primary provider fails, the other may be tried (in Automatic mode). If both fail, Relata shows “AI analysis is temporarily unavailable. You can still search verified scholarly sources.” and the search keeps working. It does not make up an answer.</li>
        </ul>

        <h2>Providers</h2>
        <p>Google Gemini and OpenAI, selectable in Settings. Keys are server-side environment variables. Their handling of the text you send is governed by their own terms.</p>

        <h2>Web search grounding</h2>
        <p>Relata does not use AI web-search grounding in this version. Every result shown is a scholarly record from OpenAlex or Crossref. If web sources are ever added, they will be labelled as web sources and never presented as studies.</p>

        <h2>Known limits</h2>
        <p>AI can misread a text, omit nuance, or phrase relevance too confidently. The rules above reduce but cannot eliminate this. Treat AI text as a starting point and read the source. See the <Link to="/disclaimer">Academic Disclaimer</Link>.</p>
      </div>
    </Doc>
  );
}

/* ---------------------------------------------------------------- Contact */
export function ContactPage() {
  return (
    <Doc title="Contact" draft={false}>
      <p>Questions about Relata, privacy requests, or corrections: <ContactLine />.</p>
      <p>To report a wrong or missing record in a scholarly index, contact the index itself: Relata displays what OpenAlex and Crossref provide and cannot edit it.</p>
    </Doc>
  );
}
