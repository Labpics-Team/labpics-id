# Labpics ID — Design System (DESIGN.md)

**Status:** gate document — no page/component UI may be written before this file is merged.
**Source brief:** `docs/design/DESIGN-BRIEF.md` (v2, 51 screens, state contract, QA rubric).
**Taste baseline:** `docs/design/FIGMA-BASELINE.md` (owner Figma mock, BL-009) — where taste and a previously hand-solved value conflict, the Figma baseline wins and the law is re-derived; every accepted deviation is documented there and floor-asserted by the rubric.
**Brand source:** `lab.pics/brand` (verified 2026-08-11): flask mark, Labpics Blue `#007AFF`, Geist, Swiss legacy.
**Token source of truth:** `packages/ui/src/tokens.css` — the only file (besides this document) where raw color values may appear. Interaction colors are **derived** there with `color-mix()` from declared bases; hand-picking a hover/tint/disabled value is a violation.
**Machine checks:** `packages/ui/qa/qa-rubric.test.ts` (`bun run qa:rubric`) resolves every `color-mix()`/`var()` chain and enforces: token purity in CSS **and TSX**, WCAG 2.2 AA for every pair in §2.6 in both themes, OKLCH hue stability of the accent family, the typography derivation law, dark-theme anti-drift, the brand anchor, forbidden decorative hues, `transition: all` prohibition, the dev-tooling gate (structural), icon-family purity, and full 51-screen/component reconciliation.

---

## 1. Atmosphere & Identity

**Labpics ID is an infrastructure product under the Labpics studio brand** — the identity door for the studio's estate. It is not an independent SaaS brand and it does not imitate any identity provider (Clerk is a *quality* benchmark only; its visual identity is off-limits, as are Auth0's and Stripe's).

Character: **precise · sovereign · alive** — a trust-first *precision instrument*.

- **Precise** — Swiss design legacy: optical alignment on a 4px grid, a ratio-derived type scale (§3), mono for all identity data, tokens-only color.
- **Sovereign** — self-hosted and owner-controlled. No vendor anxiety, no dark patterns, no upsell nagging. Consent is a ceremony, not a checkbox.
- **Alive** — motion encodes state change, never decoration; `prefers-reduced-motion` switches character rather than deadening the UI (§6).

**Theme policy: light-default.** The Labpics brand is light — white surfaces, Labpics Blue, Geist ("bright, confident, precise — without feeling cold"). Dark is a first-class theme available from day one via `[data-theme]` and `prefers-color-scheme`, never skipped — and it is a **separate design with re-measured values**, not an inversion (§2.5).

**Two surfaces, two vocabularies.** The system distinguishes **Product** (forms, ledgers, tables, dialogs — everything behind auth) from **Display** (the login brand moment, empty states, the landing hero). Display may use `--lab-text-display` (36px, tracking −0.02em) and the Glass material; Product never does. A Product screen that reaches for display type or glass is a violation, not a taste choice.

Visual anchors (from the brief §1.3): the flask mark (clear space ≥ 1/5 of mark height; right margin 50% / left 70% of mark width for optical compensation, per lab.pics/brand), the signal accent, the mono data voice, the 1px "ledger" line under screen headers, hairlines instead of shadows on working surfaces.

### Availability decision: lab-colors / labui / lab-icons

**Verified facts** (public npm registry + GitHub, 2026-08-11; reproducible commands below) are separated here from the **architectural decision** column, which is ours. The npm registry is the only authority for published versions (repo `main` may be ahead: lab-colors `main` reads 0.11.0 while npm ships 0.10.0 — the published artifact is what we can depend on).

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

All color is expressed as semantic `--lab-*` tokens. **Component code never contains raw hex/rgb/hsl/oklch** — the QA rubric fails the build on any hit outside `packages/ui/src/tokens.css`, in CSS *and* in TSX (arbitrary Tailwind values like `bg-[#fff]` are scanned too). Third-party OAuth provider logos (Google/GitHub/Yandex) keep their own brand colors by necessity; everything else is tokens-only.

### 2.1 Declared vs derived

The palette has exactly two kinds of values:

- **Bases** — declared hex values, hand-solved once per theme (backgrounds, labels P/S/T, accent anchor + strong, four sentiments, two borders, one shadow color).
- **Deriveds** — computed from bases with `color-mix()` **in tokens.css itself**, one law per role:

