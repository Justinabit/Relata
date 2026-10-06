import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { YearsBack } from '../../shared/types';
import { computeWindow, YEARS_BACK_OPTIONS, yearsLabel } from '../../shared/window';
import { removeKey } from '../lib/storage';
import { useDocumentTitle } from '../lib/router';
import { useHealth } from '../state/health';
import { useLibrary } from '../state/library';
import { useSettings, type ThemePref } from '../state/settings';
import { useToast } from '../state/toast';
import { Badge, Dialog, Section } from '../components/ui';

function Choice<T extends string | number>({ name, legend, value, options, onChange, hint }: {
  name: string; legend: string; value: T; onChange: (v: T) => void; hint?: string;
  options: { v: T; label: string; note?: string; disabled?: boolean }[];
}) {
  return (
    <fieldset className="setting">
      <legend>{legend}</legend>
      <div className="seg seg--wrap">
        {options.map((o) => (
          <label key={String(o.v)} className={`seg__item ${o.disabled ? 'seg__item--disabled' : ''}`}>
            <input type="radio" name={name} checked={value === o.v} disabled={o.disabled} onChange={() => onChange(o.v)} />
            <span>{o.label}{o.note && <small>{o.note}</small>}</span>
          </label>
        ))}
      </div>
      {hint && <p className="small muted">{hint}</p>}
    </fieldset>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { settings, update } = useSettings();
  const { health } = useHealth();
  const lib = useLibrary();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const w = computeWindow(settings.yearsBack);

  return (
    <div className="page page--narrow">
      <header className="pagehead"><h1>Settings</h1><p className="muted">Preferences are saved in this browser. API keys are never entered here: they live in the server’s environment.</p></header>

      <Section title="Appearance">
        <Choice<ThemePref> name="theme" legend="Theme" value={settings.theme} onChange={(v) => update({ theme: v })}
          options={[{ v: 'light', label: 'Light' }, { v: 'dark', label: 'Dark' }, { v: 'system', label: 'System' }]}
          hint="System follows your device setting and updates when it changes." />
      </Section>

      <Section title="AI provider">
        <Choice name="provider" legend="Provider for topic analysis and summaries" value={settings.aiProvider} onChange={(v) => update({ aiProvider: v })}
          options={[
            { v: 'auto', label: 'Automatic', note: 'Primary, then fallback' },
            { v: 'gemini', label: 'Gemini', note: health && !health.ai.gemini ? 'not configured' : undefined },
            { v: 'openai', label: 'OpenAI', note: health && !health.ai.openai ? 'not configured' : undefined },
          ]}
          hint="Automatic tries the server’s primary provider first and uses the other as a fallback. Choosing a specific provider means your text is never sent to the other one." />
      </Section>

      <Section title="Research window">
        <Choice<YearsBack> name="years" legend="Default publication window" value={settings.yearsBack} onChange={(v) => update({ yearsBack: v })}
          options={YEARS_BACK_OPTIONS.map((y) => ({ v: y, label: yearsLabel(y) }))}
          hint={`Currently ${w.label}. The range is calculated from today’s year, so it moves forward automatically. Older work can be included per search from the filter bar and is labelled as outside the window.`} />
        <Choice<10 | 20 | 50> name="perpage" legend="Results per page" value={settings.perPage} onChange={(v) => update({ perPage: v })}
          options={[{ v: 10, label: '10' }, { v: 20, label: '20' }, { v: 50, label: '50' }]}
          hint="Larger pages take longer to verify. Changes apply to your next search." />
      </Section>

      <Section title="Accessibility">
        <label className="switch">
          <input type="checkbox" checked={settings.reducedMotion} onChange={(e) => update({ reducedMotion: e.target.checked })} />
          <span className="switch__track" aria-hidden="true"><i /></span>
          <span>Reduce motion</span>
        </label>
        <p className="small muted">Relata also follows your system’s “reduce motion” preference automatically.</p>
      </Section>

      <Section title="Privacy">
        <p>Saved studies, topics, searches and collections are stored only in this browser. {lib.count ? `You currently have ${lib.data.studies.length} saved ${lib.data.studies.length === 1 ? 'study' : 'studies'}, ${lib.data.topics.length} ${lib.data.topics.length === 1 ? 'topic' : 'topics'} and ${lib.data.queries.length} ${lib.data.queries.length === 1 ? 'search' : 'searches'}.` : 'Your library is empty.'}</p>
        <button type="button" className="btn btn--danger" onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden="true" /> Clear local research data</button>
      </Section>

      <Section title="Server status" hint="What this deployment has configured. Read-only; no keys are shown.">
        {!health ? <p className="muted">Status unavailable.</p> : (
          <ul className="status">
            <li><span>OpenAlex</span>{health.research.openalex.keyConfigured ? <Badge tone="ok">API key configured</Badge> : <Badge tone="warn">No API key (shared keyless budget)</Badge>}</li>
            <li><span>Crossref</span><Badge tone="ok">Enabled</Badge></li>
            <li><span>Gemini</span>{health.ai.gemini ? <Badge tone="ok">Configured</Badge> : <Badge>Not configured</Badge>}</li>
            <li><span>OpenAI</span>{health.ai.openai ? <Badge tone="ok">Configured</Badge> : <Badge>Not configured</Badge>}</li>
            <li><span>Primary AI provider</span><Badge>{health.ai.primary === 'gemini' ? 'Gemini' : 'OpenAI'}</Badge></li>
            <li><span>Uploaded documents</span><Badge tone="ok">Not stored</Badge></li>
          </ul>
        )}
      </Section>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Clear local research data?">
        <p>This permanently deletes your saved studies, topics, searches and collections from this browser. It cannot be undone.</p>
        <div className="row mt14">
          <button type="button" className="btn btn--danger" onClick={() => { lib.clearAll(); removeKey('relata:citestyle'); setConfirm(false); toast('Local research data cleared'); }}>Delete everything</button>
          <button type="button" className="btn" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      </Dialog>
    </div>
  );
}
