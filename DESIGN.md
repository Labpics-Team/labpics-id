# Labpics ID — Design System (DESIGN.md)

**Status:** gate document — no page/component UI may be written before this file is merged.
**Source brief:** `docs/design/DESIGN-BRIEF.md` (v2, 51 screens, state contract, QA rubric).
**Brand source:** `lab.pics/brand` (verified 2026-08-11): flask mark, Labpics Blue `#007AFF`, Geist, Swiss legacy.
**Token source of truth:** `packages/ui/src/tokens.css` — the only file (besides this document) where raw color values may appear.
**Machine checks:** `packages/ui/qa/qa-rubric.test.ts` (`bun run qa:rubric`) enforces token purity, WCAG AA contrast for every pair in §2.4, dark-theme anti-drift, the brand anchor, and the dev-tooling gate.

---

## 1. Atmosphere & Identity

**Labpics ID is an infrastructure product under the Labpics studio brand** — the identity door for the studio's estate. It is not an independent SaaS brand and it does not imitate any identity provider (Clerk is a *quality* benchmark only; its visual identity is off-limits, as are Auth0's and Stripe's).

Character: **precise · sovereign · alive** — a trust-first *precision instrument*.

- **Precise** — Swiss design legacy: precision, rhythm, structure. Optical alignment on a 4px grid, a type scale that never wobbles, mono for all identity data, tokens-only color.
- **Sovereign** — self-hosted and owner-controlled. No vendor anxiety, no dark patterns, no upsell nagging. Consent is a ceremony, not a checkbox.
- **Alive** — motion encodes state change, never decoration; `prefers-reduced-motion` switches character rather than deadening the UI.

**Theme policy: light-default.** The Labpics brand is light — white surfaces, Labpics Blue, Geist ("bright, confident, precise — without feeling cold"). Dark is a first-class theme available from day one via `[data-theme]` and `prefers-color-scheme`, never skipped.

Visual anchors (from the brief §1.3): the flask mark (clear space ≥ 1/5 of mark height; right margin 50% / left 70% of mark width for optical compensation, per lab.pics/brand), the signal accent, the mono data voice, the 1px "ledger" line under screen headers, hairlines instead of shadows on working surfaces.

### Availability decision: lab-colors / labui / lab-icons

**Verified facts** (public npm registry + GitHub, 2026-08-11; reproducible commands below) are separated here from the **architectural decision** column, which is ours:

```sh
npm view @labpics/colors name version license repository.url  # → 0.10.0, MIT, github.com/Labpics-Team/lab-colors
npm view @labpics/motion name version license repository.url  # → 0.3.0, MIT, github.com/Labpics-Team/lab-motion
npm view @labpics/icons  name version license repository.url  # → 0.2.0, MIT, github.com/Labpics-Team/lab-icons
npm view labui version                                        # → E404 (unscoped and @labpics/ui both absent)
gh repo view Labpics-Team/labui --json visibility             # → PRIVATE
```

| Package | Status | Decision |
|---|---|---|
| `@labpics/colors` (lab-colors) | **Published**, v0.10.0, MIT | Not imported at runtime for this gate. It is a WASM engine that resolves `--lab-*` variables from a runtime `ThemeConfig` we do not ship yet. We replicate its output contract (`--lab-*` semantic roles, perceptual accent family solved per theme) as **static CSS custom properties** in `packages/ui/src/tokens.css`, with AA compliance proven by our own programmatic contrast assertions instead of the solver. Adopting the runtime engine later is a reversible swap: consumers already read only `var(--lab-*)`. |
| `labui` | **Not published** (npm 404; GitHub repo private) | Own tokens + own primitives replicate the Labpics look. Token names follow the labui contract documented in the brief so a future migration is a rename-free adoption. |
| `@labpics/icons` (lab-icons) | **Published**, v0.2.0, MIT — 444 SVG (Filled + Outline), tree-shakeable ESM | Adopted as the icon family (§5). |
| `@labpics/motion` | **Published**, v0.3.0, MIT | Timing tokens in §6 mirror its character presets (instant/calm/ceremony); the runtime engine may be adopted by ch08+ without token changes. |

---

## 2. Color

