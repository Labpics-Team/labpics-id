/*
 * The DESIGN.md contrast contract: every foreground/background token pair a
 * component may legally compose, with its WCAG 2.2 AA threshold.
 *
 * This manifest IS the machine-readable form of the table in DESIGN.md
 * ("Color — contrast pairs"). Adding a token pair to a component without
 * adding it here (and to DESIGN.md) is a design-system violation.
 *
 * Thresholds: 4.5 = body text (AA), 3.0 = large text / non-text UI (AA).
 * --lab-label-q is disabled-only and exempt per WCAG 1.4.3 "incidental",
 * so it is intentionally absent.
 */

export interface ContrastPair {
  fg: string;
  bg: string;
  min: 4.5 | 3;
  note: string;
}

const TEXT_BACKGROUNDS = [
  "--lab-bg-primary",
  "--lab-bg-secondary",
  "--lab-bg-tertiary",
  "--lab-bg-grouped",
  "--lab-bg-grouped-row",
] as const;

const BODY_LABELS = ["--lab-label-p", "--lab-label-s", "--lab-label-t"] as const;

function bodyTextMatrix(): ContrastPair[] {
  const pairs: ContrastPair[] = [];
  for (const fg of BODY_LABELS) {
    for (const bg of TEXT_BACKGROUNDS) {
      pairs.push({ fg, bg, min: 4.5, note: "body text on any surface" });
    }
  }
  return pairs;
}

export const CONTRAST_PAIRS: ContrastPair[] = [
  ...bodyTextMatrix(),

  // Accent as text: solved family member, body-size capable.
  { fg: "--lab-accent-text", bg: "--lab-bg-primary", min: 4.5, note: "accent text / links" },
  { fg: "--lab-accent-text", bg: "--lab-bg-secondary", min: 4.5, note: "accent text on cards" },

  // Filled primary action: label on the solved strong fill.
  { fg: "--lab-on-accent", bg: "--lab-accent-blue-strong", min: 4.5, note: "primary button label" },
  { fg: "--lab-on-accent", bg: "--lab-accent-blue-hover", min: 4.5, note: "primary button hover" },

  // Signal anchor used as large text / non-text UI (focus ring, active nav,
  // live indicators, icons) — 3:1 per WCAG 1.4.11 / large-text AA.
  {
    fg: "--lab-accent-blue",
    bg: "--lab-bg-primary",
    min: 3,
    note: "signal accent, non-text/large",
  },
  { fg: "--lab-accent-blue", bg: "--lab-bg-secondary", min: 3, note: "signal accent on cards" },

  // Sentiments as text on plain and tinted surfaces.
  { fg: "--lab-sentiment-success", bg: "--lab-bg-primary", min: 4.5, note: "success text" },
  { fg: "--lab-sentiment-warning", bg: "--lab-bg-primary", min: 4.5, note: "warning text" },
  { fg: "--lab-sentiment-error", bg: "--lab-bg-primary", min: 4.5, note: "error text" },
  { fg: "--lab-sentiment-info", bg: "--lab-bg-primary", min: 4.5, note: "info text" },
  {
    fg: "--lab-sentiment-success",
    bg: "--lab-sentiment-success-bg",
    min: 4.5,
    note: "success alert",
  },
  {
    fg: "--lab-sentiment-warning",
    bg: "--lab-sentiment-warning-bg",
    min: 4.5,
    note: "warning alert",
  },
  { fg: "--lab-sentiment-error", bg: "--lab-sentiment-error-bg", min: 4.5, note: "error alert" },
  { fg: "--lab-sentiment-info", bg: "--lab-sentiment-info-bg", min: 4.5, note: "info alert" },

  // Non-text UI boundaries (WCAG 1.4.11): input/control borders.
  { fg: "--lab-border-strong", bg: "--lab-bg-primary", min: 3, note: "control border" },
  { fg: "--lab-border-strong", bg: "--lab-bg-secondary", min: 3, note: "control border on card" },
];
