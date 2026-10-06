export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-hidden="true" focusable="false" className="logo-mark">
      <rect width="32" height="32" rx="7" className="logo-mark__bg" />
      <path d="M11 22V10h6.2a3.8 3.8 0 0 1 .9 7.5L21.5 22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="logo-mark__stroke" />
      <circle cx="23" cy="10" r="2" className="logo-mark__stroke-fill" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span className="wordmark__text">Relata</span>
    </span>
  );
}