| Derived token | Law | Light resolves to | Dark resolves to |
|---|---|---|---|
| `--lab-accent-blue-hover` | strong ⊕ 12% black | `#0056B4` | `#0D62C2` |
| `--lab-sentiment-*-bg` | sentiment 10% over `--lab-bg-primary` | e.g. success `#EAF1ED` | e.g. success `#132720` |
| `--lab-label-s` | label ink 72% over card | `#737378` | `#A8ADB7` |
| `--lab-label-t` (caption tier) | label ink 52% over card | `#9A9A9D` | `#7D838E` |
| `--lab-label-q` (disabled) | label ink 32% over card | `#C1C1C3` | `#51555C` |
| `--lab-border-hairline` | border ink 8% over card (light) | `#F4F4F5` | declared `#262B35` |
| `--lab-border-strong` | border ink 16% over card (light) | `#E9E9EB` | declared `#7E8798` |
| `--lab-sentiment-error-text` | error anchor ⊕ 28% black (light) | `#B72A22` | aliases anchor `#F87171` |
| `--lab-shadow-focus` | `--lab-focus-color` at 30% alpha, 4px spread | `rgba(0,122,255,.3)` ring | same law |
| `--lab-accent-text` (dark only) | anchor 66% ⊕ 34% white | — | `#57A7FF` |

Hand-picking a third blue for hover, a bespoke tint for one alert, or a special disabled grey is a class violation: change the base or change the law, never a single cell.

### 2.2 Accent — Labpics Blue

The accent is the **Labpics Blue perceptual family**, anchored at brand **`#007AFF`** and exposed as `--lab-accent-blue`. There is no other accent hue in the system, and no decorative hue family exists at all (the upstream lab-colors decorative accents are excluded from this product — brief §2.1). The QA rubric scans tokens, CSS and TSX for any stray hue class.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--lab-accent-blue` | `#007AFF` | `#007AFF` | **Signal anchor** — focus ring, active nav, live/health indicators, **filled primary-action fill** (Figma baseline), large accents (≥3:1 non-text/large AA) |
| `--lab-accent-blue-strong` | `#0062CC` | `#0F6FDD` | Solved strong member: accent text (light), emphasis fills where 4.5:1 labels are required |
| `--lab-accent-blue-hover` | derived `#0056B4` | derived `#0D62C2` | Primary-action hover fill (white on it: 7.02:1 / 5.93:1) |
| `--lab-accent-text` | = strong (`#0062CC`) | derived `#57A7FF` | Accent-colored body text and links (4.5:1+ on primary/secondary bg) |
| `--lab-on-accent` | `#FFFFFF` | `#FFFFFF` | Label on accent fills |
| `--lab-accent-gradient` | derived: `--lab-on-accent` 20% → transparent, 180° | same law | Top-light finish over the anchor fill (Figma baseline §1.4) |
| `--lab-shadow-inset-control` | derived: inset 0 −1px 1px shadow ink @ 12% | same law | Bottom inset finish on filled controls |

**Filled primary action (Figma baseline):** the fill is the **anchor itself** finished with `--lab-accent-gradient` + `--lab-shadow-inset-control`. Its 16px SemiBold label on a 48px control sits at the large-text tier — white on `#007AFF` = 4.02:1, asserted ≥ 3:1 (`FIGMA-BASELINE.md` §3.3); the strong/hover members keep their 4.5:1 assertions.

**Hue stability (machine-checked):** in OKLCH, every member of the family stays within **10° of hue** of the anchor per theme. Measured: light family spread 0.6° (H ≈ 257°), dark family spread 4.8° (H 252.6–257.4°). A "blue" that drifts toward violet or cyan fails the rubric.

Usage rule (brief V1): Labpics Blue appears **only** on primary action, active nav, focus ring, and live/health status. **Exactly one filled primary action per view.** Sentiments never color primary actions. Never two competing signals in one view.

### 2.3 Neutrals

Neutral bases live near the accent hue (OKLCH H 258–268°, chroma ≤ 0.027) so greys read as one temperature family, never mixed warm/cool.

**Surface inversion (Figma baseline):** the auth mock reads page = grey wash (`--lab-bg-secondary` `#F7F8FA`), card = white (`--lab-bg-primary`). Working text lives on card-white surfaces; the wash is chrome, not a reading surface.

**Label ladder law (Figma baseline):** one label ink per theme (`--lab-label-ink` — light `#3C3C43`, dark `#E4EBF7`) composited over the card at fixed strengths: secondary 72%, tertiary 52%, disabled 32%. Primary is declared (pure ink at full strength reads muddy/glaring). Tertiary is the **caption/meta tier** — never essential copy (floor-asserted, `FIGMA-BASELINE.md` §3.2).

