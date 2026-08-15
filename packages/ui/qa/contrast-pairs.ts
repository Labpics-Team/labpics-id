/*
 * The DESIGN.md contrast contract: every foreground/background token pair a
 * component may legally compose, with its WCAG 2.2 AA threshold.
 *
 * This manifest IS the machine-readable form of the table in DESIGN.md
 * ("Color — contrast pairs"). Adding a token pair to a component without
 * adding it here (and to DESIGN.md) is a design-system violation.
 *
 * Thresholds: 4.5 = body text (AA), 3.0 = large text / non-text UI (AA).
 *
 * Figma-baseline notes (docs/design/FIGMA-BASELINE.md §3):
 *   - The label ladder derives from one ink per theme; the alphas are
 *     AA-solved so P/S/T hold 4.5 on EVERY background — the full text matrix
 *     survives the Figma reconciliation intact.
 *   - Error splits into the #FF3B30 anchor (icon/large/border tier, 3:1) and
 *     the derived text member (body AA 4.5) — even the full-opacity anchor
 *     is only 3.55:1 on white, so error BODY TEXT uses the darkened member.
 *   - Control borders became decorative in the Figma baseline (ink @ 16% ≈
 *     1.2:1): the control boundary is the field surface + focus ring, so the
 *     old 1.4.11 border pairs are retired with FIGMA-BASELINE.md §3.4; the
 *     rubric separately asserts the hairline<strong ladder ordering (C2).
 *   - --lab-label-q is disabled-only and exempt per WCAG 1.4.3 "incidental",
 *     so it is intentionally absent.
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
  { fg: "--lab-accent-text", bg: "--lab-bg-secondary", min: 4.5, note: "accent text on page wash" },

  // Filled primary action: label on the solved strong fill (the Figma finish
  // — gradient + inset — layers over this fill; the raw anchor as a fill
  // would put the 16px label at 4.02:1, below body AA — see FIGMA-BASELINE.md §3.3).
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
  { fg: "--lab-accent-blue", bg: "--lab-bg-secondary", min: 3, note: "signal accent on page wash" },

  // Sentiments as text on plain and tinted surfaces. Error splits into the
  // #FF3B30 anchor (icon/large/border tier) and the derived text member.
  { fg: "--lab-sentiment-success", bg: "--lab-bg-primary", min: 4.5, note: "success text" },
  { fg: "--lab-sentiment-warning", bg: "--lab-bg-primary", min: 4.5, note: "warning text" },
  { fg: "--lab-sentiment-error-text", bg: "--lab-bg-primary", min: 4.5, note: "error body text" },
  {
    fg: "--lab-sentiment-error",
    bg: "--lab-bg-primary",
    min: 3,
    note: "error icon / border / large",
  },
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
  {
    fg: "--lab-sentiment-error-text",
    bg: "--lab-sentiment-error-bg",
    min: 4.5,
    note: "error alert text",
  },
  {
    fg: "--lab-sentiment-error",
    bg: "--lab-sentiment-error-bg",
    min: 3,
    note: "error alert icon",
  },
  { fg: "--lab-sentiment-info", bg: "--lab-sentiment-info-bg", min: 4.5, note: "info alert" },
];
