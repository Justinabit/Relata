import { useId, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { SearchFilters, SourceId, TypeFilter, YearsBack } from '../../shared/types';
import { capabilitiesFor, SOURCE_CAPABILITIES, TYPE_LABELS } from '../../shared/capabilities';
import { HISTORICAL_YEARS_OPTIONS, YEARS_BACK_OPTIONS, yearsLabel } from '../../shared/window';

const SORTS = [
  { v: 'relevance', l: 'Relevance' },
  { v: 'newest', l: 'Newest' },
  { v: 'oldest', l: 'Oldest' },
  { v: 'cited', l: 'Most cited' },
] as const;

export function FilterBar({ filters, onChange, defaultYears = 10 }: { filters: SearchFilters; onChange: (p: Partial<SearchFilters>) => void; defaultYears?: number }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const id = useId();
  const caps = capabilitiesFor(filters.sources);
  const active =
    (filters.yearsBack !== defaultYears ? 1 : 0) + (filters.type !== 'any' ? 1 : 0) + (filters.openAccessOnly ? 1 : 0) + (filters.sort !== 'relevance' ? 1 : 0) + (filters.sources.length !== 1 || filters.sources[0] !== 'openalex' ? 1 : 0);

  const toggleSource = (s: SourceId, on: boolean) => {
    const next = on ? [...new Set([...filters.sources, s])] : filters.sources.filter((x) => x !== s);
    if (next.length) onChange({ sources: next });
  };

  return (
    <div className="filterbar" role="group" aria-label="Search filters">
      <button type="button" className="btn filterbar__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={16} aria-hidden="true" /> Filters &amp; sort{active > 0 && <span className="filterbar__count">{active}</span>}
      </button>
      <div id={panelId} className="filterbar__panel" hidden={!open}>
        <div className="field">
          <label htmlFor={`${id}-date`}>Publication date</label>
          <select id={`${id}-date`} className="select" value={filters.yearsBack} onChange={(e) => onChange({ yearsBack: Number(e.target.value) as YearsBack })}>
            {YEARS_BACK_OPTIONS.map((y) => <option key={y} value={y}>{yearsLabel(y)}{y === defaultYears ? ' (default)' : ''}</option>)}
            <optgroup label="Outside the default 10-year window">
              {HISTORICAL_YEARS_OPTIONS.map((y) => <option key={y} value={y}>{yearsLabel(y)}</option>)}
            </optgroup>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-sort`}>Sort by</label>
          <select id={`${id}-sort`} className="select" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SearchFilters['sort'] })}>
            {SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-type`}>Publication type</label>
          <select id={`${id}-type`} className="select" value={filters.type} onChange={(e) => onChange({ type: e.target.value as TypeFilter })}>
            <option value="any">All types</option>
            {caps.types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-oa`}>Availability</label>
          <select
            id={`${id}-oa`} className="select" disabled={!caps.openAccessFilter} value={filters.openAccessOnly ? 'oa' : 'all'}
            onChange={(e) => onChange({ openAccessOnly: e.target.value === 'oa' })}
            aria-describedby={!caps.openAccessFilter ? `${id}-oa-hint` : undefined}
          >
            <option value="all">All</option>
            <option value="oa">Open access</option>
          </select>
          {!caps.openAccessFilter && <span id={`${id}-oa-hint`} className="field__hint">Crossref does not report open-access status.</span>}
        </div>
        <fieldset className="field field--sources">
          <legend>Sources</legend>
          <div className="checks">
            {(Object.keys(SOURCE_CAPABILITIES) as SourceId[]).map((s) => (
              <label key={s} className="check">
                <input type="checkbox" checked={filters.sources.includes(s)} onChange={(e) => toggleSource(s, e.target.checked)} />
                <span>{SOURCE_CAPABILITIES[s].label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      {filters.sort === 'cited' && (
        <p className="filterbar__note">Citation count shows how often a work has been cited. It is not a measure of research quality.</p>
      )}
      {filters.yearsBack > 10 && (
        <p className="filterbar__note filterbar__note--warn">Outside the default 10-year research window: older studies are included.</p>
      )}
    </div>
  );
}