| Token | Light | Dark | Role |
|---|---|---|---|
| `--lab-bg-primary` | `#FFFFFF` | `#0C0E13` | Card / working surface (auth card, grouped rows) |
| `--lab-bg-secondary` | `#F7F8FA` | `#14171E` | Page wash behind cards |
| `--lab-bg-tertiary` | `#EFF1F4` | `#1C2029` | Inputs, code blocks, table headers |
| `--lab-bg-grouped` | `#F2F4F7` | `#11141A` | Grouped settings lists (container) |
| `--lab-bg-grouped-row` | `#FFFFFF` | `#14171E` | Grouped list rows |
| `--lab-label-ink` | `#3C3C43` | `#E4EBF7` | Label ink base — never used directly |
| `--lab-label-p` | `#101012` | `#E9ECF2` | Primary text (17.9:1 on card) |
| `--lab-label-s` | derived `#737378` | derived `#A8ADB7` | Secondary text — card surfaces only (4.73:1) |
| `--lab-label-t` | derived `#9A9A9D` | derived `#7D838E` | Caption/meta tier only (§2.1; C2 floor ≥ 2.7) |
| `--lab-label-q` | derived `#C1C1C3` | derived `#51555C` | Disabled (WCAG 1.4.3 inactive-UI exemption) |
| `--lab-border-ink` | `#787880` | — (dark declares) | Border ink base — never used directly |
| `--lab-border-hairline` | derived `#F4F4F5` | `#262B35` | Decorative separators (no AA requirement) |
| `--lab-border-strong` | derived `#E9E9EB` | `#7E8798` | Input/control borders — **decorative** (Figma §3.4): the control boundary is the field surface + focus ring, not the border |

### 2.4 Sentiments

Sentiments communicate status only — never primary actions (destructive primaries use error sentiment only inside destructive confirmations). Status is never color-alone: always paired with text or an icon (WCAG 1.4.1).

| Token | Light | Dark | Role |
|---|---|---|---|
| `--lab-sentiment-success` | `#166534` | `#4ADE80` | Success text/icon |
| `--lab-sentiment-warning` | `#92400E` | `#FBBF24` | Warning text/icon |
| `--lab-sentiment-error` | `#FF3B30` | `#F87171` | Error **anchor** — icon/large tier (≥3:1); Figma baseline signal red |
| `--lab-sentiment-error-text` | derived (§2.1) `#B72A22` | aliases anchor | Error body text (4.5:1 on card and on the error tint) |
| `--lab-sentiment-info` | `#075985` | `#38BDF8` | Info text/icon |
| `--lab-sentiment-*-bg` | derived (§2.1) | derived (§2.1) | Alert/badge surfaces — asserted per §2.6 in both themes |

### 2.5 Dark is a separate design

Dark redefines **bases**, and the derivation laws recompute the deriveds — with two deliberate re-measurements where the light law would fail:

1. `--lab-accent-text`: the light rule ("text = strong member") yields 3.7:1 on `#0C0E13` — a failure. Dark solves the role separately: anchor 66% ⊕ 34% white → `#57A7FF`, measured **7.70:1** on primary bg, 7.15:1 on secondary.
2. Shadows: light alphas (6–16%) vanish on near-black. Dark re-measures the ladder at 30–60% alpha over pure black (§7).

The rest of the dark palette is solved per surface (label P on dark primary: 15.9:1), not channel-inverted. **Anti-drift:** the `[data-theme="dark"]` block and the `prefers-color-scheme: dark` block are asserted byte-identical, so the two dark entry points can never diverge.

### 2.6 Contrast contract (WCAG 2.2 AA, machine-checked)

Every legal foreground/background composition is enumerated in `packages/ui/qa/contrast-pairs.ts` and asserted programmatically in **both themes** on every test run — the checker first *resolves* `var()` and `color-mix()` chains to hex, so derived tokens are verified as rendered: **4.5:1** for body text, **3:1** for large text and non-text UI. The full matrix: label P × all five backgrounds (4.5), label S × card surfaces (4.5, scope per the Figma baseline §3.1), accent text on primary/secondary (4.5), on-accent on the anchor fill (3, large-tier per Figma §3.3) and on strong/hover fills (4.5), signal anchor on primary/secondary (3, non-text/large only), sentiments on primary bg and on their derived tints (error split: text member at 4.5, anchor at 3). The caption tier (label T × card surfaces) lives in `CAPTION_PAIRS` with a ≥ 2.7 floor (rubric C2) — meta-only, never essential copy. Adding a new pairing to a component without adding it to the manifest and this table is a design-system violation.

Measured ratios are produced by the rubric run (`bun run qa:rubric`), not maintained by hand — the manifest is the contract, the test output is the evidence.

