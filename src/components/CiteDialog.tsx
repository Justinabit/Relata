import { useEffect, useMemo, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import type { Study } from '../../shared/types';
import { CITATION_STYLES, formatBibliography, formatCitation, studyInfoText, type CitationStyle } from '../../shared/citations';
import { copyText, download, studiesToCsv, studiesToJson } from '../lib/export';
import { readString, writeString } from '../lib/storage';
import { useToast } from '../state/toast';
import { Dialog } from './ui';

export interface CiteTarget {
  title: string;
  studies: Study[];
  query?: string;
}

/** Citation + export dialog. Everything shown is generated from verified metadata only. */
export function CiteDialog({ target, onClose }: { target: CiteTarget | null; onClose: () => void }) {
  const [style, setStyle] = useState<CitationStyle>(() => {
    const saved = readString('relata:citestyle');
    return CITATION_STYLES.some((x) => x.id === saved) ? (saved as CitationStyle) : 'apa';
  });
  const toast = useToast();
  useEffect(() => {
    writeString('relata:citestyle', style);
  }, [style]);
  const studies = target?.studies ?? [];
  const single = studies.length === 1;
  const text = useMemo(() => (single ? formatCitation(studies[0], style) : formatBibliography(studies, style)), [studies, single, style]);
  const missing = studies.filter((s) => !s.authors.length || !s.journal).length;

  const copy = async (value: string, msg: string) => toast((await copyText(value)) ? msg : 'Copy failed. Select the text and copy it manually.');
  const slug = (target?.query ?? 'relata').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'relata';

  return (
    <Dialog open={!!target} onClose={onClose} title={target?.title ?? ''} wide>
      <fieldset className="seg" aria-label="Citation style">
        <legend className="sr-only">Citation style</legend>
        {CITATION_STYLES.map((s) => (
          <label key={s.id} className="seg__item">
            <input type="radio" name="cite-style" value={s.id} checked={style === s.id} onChange={() => setStyle(s.id)} />
            <span>{s.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="sr-only" htmlFor="cite-text">{single ? 'Citation' : 'Bibliography'}</label>
      <textarea id="cite-text" className="input input--mono cite-text" readOnly value={text} rows={single ? 5 : 10} onFocus={(e) => e.currentTarget.select()} />
      <p className="small muted">
        Built only from verified metadata. Unavailable fields are shown as placeholders such as “[Author unavailable]”, never guessed.
        {missing > 0 && ` ${missing} of ${studies.length} ${missing === 1 ? 'record has' : 'records have'} incomplete metadata.`} Check formatting against your style guide before submitting.
      </p>
      <div className="row row--wrap mt14">
        <button type="button" className="btn btn--primary" onClick={() => copy(text, single ? 'Citation copied' : 'Bibliography copied')}>
          <Copy size={16} aria-hidden="true" /> Copy {single ? 'citation' : 'bibliography'}
        </button>
        {single && (
          <button type="button" className="btn" onClick={() => copy(studyInfoText(studies[0] as Study & { url: string | null }), 'Study information copied')}>
            <Copy size={16} aria-hidden="true" /> Copy study information
          </button>
        )}
        <button type="button" className="btn" onClick={() => download(`${slug}-bibliography-${style}.txt`, text + '\n', 'text/plain')}>
          <Download size={16} aria-hidden="true" /> Download .txt
        </button>
        {!single && (
          <>
            <button type="button" className="btn" onClick={() => download(`${slug}-results.csv`, studiesToCsv(studies), 'text/csv')}>
              <Download size={16} aria-hidden="true" /> Results .csv
            </button>
            <button type="button" className="btn" onClick={() => download(`${slug}-results.json`, studiesToJson(studies, target?.query), 'application/json')}>
              <Download size={16} aria-hidden="true" /> Results .json
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