All color is expressed as semantic `--lab-*` tokens. **Component code never contains raw hex/rgb/hsl/oklch** — the QA rubric fails the build on any hit outside `packages/ui/src/tokens.css` and this document. Third-party OAuth provider logos (Google/GitHub/Yandex) keep their own brand colors by necessity; everything else is tokens-only.

### 2.1 Accent — Labpics Blue

The accent is the **Labpics Blue perceptual family**, anchored at brand **`#007AFF`** and exposed as `--lab-accent-blue`. There is no other accent hue in the system.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--lab-accent-blue` | `#007AFF` | `#007AFF` | **Signal anchor** — focus ring, active nav, live/health indicators, large accents (≥3:1 non-text/large AA) |
| `--lab-accent-blue-strong` | `#0062CC` | `#0F6FDD` | Filled primary-action background (solved so `--lab-on-accent` holds 4.5:1) |
| `--lab-accent-blue-hover` | `#0056B3` | `#0062CC` | Primary-action hover fill (same 4.5:1 guarantee) |
| `--lab-accent-text` | `#0062CC` | `#55A2FF` | Accent-colored body text and links (4.5:1 on primary/secondary bg) |
| `--lab-on-accent` | `#FFFFFF` | `#FFFFFF` | Label on accent fills |

Usage rule (brief V1): Labpics Blue appears **only** on primary action, active nav, focus ring, and live/health status. Sentiments never color primary actions. Never two competing signals in one view.

### 2.2 Neutrals

| Token | Light | Dark | Role |
|---|---|---|---|
| `--lab-bg-primary` | `#FFFFFF` | `#0C0E13` | Page background |
| `--lab-bg-secondary` | `#F7F8FA` | `#14171E` | Cards, panels |
| `--lab-bg-tertiary` | `#EFF1F4` | `#1C2029` | Inputs, code blocks, table headers |
| `--lab-bg-grouped` | `#F2F4F7` | `#11141A` | Grouped settings lists (container) |
| `--lab-bg-grouped-row` | `#FFFFFF` | `#14171E` | Grouped list rows |
| `--lab-label-p` | `#16181D` | `#E9ECF2` | Primary text |
| `--lab-label-s` | `#4A5260` | `#A8B0BD` | Secondary text |
| `--lab-label-t` | `#5C6675` | `#8A93A3` | Tertiary/caption text |
| `--lab-label-q` | `#98A1AF` | `#5C6675` | Disabled (WCAG 1.4.3 inactive-UI exemption) |
| `--lab-border-hairline` | `#E3E6EB` | `#262B35` | Decorative separators (no AA requirement) |
| `--lab-border-strong` | `#6B7484` | `#7E8798` | Input/control borders (holds 3:1, WCAG 1.4.11) |

### 2.3 Sentiments

Sentiments communicate status only — never primary actions (destructive primaries use error sentiment only inside destructive confirmations). Status is never color-alone: always paired with text or an icon (WCAG 1.4.1).

| Token | Light | Dark | Role |
|---|---|---|---|
| `--lab-sentiment-success` | `#166534` | `#4ADE80` | Success text/icon |
| `--lab-sentiment-warning` | `#92400E` | `#FBBF24` | Warning text/icon |
| `--lab-sentiment-error` | `#B91C1C` | `#F87171` | Error text/icon |
| `--lab-sentiment-info` | `#075985` | `#38BDF8` | Info text/icon |
| `--lab-sentiment-*-bg` | tints | tints | Alert/badge surfaces (each sentiment holds 4.5:1 on its own tint) |

### 2.4 Contrast contract (WCAG 2.2 AA, machine-checked)

Every legal foreground/background composition is enumerated in `packages/ui/qa/contrast-pairs.ts` and asserted programmatically in **both themes** on every test run: **4.5:1** for body text, **3:1** for large text and non-text UI. The full matrix: labels P/S/T × all five backgrounds (4.5), accent text on primary/secondary (4.5), on-accent on strong/hover fills (4.5), signal anchor on primary/secondary (3, non-text/large only), four sentiments on primary bg and on their tints (4.5), strong border on primary/secondary (3). Adding a new pairing to a component without adding it to the manifest and this table is a design-system violation.

