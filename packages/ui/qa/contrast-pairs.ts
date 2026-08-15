/*
 * The DESIGN.md contrast contract: every foreground/background token pair a
 * component may legally compose, with its WCAG 2.2 AA threshold.
 *
 * This manifest IS the machine-readable form of the table in DESIGN.md
 * ("Color — contrast pairs"). Adding a token pair to a component without
 * adding it here (and to DESIGN.md) is a design-system violation.
 *
 * Figma baseline scoping (docs/design/FIGMA-BASELINE.md §3):
 *   - Primary label holds 4.5 on every surface.
 *   - Secondary label (ink @ 72%) is legal ONLY on card-white surfaces
 *     (--lab-bg-primary, --lab-bg-grouped-row) — the page wash is chrome,
 *     not a reading surface.
 *   - Tertiary (ink @ 52%) is the caption/meta tier: never essential copy.
 *     It moves to CAPTION_PAIRS with a ≥2.7 floor (rubric C2) so the value
 *     cannot silently sink further.
 *   - Error text uses the darkened text member; the #FF3B30 anchor is
 *     icon/large-tier (3:1).
 *   - Borders are decorative in this system (control boundary = field
 *     surface + focus ring), so no border pair claims 1.4.11 here; the
 *     rubric separately asserts the hairline<strong ladder ordering.
 *   - --lab-label-q is disabled-only and exempt per WCAG 1.4.3.
 */

export interface ContrastPair {
  fg: string;
  bg: string;
  min: 4.5 | 3;
  note: string;
}

const ALL_BACKGROUNDS = [
  "--lab-bg-primary",
  "--lab-bg-secondary",
  "--lab-bg-tertiary",
  "--lab-bg-grouped",
  "--lab-bg-grouped-row",
] as const;

/* Card-white reading surfaces — where secondary text may sit. */
const CARD_BACKGROUNDS = ["--lab-bg-primary", "--lab-bg-grouped-row"] as const;

export const CONTRAST_PAIRS: ContrastPair[] = [
  // Primary label: body text on any surface.
  ...ALL_BACKGROUNDS.map((bg) => ({
    fg: "--lab-label-p",
    bg,
    min: 4.5 as const,
    note: "primary text on any surface",
  })),

  // Secondary label: body text on card surfaces only (Figma §3.1).
  ...CARD_BACKGROUNDS.map((bg) => ({
    fg: "--lab-label-s",
    bg,
    min: 4.5 as const,
    note: "secondary text on card surfaces",
  })),

  // Accent as text: solved family member, body-size capable.
  { fg: "--lab-accent-text", bg: "--lab-bg-primary", min: 4.5, note: "accent text / links" },
  { fg: "--lab-accent-text", bg: "--lab-bg-secondary", min: 4.5, note: "accent text on page wash" },

  // Filled primary action. The Figma baseline fills with the ANCHOR (plus
  // gradient/inset finish): 16px SemiBold on a 48px control — large-text
  // tier, 3:1 (Figma §3.3). The strong/hover fills keep full 4.5.
  {
    fg: "--lab-on-accent",
    bg: "--lab-accent-blue",
    min: 3,
    note: "primary button label (anchor fill, large tier)",
  },
  { fg: "--lab-on-accent", bg: "--lab-accent-blue-strong", min: 4.5, note: "label on strong fill" },
  { fg: "--lab-on-accent", bg: "--lab-accent-blue-hover", min: 4.5, note: "label on hover fill" },

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
  // #FF3B30 anchor (icon/large tier) and the derived text member (body AA).
  { fg: "--lab-sentiment-success", bg: "--lab-bg-primary", min: 4.5, note: "success text" },
  { fg: "--lab-sentiment-warning", bg: "--lab-bg-primary", min: 4.5, note: "warning text" },
  { fg: "--lab-sentiment-error-text", bg: "--lab-bg-primary", min: 4.5, note: "error body text" },
  { fg: "--lab-sentiment-error", bg: "--lab-bg-primary", min: 3, note: "error icon / large" },
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

/*
 * Caption tier (rubric C2): tertiary ink @ 52% is meta-only per the Figma
 * baseline — 2.81:1 on the light card, deliberately below body AA and never
 * used for essential copy. The floor stops silent regression; raising the
 * role back to body duty requires moving the pair into CONTRAST_PAIRS at 4.5.
 */
export interface CaptionPair {
  fg: string;
  bg: string;
  floor: number;
  note: string;
}

export const CAPTION_PAIRS: CaptionPair[] = CARD_BACKGROUNDS.map((bg) => ({
  fg: "--lab-label-t",
  bg,
  floor: 2.7,
  note: "caption/meta on card surfaces (non-essential tier, Figma §3.2)",
}));
