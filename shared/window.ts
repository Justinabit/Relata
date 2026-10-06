import type { ResearchWindow, YearsBack } from './types.js';

export const DEFAULT_YEARS_BACK: YearsBack = 10;
/** Offered by default. */
export const YEARS_BACK_OPTIONS: YearsBack[] = [1, 3, 5, 10];
/** Only offered behind an explicit "historical" choice; always labelled as outside the default window. */
export const HISTORICAL_YEARS_OPTIONS: YearsBack[] = [15, 25];

/**
 * The research window is always computed from the current year — never hard-coded.
 * With currentYear = 2026 and 10 years back: 2016 to 2026.
 */
export function computeWindow(yearsBack: number, now: Date = new Date()): ResearchWindow {
  const toYear = now.getUTCFullYear();
  const years = yearsBack;
  const fromYear = toYear - years;
  return {
    fromYear,
    toYear,
    years,
    label: `${fromYear} to ${toYear}`,
    outsideDefault: years > DEFAULT_YEARS_BACK,
  };
}

export function yearsLabel(years: number): string {
  return years === 1 ? 'Last year' : `Last ${years} years`;
}