---

## 3. Typography

**Geist is the brand font** (lab.pics/brand; wired via `next/font`, woff2, self-hosted). Geist Mono is the data voice — all identity payloads (client IDs, session IDs, fingerprints, RFC3339 timestamps, keys, payload previews) render in mono, never proportional. **Two families total; no third family may be added.** Weights are restricted to 400/500/600 for roles, with 700 legal only for inline `<strong>` emphasis. Tables and countdowns set `font-variant-numeric: tabular-nums` so digits never jitter.

### 3.1 Scale derivation (the law, machine-checked)

The scale is **major third (×1.25) from a 15px base, snapped to the nearest even pixel** so that every role's line box lands on the 4px baseline grid:

```
15 → ×1.25 = 18.75 → 18   → ×1.25 = 22.5 → 22
   → ×1.25 = 27.5  → 28   → ×1.25 = 35   → 36
```

13px is not on the ratio ladder — it is the **persistent-UI floor** (the smallest size allowed for always-visible text) and serves small/label/caps/mono. 16px exists for one reason only: inputs (§3.2, iOS zoom floor). The rubric (T7) recomputes the ladder from the base and fails if any size token deviates.

**Off-ladder exceptions (Figma baseline, owner-accepted):** `--lab-text-title` (20/20) and `--lab-text-caption` (12/16) come from the auth mock and sit outside both the ×1.25 ladder and the 13px floor. They are scoped to the auth surface (title = one-line card lockup; caption = non-essential meta) and asserted **by value** in the rubric (F1) instead of by the ladder law — see `docs/design/FIGMA-BASELINE.md` §3.5.

**Leading law:** each role's line box is the smallest 4px multiple ≥ size × target band (headings 1.15–1.35, body/small 1.5–1.6). Line heights are stored in tokens as visible fractions — `calc(36 / 28)`, not a rounded decimal — so the derivation is auditable. Any role reaching 3+ lines keeps leading ≥ 1.4 by construction (all body-band roles are ≥ 1.5; headings are structurally 1–2 lines and additionally `text-wrap: balance`).

### 3.2 Role table — one decision per role: size × line box × weight × tracking

| Role | Token | Size / line box | Weight | Tracking | Used for |
|---|---|---|---|---|---|
| display | `--lab-text-display` | 36px / 44px (1.222) | 600 | −0.02em | Display surface only (§1): login brand moment, empty states |
| h1 | `--lab-text-h1` | 28px / 36px (1.286) | 600 | −0.015em | Page titles (exactly one per screen) |
| h2 | `--lab-text-h2` | 22px / 28px (1.273) | 600 | −0.01em | Section titles |
| h3 | `--lab-text-h3` | 18px / 24px (1.333) | 600 | −0.005em | Card/group titles |
| title | `--lab-text-title` | 20px / 20px (1.0) | 600 | −0.0165em (−0.33px) | **Auth-card lockup only** (Figma baseline §1.7) — one-line title, off-ladder by owner decision |
| caption | `--lab-text-caption` | 12px / 16px (1.333) | 500 | 0 | Non-essential meta/caption tier (pairs with `--lab-label-t`), off-floor by owner decision |
| body | `--lab-text-body` | 15px / 24px (1.6) | 400 | 0 | Default reading text |
| small | `--lab-text-small` | 13px / 20px (1.538) | 400 | 0 | Meta prose, captions |
| label | `--lab-text-label` | 13px / 20px (1.538) | 500 | 0 | Buttons, field labels, tabs |
| caps | `--lab-text-caps` | 13px / 20px (1.538) | 500 | +0.08em | Uppercase kickers/section eyebrows only |
| mono | `--lab-text-mono` | 13px / 20px (1.538) | 400 | 0 | IDs, keys, timestamps (Geist Mono, tabular-nums) |
| input | `--lab-text-input` | 16px / 24px (1.5) | 400 | 0 | Text entry — 16px floor prevents iOS Safari auto-zoom |

**Tracking law:** negative tracking grades with size (−0.02em at 36px → 0 at 15px); body and small are never negatively tracked; positive tracking exists only on `caps` (+0.08em with `text-transform: uppercase`). A component that sets `letter-spacing` outside these role tokens is a violation.

### 3.3 Measure & wrapping policy

- Body copy wraps at **`--lab-measure` = 65ch** (60–75ch window); the token is the only legal max-width for prose.
- Headings: `text-wrap: balance`. Body paragraphs: `text-wrap: pretty` (no orphans on modern engines, harmless degrade).
- Long mono strings (keys, URIs): `overflow-wrap: break-word` inside `CopyField`/`CodeBlock`, always with a copy affordance; tables truncate with a title-attribute fallback, never silent `overflow: hidden` on identity data.
- One `h1` per screen; heading levels never skip.

