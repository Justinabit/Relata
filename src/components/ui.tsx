import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export function Badge({ tone = 'neutral', children, title, icon }: { tone?: Tone; children: ReactNode; title?: string; icon?: ReactNode }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {icon}
      {children}
    </span>
  );
}

export function AITag({ children = 'AI-generated' }: { children?: ReactNode }) {
  return <span className="tag tag--ai">{children}</span>;
}
export function VerifiedTag({ children = 'Source-verified' }: { children?: ReactNode }) {
  return <span className="tag tag--src">{children}</span>;
}

export function Callout({
  tone = 'info', title, children, action, live,
}: { tone?: 'info' | 'warn' | 'danger' | 'ok'; title?: ReactNode; children?: ReactNode; action?: ReactNode; live?: 'polite' | 'assertive' | 'off' }) {
  const Icon = tone === 'warn' || tone === 'danger' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : Info;
  return (
    <div className={`callout callout--${tone}`} role={live === 'assertive' ? 'alert' : live === 'off' ? undefined : 'status'}>
      <Icon className="callout__icon" size={18} aria-hidden="true" />
      <div className="callout__body">
        {title && <p className="callout__title">{title}</p>}
        {children && <div className="callout__text">{children}</div>}
      </div>
      {action && <div className="callout__action">{action}</div>}
    </div>
  );
}

export function IconButton({ label, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" className={`btn btn--icon ${className}`} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

export function Section({
  id, title, hint, actions, children, className = '', headingLevel = 2,
}: { id?: string; title: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; headingLevel?: 2 | 3 }) {
  const H = `h${headingLevel}` as 'h2' | 'h3';
  const hid = useId();
  return (
    <section id={id} className={`panel ${className}`} aria-labelledby={hid}>
      <header className="panel__head">
        <div>
          <H id={hid} className="panel__title">{title}</H>
          {hint && <p className="panel__hint">{hint}</p>}
        </div>
        {actions && <div className="panel__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ title, children, action }: { title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3 className="empty__title">{title}</h3>
      {children && <div className="empty__text">{children}</div>}
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

/** Accessible modal built on the native <dialog>: focus trap, Esc to close, focus restore. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog--wide' : ''}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="dialog__inner">
          <header className="dialog__head">
            <h2 id={titleId} className="dialog__title">{title}</h2>
            <IconButton label="Close dialog" onClick={onClose}><X size={18} aria-hidden="true" /></IconButton>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export const Skeleton = ({ w = '100%', h = 14, className = '' }: { w?: string | number; h?: number; className?: string }) => (
  <span className={`skel ${className}`} style={{ width: w, height: h }} aria-hidden="true" />
);

export function StudyCardSkeleton() {
  return (
    <div className="study study--skel" aria-hidden="true">
      <Skeleton w="82%" h={20} />
      <Skeleton w="48%" h={13} className="mt8" />
      <Skeleton w="36%" h={13} className="mt8" />
      <Skeleton h={62} className="mt14" />
      <Skeleton h={78} className="mt8" />
      <div className="row mt14"><Skeleton w={110} h={36} /><Skeleton w={78} h={36} /><Skeleton w={70} h={36} /></div>
    </div>
  );
}

export function TopicSkeleton() {
  return (
    <div className="panel" aria-hidden="true">
      <Skeleton w="45%" h={26} />
      <Skeleton w="30%" h={14} className="mt8" />
      <Skeleton h={14} className="mt14" />
      <Skeleton w="92%" h={14} className="mt8" />
      <Skeleton w="70%" h={14} className="mt8" />
    </div>
  );
}

export function FilterSkeleton() {
  return (
    <div className="filterbar filterbar--skel" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={44} />)}
    </div>
  );
}

export function RailSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="panel" aria-hidden="true">
      <Skeleton w="50%" h={20} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row mt14">
          <Skeleton w={34} h={34} />
          <div style={{ flex: 1 }}><Skeleton w="70%" h={13} /><Skeleton w="40%" h={12} className="mt8" /></div>
        </div>
      ))}
    </div>
  );
}
