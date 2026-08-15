# Figma Baseline — owner taste-SSOT (BL-009)

> Reference: the extracted visual baseline from the owner's Figma mock, and the
> reconciliation decisions that fold it into DESIGN.md and
> `packages/ui/src/tokens.css`. **Precedence:** Figma is the *taste* source of
> truth (what the product should look like); DESIGN.md is the *system law*
> (how values are derived and verified); `tokens.css` is the *value* source of
> truth components read. When taste and a previously hand-solved value
> conflict, Figma wins and the law is re-derived — never silently.

**Source:** Figma file `vFWveYl6n4pLqSut3GFQxk`, page **"Labpics ID"** (auth
surface mock). Extracted 2026-08-15. **Verification:** every value below is
asserted by `packages/ui/qa/qa-rubric.test.ts` (F1 Figma baseline, C1/C2
contrast, D1 anti-drift) — the doc cannot drift from the shipped tokens
without a red build.

---

## 1. Extracted baseline (light theme)

### 1.1 Surfaces

| Element | Figma value | Token |
|---|---|---|
| Page background | `#F7F8FA` | `--lab-bg-secondary` (unchanged) |
| Card / auth surface | `#FFFFFF` | `--lab-bg-primary` |

The auth mock inverts the old assumption: the **page** is the grey wash and
the **card** is white. Working text sits on the card, so the text-contrast
contract is scoped to card surfaces (§3.1 below).

### 1.2 Label ink ladder (alpha-composited)

Labels are one ink, `#3C3C43`, composited over the card at fixed strengths —
the iOS-style label ladder. Expressed in tokens as `color-mix()` so the QA
resolver verifies the rendered result:

| Role | Law | Resolves to (light) | Contrast on card |
|---|---|---|---|
| primary `--lab-label-p` | declared `#101012` | `#101012` | 17.9:1 |
| secondary `--lab-label-s` | ink 72% over card | `#737378` | 4.73:1 (AA) |
| tertiary/caption `--lab-label-t` | ink 52% over card | `#9A9A9D` | 2.81:1 (caption floor, §3.2) |
| disabled `--lab-label-q` | ink 32% over card | `#C1C1C3` | exempt (WCAG 1.4.3) |

### 1.3 Borders

One border ink, `#787880`, at two strengths:

| Role | Law | Resolves to (light) |
|---|---|---|
| hairline `--lab-border-hairline` | border-ink 8% over card | `#F4F4F5` |
| control border `--lab-border-strong` | border-ink 16% over card | `#E9E9EB` |

### 1.4 Accent & primary action

- Anchor stays brand **`#007AFF`** (`--lab-accent-blue`).
- **Filled primary action = the anchor itself**, finished with a top-light
  gradient and an inset bottom shadow:
  - `--lab-accent-gradient`: `linear-gradient(180deg, white 20% → 0%)`
  - `--lab-shadow-inset-control`: `inset 0 -1px 1px` shadow-ink @ 12%
- Error sentiment anchor: **`#FF3B30`** (replaces `#B91C1C`).

### 1.5 Radius

| Token | Old | Figma baseline |
|---|---|---|
| `--lab-radius-sm` | 4px | **4px** |
| `--lab-radius-md` (buttons, inputs) | 8px | **12px** |
| `--lab-radius-lg` (cards, dialogs) | 12px | **24px** |

### 1.6 Elevation — auth card

Shadow ink is `#101012` (= primary label). The card shadow is a four-layer
soft stack:

```
--lab-shadow-card:
  0 0 1px rgba(16,16,18,.12), 0 1px 1px rgba(16,16,18,.04),
  0 2px 2px rgba(16,16,18,.02), 0 4px 2px rgba(16,16,18,.01)
```

(committed as `color-mix()` over `--lab-color-shadow` so the dark theme
re-measures the alphas without touching the geometry).

### 1.7 Typography

| Role | Figma value | Token |
|---|---|---|
| Card title | 20px / 20px, SemiBold, letter-spacing −0.33px | `--lab-text-title` (new role) |
| Body / controls (auth surface) | 16px / 24px | `--lab-text-input` (existing 16/24 role) |
| Caption | 12px, Medium | `--lab-text-caption` (new role, line box 16px) |