---

## 4. Spacing & Layout

- **4px base grid.** The spacing scale is `--lab-space-4/8/12/16/24/32/36/48/64` — nine steps: ×2 up to 16 for intra-control precision, then 1.5×–2× strides for section rhythm. Granularity justification: 4/8/12 exist because control padding at 13–15px type needs sub-16px steps (a 13px label inside a 44px control takes 12px vertical padding); no step between 16 and 24 exists because nothing in the brief's 51 screens composes at 20px; **36 is the Figma auth-card section gap** (`FIGMA-BASELINE.md` §1.8 — the card composes 48 padding / 36 gap / 24 bottom). Off-grid px values in committed CSS fail the QA rubric.
- **Grouping law: between-group gap ≥ 2× within-group gap.** Concretely: items inside a group sit at 8 or 12; sibling groups sit at 24 or 32; sections sit at 48 or 64. Separation is expressed by space first; a hairline may only *reinforce* a ≥2× gap, never substitute for it (no divider-soup).
- **Alignment & density:** labels and values in ledgers left-align to a shared column edge; numeric table columns right-align with `tabular-nums`; icons vertically center against the text line box, not the font baseline. Density is uniform per surface — no per-row custom padding.
- **Logical properties:** all new CSS uses `margin-inline` / `padding-block` / `inset-inline` so the system survives RTL without a rewrite.

Breakpoints (fluid, not device-locked; one min-width convention — Tailwind `sm:`/`lg:` variants map to the same values in `apps/web` `@theme`):

| Range | Min-width token | Behavior |
|---|---|---|
| base (< 640px) | — | Single column, bottom-sheet menus, full-width actions |
| `sm` (≥ 640px) | `--bp-sm` = 40rem | 2-col grids, tables→cards, drawer nav |
| `lg` (≥ 1024px) | `--bp-lg` = 64rem | Full shell (sidebar), 3–4 col grids, split panels |

Shell maxima (tokens, Figma baseline §1.8): auth card `--lab-shell-auth` **480px** with a **384px** content column (`--lab-shell-auth-content`), card padding 48/48/24/48 (top/inline/bottom) and section gap 36 (`--lab-space-36`); account settings content `--lab-shell-content` 720px; list surfaces `--lab-shell-list` 1100px. Control height is **48px** (`--lab-size-control`); OTP cells are 48×56 (`--lab-size-otp-w/h`); the brand logo tile is 48px at `--lab-radius-md` (`--lab-size-logo-tile`). Touch targets ≥ 24×24px minimum, **44×44px preferred** (`--lab-size-touch`) with ≥ 8px gaps (WCAG 2.5.8); inputs ≥ 16px text on mobile (§3.2). Reflow: no content loss at 320px width and no horizontal scroll at 200% zoom (WCAG 1.4.10); 400% zoom keeps the auth flow completable.

---

## 5. Components

Only the components below may be built (ch08/ch09 scope). Anything else requires updating this inventory first. All of them read only `var(--lab-*)`. The QA rubric extracts every component name the 51 screens reference from the brief and asserts each one appears here — the inventory and the brief cannot drift.

### 5.1 Primitives

`Button` (primary/secondary/ghost/destructive-in-confirm; pill radius allowed), `TextField`, `EmailField`, `PasswordField` (+ strength meter, reveal toggle), `NumberField`, `SearchField`, `OtpField` (single masked field preferred; `inputmode=numeric`, `autocomplete=one-time-code`), `CodeField`, `DeviceCodeField`, `Select`, `Checkbox`, `Toggle` (text on/off state), `TextLink`, `LinkButton`, `Badge`/`StatusDot` (8px dot + text, never color-alone), `StatusBadge`, `RoleBadge`, `CurrentBadge`, `GitBadge`, `DeliveryBadge`, `Avatar`, `AvatarPicker`, `ThemeToggle`, `BrandMark` (flask, 32/48/64px, clear-space per brand), `ExportButton`, `RevokeButton`, `RetryButton`, `TestButton`, `EditButton`, `CopyField`/`CodeBlock` (mono, copy with `aria-live` feedback), `ClientIdChip`, `ScopeChips`, `CapabilityChips`, `FilterChips`.

### 5.2 Auth-flow composition (surface A)