Measured ratios are produced by the rubric run (`bun run qa:rubric`), not maintained by hand — the manifest is the contract, the test output is the evidence.

**Anti-drift:** the `[data-theme="dark"]` block and the `prefers-color-scheme: dark` block are asserted identical, so the two dark entry points can never diverge.

---

## 3. Typography

**Geist is the brand font** (lab.pics/brand; already wired via `next/font` in `apps/web`). Geist Mono is the data voice — all identity payloads (client IDs, session IDs, fingerprints, RFC3339 timestamps, keys, payload previews) render in mono, never proportional.

| Step | Token | Size / line-height | Used for |
|---|---|---|---|
| display | `--lab-text-display` | 36px / 1.15 | Screen titles (login brand moment, empty states) |
| h1 | `--lab-text-h1` | 28px / 1.2 | Page titles (exactly one per screen) |
| h2 | `--lab-text-h2` | 22px / 1.3 | Section titles |
| h3 | `--lab-text-h3` | 18px / 1.35 | Card/group titles |
| body | `--lab-text-body` | 15px / 1.5 | Default |
| small | `--lab-text-small` | 13px / 1.45 | Meta, captions |
| mono | `--lab-text-mono` | 13px / 1.5 | IDs, keys, timestamps |

Type is set in `rem` (tokens store rem values). Long mono strings wrap with `break-all` and always carry a copy affordance. Baseline grid: 4px.

---

## 4. Spacing & Layout

- **4px base grid.** The only spacing values are `--lab-space-4/8/12/16/24/32/48/64`. Off-grid px values in committed CSS fail the QA rubric.
- **Radius:** `--lab-radius-sm` 4px, `--lab-radius-md` 8px (cards, inputs), `--lab-radius-lg` 12px, `--lab-radius-pill` 999px (badges). Corner softening applies to controls, never to data tables.
- **Hairline:** `--lab-hairline` (1px) is the only separator. Cards use hairlines, not shadows.

Breakpoints (fluid, not device-locked; one min-width convention — Tailwind `sm:`/`lg:` variants map to the same values in `apps/web` `@theme`):

| Range | Min-width token | Behavior |
|---|---|---|
| base (< 640px) | — | Single column, bottom-sheet menus, full-width actions |
| `sm` (≥ 640px) | `--bp-sm` = 40rem | 2-col grids, tables→cards, drawer nav |
| `lg` (≥ 1024px) | `--bp-lg` = 64rem | Full shell (sidebar), 3–4 col grids, split panels |

Shell maxima: auth card 440px; account settings content 720px; list surfaces 1100px. Touch targets ≥ 44×44px with ≥ 8px gaps (WCAG 2.5.8). Reflow: no content loss at 320px @ 400% zoom (WCAG 1.4.10).

---

## 5. Components

Only the components below may be built (ch08/ch09 scope). Anything else requires updating this list first. All of them read only `var(--lab-*)`.

**Primitives:** `Button` (primary/secondary/ghost/destructive-in-confirm), `TextField`, `EmailField`, `PasswordField` (+ strength meter, reveal toggle), `OtpField` (single masked field preferred; `inputmode=numeric`, `autocomplete=one-time-code`), `Select`, `Checkbox`, `Toggle` (text on/off state), `TextLink`, `Badge`/`StatusDot` (8px dot + text, never color-alone), `Avatar`, `ThemeToggle`, `BrandMark` (flask, 32/48/64px, clear-space per brand).

**Composition:** `Card` (max one primary card per view — no card soup), `GroupedList`, `Ledger` (numbered record rows: audit, sessions, grants, webhooks, factors), `DataTable` (`th scope`, `aria-sort`, →cards on mobile), `Tabs`, `Stepper`, `Dialog`/`ConfirmDialog` (focus trap, escape, restore focus), `Drawer`, `BottomSheet`, `Toast`/`StatusBanner` (`role=status`/`role=alert`), `SkeletonBlock` (layout-reserving), `CopyField`/`CodeBlock` (mono, copy with `aria-live` feedback), `ShowOnceGate` (secrets/backup codes), `EmptyState` (teaches next action), `Countdown` (`aria-live=polite`), `FilterBar`, `Pagination`, `SaveBar`.