### 1.8 Sizes & auth-card metrics

| Metric | Figma value | Token |
|---|---|---|
| Control height | 48px | `--lab-size-control` |
| OTP cell | 48 × 56px | `--lab-size-otp-w` / `--lab-size-otp-h` |
| Auth shell max | 480px | `--lab-shell-auth` (was 440px) |
| Content column | 384px | `--lab-shell-auth-content` |
| Card padding | 48 / 48 / 24 / 48 (top/inline/bottom) | `--lab-space-48` + `--lab-space-24` |
| Card section gap | 36px | `--lab-space-36` (new scale step) |
| Logo tile | 48px, radius 12 | `--lab-size-logo-tile` + `--lab-radius-md` |

---

## 2. Dark equivalents (re-measured, not inverted)

Dark stays a separate design (DESIGN.md §2.5). Figma ships only the light
mock, so dark keeps its solved surfaces and re-measures the new laws:

- **Label ink:** dark `--lab-label-ink` = `#E4EBF7`; the same 72/52/32% ladder
  resolves to `#A8ADB7` (8.6:1), `#7D838E` (5.1:1), `#51555C` (exempt).
  `--lab-label-p` stays the solved `#E9ECF2`.
- **Borders:** dark keeps declared `#262B35` / `#7E8798` — low-alpha ink over
  near-black is invisible, so dark declares bases instead of deriving.
- **Error:** dark anchor stays `#F87171`; `--lab-sentiment-error-text` aliases
  the anchor (7.2:1 on dark primary — no darker member needed).
- **Card shadow:** same four-layer geometry at re-measured alphas
  (40/20/12/8%) over pure black.
- Gradient/inset finishes recompute from `--lab-on-accent` /
  `--lab-color-shadow` automatically.

Both dark entry points (`[data-theme]` and `prefers-color-scheme`) carry the
additions byte-identically (rubric D1).

---

## 3. Documented deviations (owner-accepted)

These are conscious taste-over-rulebook calls. Each keeps a machine assertion
so it cannot degrade further; none is a silent deletion.

### 3.1 Secondary-label scope

`#3C3C43 @ 72%` = 4.73:1 on the white card but **4.43:1** on `#F7F8FA`.
Secondary text is therefore contractually legal **only on card-white
surfaces** (`--lab-bg-primary`, `--lab-bg-grouped-row`); the page wash is
chrome, not a reading surface. C1 asserts the legal pairs at full 4.5.

### 3.2 Tertiary/caption floor

`#3C3C43 @ 52%` = 2.81:1 — below AA for body text. Per Figma, tertiary is
demoted to **caption/meta only** (never essential copy, never the sole
carrier of state). The pairs stay asserted at a **≥ 2.7 floor** (rubric C2)
so the value can't silently sink; essential text uses P/S.

### 3.3 Primary-button label on the anchor

White on `#007AFF` = **4.02:1** — above the 3:1 large-text/UI line, below
4.5. The Figma button (16px SemiBold on a 48px control, lightened top
gradient) is accepted at the 3:1 tier; C1 asserts on-accent × anchor ≥ 3 and
keeps the 4.5 assertions on the strong/hover fills.

### 3.4 Control borders are decorative

`#787880 @ 16%` (≈1.2:1) cannot satisfy WCAG 1.4.11 as a boundary. In the
Figma baseline the control boundary is carried by the **filled field surface
and the focus ring** (accent ≥ 3:1, asserted), not the border. The old 3:1
border pairs are retired with this note; a rubric check still enforces the
ladder ordering (strong ≥ hairline ink share).

### 3.5 Off-ladder type roles

20px title and 12px caption sit outside the ×1.25 ladder and the 13px
persistent-UI floor. Both are **auth-surface roles** from the mock: the title
is a one-line lockup (20/20, −0.33px), the caption is non-essential meta.
The ladder law (T7) still governs display/h1/h2/h3/body; the two new roles
are asserted by value (F1) instead.