`PasskeyButton` (large primary, biometric affordance), `CountdownLink` (resend with `Countdown`), `FactorTabs`, `QrPanel` (TOTP enrolment), `BackupCodesCard` (+ `ShowOnceGate`), `ApplicantCard` (join-request review), `ScopeLedger` (consent scope list), `IdentityBar` (who-is-signing-in strip), `DeviceRow`, `StatusTile`, `Stepper`.

### 5.3 Account composition (surface B)

`PostureBanner` (security-posture summary), `FactorLedger`, `FactorList`, `PasskeyLedger`, `AddMenu`, `RenameDialog`, `SessionLedger`, `SessionList`, `RevokeDialog`, `GrantLedger`, `ProviderRow`, `AuditLedger`, `OrgLedger`, `CreateDialog`, `JoinDialog`.

### 5.4 Admin composition (surface C)

`MetricCard`, `AlertBanner`, `QuickActions`, `InviteDialog`, `MemberHeader`, `MemberRowMenu`, `MemberSubTable`, `RoleLedger`, `CapabilityLedger`, `AppLedger`, `AppMiniLedger`, `RowMenu`, `UriListEditor`, `ScopeEditor`, `ReviewCard`, `EndpointList`, `TabNav`, `SecretLedger`, `RotateFlow`, `RotateSecret`, `NoteBanner`, `ServiceAccountLedger`, `SessionTable`, `BulkRevoke`, `AuditTable`, `AdvancedFilter`, `ExpandableRow`, `ExportMenu`, `WebhookLedger`, `DeliveryLedger`, `IdpLedger`, `OidcConfigForm`, `SamlMetadataUpload`, `ScimPanel`, `DomainList`, `PolicyGroup`, `DriftBanner`, `DangerPanel`, `DeleteFlow`.

### 5.5 Developer composition (surface D)

`HeroCard` (display surface), `QuickstartSteps`, `FrameworkPicker`, `FrameworkTabs`, `CodeRail`, `CredentialPanel`, `SandboxFrame`, `ScenarioPicker`, `Inspector`, `SignatureHelper`, `SyncStatus`, `EnvChecklist`, `ErrorReferenceTable`, `UsageBar`, `LimitsTable`.

### 5.6 Shared shells & feedback

`Card` (max one primary card per view — no card soup), `GroupedList`, `Ledger` (numbered record rows: audit, sessions, grants, webhooks, factors), `DataTable` (`th scope`, `aria-sort`, →cards on mobile), `Tabs`, `Dialog`/`ConfirmDialog` (focus trap, escape, restore focus), `Drawer`, `BottomSheet`, `Toast`/`StatusBanner` (`role=status`/`role=alert`), `SkeletonBlock` (layout-reserving), `ShowOnceGate` (secrets/backup codes), `EmptyState` (teaches next action), `Countdown` (`aria-live=polite`), `FilterBar`, `Pagination`, `SaveBar`, `StrengthMeter`.

### 5.7 Iconography — decision: `@labpics/icons`

(lab-icons, v0.2.0, MIT, 444 SVG Filled + Outline, tree-shakeable ESM — published by the studio, verified on npm 2026-08-11). One family, no emojis as icons ever, Outline as the default working style with Filled reserved for active/selected states. Rationale: it is the brand-native family the brief targets (SF-Symbols-competing), it is publicly licensed for this repo, and it keeps the icon language identical to the rest of the Labpics estate — any third-party set would be a second visual voice. The rubric forbids importing any other icon family (`@radix-ui/react-icons`, phosphor, lucide, heroicons, react-icons, tabler, feather) and scans component source for emoji codepoints. Sizes via `--lab-icon-sm/md/lg` (16/20/24). Icons never carry meaning by color alone. The dependency is added in ch08 with the first icon-consuming component, not in this tokens-only PR.

---

## 6. Motion & Interaction

Timing tokens mirror the `@labpics/motion` character presets. Components read only `var(--lab-motion-*)` / `var(--lab-ease-*)`.