**Iconography — decision: `@labpics/icons`** (lab-icons, v0.2.0, MIT, 444 SVG Filled + Outline, tree-shakeable ESM — published by the studio, verified on npm 2026-08-11). One family, no emojis as icons ever, Outline as the default working style with Filled reserved for active/selected states. Rationale: it is the brand-native family the brief targets (SF-Symbols-competing), it is publicly licensed for this repo, and it keeps the icon language identical to the rest of the Labpics estate — a third-party set (Radix/Phosphor) would be a second visual voice. Sizes via `--lab-icon-sm/md/lg` (16/20/24). Icons never carry meaning by color alone. The dependency is added in ch08 with the first icon-consuming component, not in this tokens-only PR.

---

## 6. Motion & Interaction

Timing tokens mirror the `@labpics/motion` character presets. Components read only `var(--lab-motion-*)` / `var(--lab-ease-*)`.

| Character | Token | Duration | Easing | Used for |
|---|---|---|---|---|
| instant | `--lab-motion-instant` | 80ms | linear / ease-out | Data rows, table updates, filter/re-sort |
| calm | `--lab-motion-calm` | 200ms | `--lab-ease-out` | Dialogs, drawers, page transitions, error reveals |
| ceremony | `--lab-motion-ceremony` | 400ms | spring (engine) / ease-out fallback | Consent confirm, factor enroll success, "signed in" (includes a 1-beat hold) |

Rules (brief §3.2): every animation encodes a named state transition or it is cut; animate `transform`/`opacity` only on critical paths; stagger ≤ 4 rows × 24ms on first render only; focus ring appears with an 80ms fade + 2px grow; async ops show inline button progress (spinner → check) with `aria-live` completion announcements — never whole-screen blocking.

**Reduced motion is a character switch, not a fade-to-zero:** under `prefers-reduced-motion: reduce` the tokens collapse (ceremony→80ms, calm→80ms, instant→0ms, easing→linear); skeletons lose shimmer; no parallax. This lives in the token file itself, so components inherit it with zero logic.

### React dev tooling gate

`react-scan` (and any similar dev-only tooling, e.g. react-doctor) runs **strictly behind `NODE_ENV === 'development'`** — enforced by the G1 rubric check (grep for ungated `react-scan`/`react-doctor` references in `apps/web/src`). Production bundles must never include scan overlays.

---

## 7. Depth & Surface

**One strategy: hairline-first flatness.** Working surfaces are separated by 1px hairlines (`--lab-hairline`) on solid background tokens — never by drop shadows or grey boxes. Elevation exists only where content genuinely floats above the page:

| Level | Token | Used for |
|---|---|---|
| 0 | `--lab-shadow-0` | Cards, panels, tables (hairline instead) |
| 1 | `--lab-shadow-1` | Sticky bars |
| 2 | `--lab-shadow-2` | Dropdowns, popovers |
| 3 | `--lab-shadow-3` | Dialogs, bottom sheets |

Materials: **Solid** is the default everywhere. Blur (sticky topbars, bottom sheets, command palette) and Glass (login brand panel, live session tile — nothing else) are deferred until the corresponding surfaces are built; both must degrade to Solid under `prefers-reduced-transparency`.

---

## 8. Verification

| Check | Where | When |
|---|---|---|
| Token purity (colors, spacing, focus safety) | `packages/ui/qa/qa-rubric.test.ts` T1/T2/T4 | every `bun test` / CI run |
| WCAG AA contrast, all §2.4 pairs, both themes | C1 (programmatic, WCAG 2.2 formulas) | every run |
| Dark-theme anti-drift | D1 | every run |
| Brand anchor #007AFF, no off-brand accent hue | V1 | every run |
| Dev-tooling NODE_ENV gate | G1 | every run |
| Brief committed + reconciled with tokens | B1 | every run |
| axe-core, keyboard paths, reflow, reduced-motion traces, Lighthouse-100 ratchet | `docs/design/QA-RUBRIC.md` | ch08/ch09, when pages exist |

The 51 screens of the brief (A1–A15, B1–B10, C1–C18, D1–D8) reference only semantic roles defined here; the B1 rubric check asserts that every role family the screens name resolves to a token in `tokens.css`.