| Character | Token | Duration | Easing | Used for |
|---|---|---|---|---|
| instant | `--lab-motion-instant` | 80ms | `--lab-ease-linear` / `--lab-ease-out` | Control state changes, filter/re-sort |
| calm | `--lab-motion-calm` | 200ms | `--lab-ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) | Dialogs, drawers, page transitions, error reveals |
| ceremony | `--lab-motion-ceremony` | 400ms | spring (engine) / `--lab-ease-out` fallback | Consent confirm, factor enroll success, "signed in" (includes a 1-beat hold) |

### 6.1 Transition property law

`transition: all` is **forbidden** (rubric-scanned in CSS and TSX, including the Tailwind `transition-all` utility). Every transition names its properties from this allow-list: `background-color`, `border-color`, `color`, `fill`, `stroke`, `opacity`, `box-shadow`, `transform`. Layout properties (`width`, `height`, `margin`, `padding`, `top/left`) never transition. Keyframe animations are reserved for one-shot entrances and the skeleton shimmer — never for looping attention-seeking.

### 6.2 Micro-interaction recipes (exact)

- **Button press:** `transform: scale(var(--lab-press-scale))` = **0.97** (never below 0.95) over `--lab-motion-instant`, release springs back over the same duration. The fill change is the *static* cue; the scale is reinforcement — motion is never the only feedback channel.
- **High-frequency interactions get no custom animation:** checkbox ticks, toggle knobs, table row hover, tab switches change state within `--lab-motion-instant` (80ms) or instantly; nothing bounces on the hundredth click of a working day.
- **Focus ring:** appears with an 80ms opacity fade; never animates position or size while held.
- **Async ops:** inline button progress (label → spinner → check) with `aria-live` completion announcement — never whole-screen blocking.
- **List entrances:** stagger ≤ 4 rows × 24ms, first render only.

### 6.3 Interactive state matrix (every control implements all rows)

| State | Mechanism (never color-alone) | Exact tokens / timing |
|---|---|---|
| default | resting fill + border | role tokens (§2) |
| hover | fill shifts to derived hover; cursor | `--lab-accent-blue-hover` (or `--lab-bg-tertiary` for ghost) over `--lab-motion-instant` |
| active | press scale + fill | `scale(0.97)` + hover fill, `--lab-motion-instant` |
| focus-visible | **outline** 2px `--lab-focus-color`, offset 2px; inputs may add `--lab-shadow-focus` (4px @ 30% alpha) | 80ms opacity fade in |
| disabled | `opacity: var(--lab-opacity-disabled)` (0.5) + `cursor: not-allowed`; text falls to `--lab-label-q` | no transition |
| loading | spinner replaces label, control keeps width; `aria-busy` | spinner rotation is the one legal loop |
| selected (tabs/rows) | fill + 2px accent edge + `aria-selected` | `--lab-accent-blue` edge, instant |

`outline: none` without a same-file focus replacement fails the rubric (T4). Inactive-but-readable content (e.g. a revoked session row) uses `--lab-opacity-inactive` (0.62), distinct from disabled controls.

**Reduced motion is a character switch, not a fade-to-zero:** under `prefers-reduced-motion: reduce` the tokens collapse (ceremony→80ms, calm→80ms, instant→0ms, easing→linear, press scale→1); skeletons lose shimmer; no parallax. This lives in the token file itself, so components inherit it with zero logic.

### React dev tooling gate

`react-scan` (and any similar dev-only tooling, e.g. react-doctor) runs **strictly behind `NODE_ENV === 'development'`** — enforced by the G1 rubric check *structurally*: the checker strips properly-gated blocks and fails on any surviving reference, and a static top-level `import` fails unconditionally (it ships the module regardless of runtime checks). Production bundles must never include scan overlays.

---

## 7. Depth & Surface

**One strategy: hairline-first flatness.** Working surfaces are separated by 1px hairlines (`--lab-hairline`) on solid background tokens — never by drop shadows or grey boxes. Borders express *structure and state*; they are never an elevation substitute.

### 7.1 Elevation

Every shadow layer is **one shadow color (`--lab-color-shadow`) at an alpha** — light: `#16181D` at 6–16%; dark re-measures over pure black at 30–60% (§2.5). Levels 2 and 3 are two-layer (tight contact layer + soft ambient layer):

| Level | Token | Composition | Used for |
|---|---|---|---|
| 0 | `--lab-shadow-0` | none — hairline instead | Panels, tables, working surfaces |
| card | `--lab-shadow-card` | 4 soft layers: 0 0 1px @ 12% + 0 1px 1px @ 4% + 0 2px 2px @ 2% + 0 4px 2px @ 1% | **Auth card** (Figma baseline §1.6) — dark re-measures at 40/20/12/8% |
| 1 | `--lab-shadow-1` | 1 layer: 0 1px 2px @ 6% | Sticky bars |
| 2 | `--lab-shadow-2` | 2 layers: contact 6% + 0 4px 12px @ 10% | Dropdowns, popovers |
| 3 | `--lab-shadow-3` | 2 layers: 0 2px 8px @ 8% + 0 12px 32px @ 16% | Dialogs, bottom sheets |
| inset | `--lab-shadow-inset-control` | inset 0 −1px 1px @ 12% | Filled-control bottom finish (pairs with `--lab-accent-gradient`) |

The shadow ink is `--lab-color-shadow` = `#101012` (light; the primary label ink), pure black in dark.

The **focus ring has its own dedicated token** (`--lab-shadow-focus` = `0 0 0 4px` focus color @ 30% alpha) and is never mixed into the elevation ladder.

### 7.2 Radius — roles and the concentric law

| Token | Value | Role |
|---|---|---|
| `--lab-radius-sm` | 4px | Checkboxes, chips, inline code |
| `--lab-radius-md` | 12px | Buttons, inputs, logo tile (Figma baseline) |
| `--lab-radius-lg` | 24px | Cards, dialogs, sheets (Figma baseline) |
| `--lab-radius-pill` | 999px | Badges and pill buttons **only** |

**Concentric rule: `outer radius = inner radius + padding gap`.** A `--lab-radius-md` (12px) control inside a padded container needs the container at 12px + its padding — e.g. an input inside a card with a 12px optical gap → card corner 24px (`--lab-radius-lg`), exactly the Figma auth-card geometry. Equal nested radii are a violation (they read as a mistake at every corner). Data tables take no corner softening.

### 7.3 Z ladder & materials

`--lab-z-sticky` 100 · `--lab-z-dialog` 1000 · `--lab-z-popover` 1100 (popovers may open above dialogs). Materials: **Solid** is the default everywhere. Blur (sticky topbars, bottom sheets, command palette) and Glass (login brand panel, live session tile — nothing else; Display surface only, §1) are deferred until those surfaces are built; both must degrade to Solid under `prefers-reduced-transparency`.

---

## 8. Verification

| Check | Where | When |
|---|---|---|
| Token purity — colors (CSS + TSX arbitrary values) | `qa-rubric.test.ts` T1/T6 | every `bun test` / CI run |
| Spacing purity, focus safety | T2/T4 | every run |
| Default Tailwind palette + namespace drift in TSX | T6 | every run |
| `transition: all` / `transition-all` prohibition | T6 | every run |
| Typography derivation law (scale from base, 4px line boxes) | T7 | every run |
| WCAG AA contrast, all §2.6 pairs, both themes, `color-mix` resolved | C1 | every run |
| Caption-tier floor (≥ 2.7), label/border ladder ordering | C2 | every run |
| Figma baseline values (ink ladders, error anchor, radii, sizes, title/caption roles, card shadow, control finish) | F1 | every run |
| OKLCH hue stability of the accent family (<10°) | O1 | every run |
| Dark-theme anti-drift | D1 | every run |
| Brand anchor #007AFF, no stray hue anywhere | V1 | every run |
| Dev-tooling NODE_ENV gate (structural) | G1 | every run |
| Icon-family purity + emoji scan | T6 | every run |
| 51 screens present by ID + every referenced component in §5 | B1 | every run |
| Rule sensitivity (committed RED counterexamples per rule) | `purity-rules.test.ts` | every run |
| axe-core, keyboard paths, reflow, reduced-motion traces, Lighthouse-100 ratchet | `docs/design/QA-RUBRIC.md` | ch08/ch09, when pages exist |

The 51 screens of the brief (A1–A15, B1–B10, C1–C18, D1–D8) are asserted **individually by ID**, and every component name any screen references is asserted present in §5 — deleting a screen or a component from either document goes red.

---

## 9. Considered and rejected

1. **Perfect fourth (×1.333) type scale from 16px** — rejected: it produces 21/28/38px steps whose line boxes miss the 4px grid without heavy snapping, and a 16px body reads oversized for a data-dense admin console; 15px body with a major-third ladder keeps ledgers compact while `--lab-text-input` still honors the 16px input floor.
2. **Tailwind default palette + default spacing as the base system** — rejected: two sources of visual truth (Tailwind's scale and `--lab-*`) guarantee drift, and the default palette's hues cannot satisfy the OKLCH hue-stability law around the #007AFF anchor. The default namespaces are wiped in `@theme` and their use is rubric-scanned instead.
3. **Shadow-based elevation for cards (Material-style)** — rejected: on white working surfaces at AA-compliant alphas, shadows read as dirt around every card and triple the dark-theme maintenance (each level needs re-measuring). Hairlines carry structure at zero contrast cost; shadows are reserved for the four genuinely floating surfaces (§7.1).
4. **Runtime `@labpics/colors` WASM solver in this PR** — rejected for now (reversible): it requires a ThemeConfig runtime we do not ship yet and would make contrast guarantees depend on an engine we cannot assert in CI; static tokens + programmatic WCAG assertions give the same contract with simpler failure modes. Consumers read only `var(--lab-*)`, so adopting the engine later is a rename-free swap.
