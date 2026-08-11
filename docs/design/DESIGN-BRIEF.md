# Labpics ID — Product Design Brief (v2)

**Status:** draft for team review · **Date:** 2026-08-10 · **Author:** ux-design
**Scope:** login / account / admin / developer surfaces for **Labpics ID**
**Brand:** infrastructure product under the **Labpics** master brand (design studio, London/Moscow, est. 2017) — not an independent SaaS brand
**Stack target:** Next.js App Router (planned), React Server Components, the local `@labpics/ui` token + primitive layer (replicating the `labui`/`lab-colors` contract — see `DESIGN.md` §1 availability decision; runtime `@labpics/colors`/`@labpics/motion` adoption is a deferred option, not a current import)
**Bar:** Clerk-level *quality* benchmark only — every screen fully specified with states, responsive behavior, a11y and motion; no generic dashboard slop. We do not imitate Clerk's brand or any provider's brand.

---

## 0. How to read this brief

- **§1–§3** — design language, tokens, motion language. Read once, then reference.
- **§4** — complete screen inventory with per-screen specs (layout, hierarchy, components, interactions, states, responsive, a11y).
- **§5** — the state machine (empty / loading / error / success / partial / disabled / offline) as a shared contract.
- **§6** — responsive system.
- **§7** — WCAG commitments, per-screen.
- **§8** — user journeys (end-to-end, including edge paths).
- **§9** — objective visual QA rubric (pass/fail, machine-checkable where possible).

Every screen entry is written as: *Goal → Layout → Hierarchy → Components → Interactions → States → Responsive → A11y*. Edge states are never omitted — a screen with no specified empty/error state is not done.

---

## 1. Design language

### 1.1 Positioning

**Labpics** is a premium design studio: "Creating off-world digital products", London + Moscow, since 2017. Master brand source (verified 2026-08-10 from `lab.pics/brand`):

- **Mark:** simplified flask with an inner "liquid" volume; counterform = one-third of the mark's thickness; superelliptical curvature — *soft yet precisely engineered*.
- **Brand color:** Labpics Blue **#007AFF** — "clarity, structure, presence… bright, confident, precise — without feeling cold."
- **Brand font:** **Geist** — contemporary neo-grotesque, Swiss-modernist precision, "invisible until it needs to speak."
- **Brand philosophy:** "Design, as it should be" — measurable, readable, intentional; legacy of Swiss design — *precision, rhythm, structure* — rethought through a human lens; "clean design is honesty made visible."
- **Lab UI™** is the public design system (Figma community) — the studio's productized craft.

**Labpics ID** is an **infrastructure product under this master brand** — the identity door for the studio's own estate (and, via Lab UI, for the studio's clients). It is not a standalone consumer SaaS identity; it inherits the studio's visual DNA and the Lab UI token system. It must feel like a **precision instrument** that belongs in the Labpics family — not a generic admin skeleton, not a copy of any identity provider.

Three words: **precise · sovereign · alive** (grounded in the Swiss legacy: precision = structure, sovereign = owner-controlled clarity, alive = intentional motion).

| Word | Meaning in UI |
|---|---|
| **Precise** | Optical alignment, 4px grid, mono data, type scale that never wobbles, tokens-only color. Identity data (IDs, fingerprints, timestamps) is *shown*, not hidden in tooltips. |
| **Sovereign** | Self-hosted, Git-declared, owner-controlled. The UI communicates "this is your estate" — no vendor anxiety, no dark patterns, no nagging upsell. Consent is a ceremony, not a checkbox. |
| **Alive** | Motion from `@labpics/motion` with purpose: state changes, focus, completion. Never decoration. Respects `prefers-reduced-motion` as a *character switch* (per `lab-motion` invariant), not a fade-to-zero. |

### 1.2 Anti-patterns (explicit rejects)

- ❌ **No imitation of Clerk or any identity provider brand.** Clerk's visual identity (their blue-violet, rounded blob cards, "hello" screens) is off-limits. Our visual language comes from the Labpics brand itself (§1.3): flask mark, Labpics Blue, Geist, Swiss grid.
- ❌ **No generic shadcn-style grey-on-grey dashboard slop.** Every surface has a clear owner hierarchy, data density that scales, and a defined empty state that teaches the next step.
- ❌ **No silent failures.** Every error state is typed, explainable, actionable (see §5 state contract).
- ❌ **No "card soup".** Max one primary card per view; secondary content in table rows or detail drawers, not floating boxes.
- ❌ **No literal flask/liquid decoration on every screen.** The flask is the *mark*; the interface is Swiss-clean. Brand moments (login, consent, empty states) use the mark; working surfaces (admin tables, audit) are quiet and dense.

### 1.3 Visual anchors

1. **The mark.** Labpics flask (simplified flask + liquid counterform, superelliptical curvature) at 32/48/64px. Used: login brand moment, consent applicant identity, empty-state illustrations, topbar. Clear space ≥ 1/5 of mark height; optically balanced margins (right 50% / left 70% of width per brand page).
2. **The "signal" accent = Labpics Blue.** Brand **#007AFF** mapped into the `lab-colors` system as the primary accent (Labpics Blue family; P/S/T/Q label roles solved per surface). Used exclusively for: primary action, active nav, focus ring, live/health indicators. Everything else is neutral scale or semantic sentiment (success/warning/error/info).
3. **Mono data voice.** All identity payloads — client IDs, session IDs, fingerprints, timestamps (RFC3339 UTC), signing keys, webhook payload previews — render in a **mono face**, never proportional. This is the "instrument" look and prevents copy/paste errors.
4. **The "ledger" line.** A 1px baseline rule under every screen header. Audit, webhooks, sessions, grants — anything that is a *record* — presents as a **ledger**: numbered rows, timestamps, no decorative chrome.
5. **Swiss rhythm.** Strong horizontal baseline alignment, generous whitespace on brand moments, dense-but-readable rows on working surfaces, superelliptical corner softening on controls only (never on data).
6. **Focus as a feature.** Focus ring = 2px Labpics Blue + 2px gap (never outline:none). Keyboard navigation is first-class, not an afterthought (WCAG 2.4.7, 2.4.11 focus not obscured).
7. **Skeletons that respect layout.** Loading states never shift layout (reserve space). Skeleton = neutral-surface shimmer at system motion; under `prefers-reduced-motion` it becomes a static block (no shimmer).

### 1.4 Surfaces & environments

| Environment | Host (planned) | Theme | Purpose |
|---|---|---|---|
| Login / account (end-user) | `auth.lab.pics` → account flows | **Light default** (brand: Swiss clarity, white/blue per lab.pics), dark via theme toggle; follows `prefers-color-scheme` | Sign-in, consent, profile, sessions |
| Admin (owner/operator) | `admin.lab.pics` | **Light IC default**, dark optional | Users, roles, apps, policies, audit |
| Developer | `developers.lab.pics` | Light IC default, dark optional | App registration, tokens, webhooks, SCIM |

Rationale: **Labpics' own brand is light** — the studio site is white/blue, Geist, Swiss-clean ("bright, confident, precise — without feeling cold"). Login is the *brand moment*: light surface, flask mark, Labpics Blue — not a dark control-room. Admin/developer are *working surfaces* (light = reading many rows all day). Both must pass contrast in both themes — `lab-colors` solver guarantees it (§7.1).

> Theme toggle is a preference, not per-surface hardcode. `lab-colors` runtime provider sets `--lab-*` on `:root`/scope; components read only `var(--lab-*)` (labui contract). No hardcoded hex anywhere in UI code.

---

## 2. Design tokens (system contract)

All tokens are **semantic**, referencing `labui`/`lab-colors` primitives. UI code never contains raw values for color, radius, spacing, or motion.

### 2.1 Color roles

Base palette from `lab-colors` (`@labpics/colors`): LCS perceptual space, 4 themes (light/dark × IC), continuous curves, 36 label roles → compacted to **P/S/T/Q** per surface (per labui ADR), 10 accents (5 sentiments + teal/mint/indigo/purple/pink).

**Signal accent = Labpics Blue.** Brand #007AFF anchors a Labpics Blue accent family in `lab-colors` (perceptual curve, not a raw hex in code — the LCS solver derives light/dark theme variants from the brand anchor with the label solved per surface). #007AFF itself is the *brand source value*; runtime uses the solved `--lab-*` tokens.

| Semantic role | Maps to | Usage |
|---|---|---|
| `--lab-bg-primary` | Neutral/Primary | Page background (white-family in light) |
| `--lab-bg-secondary` | Neutral/Secondary | Cards, panels |
| `--lab-bg-tertiary` | Neutral/Tertiary | Inputs, code blocks, table header |
| `--lab-bg-grouped-*` | Neutral/Grouped/* | Grouped lists (settings) |
| `--lab-label-p` | label P | Primary text |
| `--lab-label-s` | label S | Secondary text |
| `--lab-label-t` | label T | Tertiary/caption |
| `--lab-label-q` | label Q | Disabled |
| `--lab-accent-blue` | **Labpics Blue family (#007AFF anchor)** | **Signal accent** (primary action, active nav, focus ring, live/health) |
| `--lab-sentiment-success/warning/error/info` | semantic | Status, validation, alerts |
| `--lab-border-*` | derived | Hairlines between surfaces |

Rules:
- **Accent = Labpics Blue family only** for interactive "do the primary thing". Sentiments are for status, never for primary actions (a destructive primary action uses error sentiment only inside destructive confirmations).
- Text on accent: solved by `lab-colors` (label computed from background below). No hand-picked "on-accent".
- **Never** two signals competing in one view (exception: multi-factor status list where each factor row carries its own status dot — bounded by the ledger row pattern).
- OAuth provider logos (Google/GitHub/Yandex) keep their brand colors in the login provider row — these are third-party marks, exempt from token purity by necessity; everything else is tokens-only.

### 2.2 Typography

Face families (from labui font contract + **Labpics brand: Geist is the brand font** — verified on `lab.pics/brand`):
- `--lab-font-display` — **Geist** (brand neo-grotesque; already the font in the shipped `labpics-id` auth-web — confirmed alignment, not a migration).
- `--lab-font-mono` — mono for all identity data (Geist Mono is the natural pair; confirmed in current stack).
- Ratios/steps configurable (labui requirement) but **Identity locks a canonical scale** for consistency:

| Step | Token | Size/line | Used for |
|---|---|---|---|
| display | `--lab-text-display` | ~32–40px / 1.15 | Screen titles (login brand, empty states) |
| h1 | `--lab-text-h1` | 28/1.2 | Page titles |
| h2 | `--lab-text-h2` | 22/1.3 | Section titles |
| h3 | `--lab-text-h3` | 18/1.35 | Card/group titles |
| body | `--lab-text-body` | 15/1.5 | Default |
| small | `--lab-text-small` | 13/1.45 | Meta, captions |
| mono | `--lab-text-mono` | 13/1.5 | IDs, keys, timestamps |

Baseline grid: **4px**. Type is set in `rem` (labui contract). Long mono strings wrap with `break-all`; copy affordance always present (§3.6 CopyField).

### 2.3 Spacing, radius, elevation, hairline

| Token family | Values | Rule |
|---|---|---|
| `--lab-space-*` | 4/8/12/16/24/32/48/64 | 4px grid, no off-grid values |
| `--lab-radius-*` | 4/8/12 (sm/md/lg), pills 999 | Cards 8; inputs 8; badges pill |
| `--lab-shadow-*` | elevation 0/1/2/3 | Dialog 3, dropdown 2, cards 0 (use hairline, not shadow, per instrument look) |
| `--lab-hairline` | 1px `--lab-border-*` | The only separator; no grey boxes |

### 2.4 Materials (labui Solid/Blur/Glass)

- **Solid** — default everywhere (plain background token).
- **Blur** — sticky topbars, mobile bottom sheets, command palette.
- **Glass** — reserved for: login brand panel (desktop), active session "live" tile. Nothing else. Glass always degrades to Solid under `prefers-reduced-transparency` or when flag off (labui ADR).

### 2.5 Iconography

`lab-icons` set (SF Symbols-competing, optimal & customizable, optional Lottie). Icon rules:
- 16/20/24 three sizes; stroke 1.5 at 16–20, 2 at 24.
- Icons never carry color alone — paired with label token (WCAG 1.4.1 non-color).
- Status dots (success/warning/error/neutral) are 8px filled circles + optional text; never rely on color alone.

---

## 3. Motion language (from `@labpics/motion`)

`@labpics/motion` engine: zero-dep, CSS-safe, compositor-spring, ~2KB core. Identity uses the **preset system** + a motion *character* contract.

### 3.1 Motion characters

| Character | Purpose | Preset |
|---|---|---|
| **instant** | data rows, table updates, typing | duration 0–80ms, linear/ease-out |
| **calm** | dialogs, drawers, page transitions | 160–240ms, ease-out/expo-out |
| **ceremony** | consent confirm, factor enroll success, "signed in" | 320–480ms, spring, includes a 1-beat **hold** before auto-advance |

### 3.2 Motion rules

1. **State changes over decoration.** Every animation must encode a state transition (appear/disappear, expand/collapse, progress). If it can't be named, it's cut.
2. **Layout stability.** Animate `transform`/`opacity` only (compositor). Never animate `top/left/width/height` on critical paths. Height collapse uses `grid-template-rows 0fr→1fr` or measured max-height with spring — never janky.
3. **Stagger.** Lists/ledger rows stagger ≤ 4 rows × 24ms, only on first render of a screen (never on filter/re-sort — that's *instant*).
4. **`prefers-reduced-motion` = character switch** (lab-motion invariant): ceremony→calm→instant→static. Full stop, no "ghost fade". Skeletons lose shimmer; springs become 80ms fades; no parallax/glass drift.
5. **Focus transitions.** Focus ring appears with 80ms fade+2px grow; keyboard users never see a dead state.
6. **Progress.** Async ops (submit, revoke, webhook ping) show inline progress on the button (spinner → check), then a 1-beat ceremony. Never block the whole screen for a single op; never rely on spinners alone (a11y: `aria-live` announces completion).
7. **Page transitions.** Client-side route transitions use `calm` (fade+8px rise); reduced-motion → `instant`.

---

## 4. Screen inventory (screen-by-screen)

Legend for every entry:
- **L** layout, **H** hierarchy, **C** components, **I** interactions, **S** states (§5 codes), **R** responsive, **A** a11y.

**Global shell (all auth surfaces):** centered column, max-width 440px on desktop; single-column full-width on mobile; brand mark top-center (login) or top-left (account/admin/developer with topbar). Focus trap only inside modal/dialog.

---

### SURFACE A — LOGIN (end-user, `auth.lab.pics`)

#### A1. Sign in — identifier entry (email)

- **Goal:** start authentication; route to password / passkey / magic link / SSO based on the identifier.
- **L:** Centered card (Solid secondary bg, max 440px) on light brand panel (desktop) or plain bg (mobile). Brand mark + one-line value statement ("Your Labpics estate, one door."). Email field + Continue. Below: "Sign up" link, theme toggle, SSO-org picker (if >1 org enabled).
- **H:** 1. Brand 2. Identifier 3. Continue (primary) 4. Secondary links.
- **C:** `EmailField` (autocomplete="email"), `Button(primary, full-width)`, `TextLink`, `ThemeToggle`, `BrandMark`.
- **I:** Submit → async route resolution. Known identifier → password/passkey/OTP step. Unknown → either "create account" or "check email" (per allow-list policy; default: typed "we don't have an account with this email" only if signup open).
- **S:** `loading` (button inline spinner), `error` (invalid email format; network — typed, retry), `empty` (never empty state here), `offline` (banner: "Check your connection", retry).
- **R:** Desktop centered card + brand panel (2-col, brand 50%); mobile 100% width, brand mark above.
- **A:** Label association, `aria-describedby` on error, error in `role=alert`, autocomplete, 44px touch target, no auto-submit on Enter race (single submit path).

#### A2. Sign in — password

- **Goal:** password auth (used when policy allows local auth).
- **L:** Same card; identifier shown as static "as **user@lab.pics**" + change link. Password field with show/hide + reveal icon. Forgot password link. Continue.
- **C:** `PasswordField` (autocomplete="current-password", reveal toggle 24px icon), `Button`, `TextLink`.
- **I:** Reveal toggle; Enter submits; on 401 → inline error "Incorrect password" + shake? No — `calm` error reveal (never shake; motion rules). After N failures policy-driven lockout notice appears (see A17).
- **S:** `loading`, `empty` (not applicable — identifier already resolved, screen always has context; documented n/a per §5.1), `error` (bad password — field-level, keep focus), `error` (lockout — screen-level banner with countdown), `success` (ceremony → redirect), `disabled` (during rate-limit).
- **R:** Mobile: same, single column.
- **A:** `autocomplete=current-password`, error linked `aria-describedby`, reveal button `aria-label="Show password"` + pressed state, countdown for lockout `aria-live=polite`, password managers supported (no autocomplete=off ever).

#### A3. Sign in — passkey / WebAuthn

- **Goal:** phishing-resistant passkey sign-in (primary method for write-capable roles per identity contract; `passkeysType: ALLOWED`).
- **L:** Card: "Sign in with passkey" — large centered passkey button with key icon; alternative: "Use password". Hint text: "Use your device's built-in authenticator, security key, or phone."
- **C:** `PasskeyButton` (large, primary), `TextLink`, status area.
- **I:** Tap → browser WebAuthn prompt (native, can't be styled — we style the *launcher* and the *result*). Success → ceremony. Cancel/failure → inline error with fallback options. Multiple discoverable credentials → native chooser.
- **S:** `loading` (launcher awaiting), `error` (not supported — graceful message + password/OTP fallback, never dead-end), `error` (user cancelled — "Sign in another way"), `empty` (no passkey registered on this device — offer password, then prompt to enroll after auth), `success`.
- **R:** Mobile: bottom-anchored passkey button (thumb reach), platform authenticator flows natively.
- **A:** WCAG 2.5.8 Target Size ≥44px, keyboard operable (button), `aria-live` for passkey success/failure announcements, reduced-motion: ceremony→instant. Cross-device: QR for phone as authenticator (option), focus follows.

#### A4. Sign in — email OTP / magic link

- **Goal:** passwordless email factor (policy: `passwordlessType: ALLOWED`).
- **L:** Card. "We sent a code to **user@lab.pics**". 6-char OTP input (6 boxes or single field — single masked field preferred for a11y, see A). Resend link with countdown (60s). "Use another method".
- **C:** `OtpField`, `CountdownLink`, `TextLink`, `Button`.
- **I:** Auto-advance between boxes (single-field variant: auto-submit at length 6). Paste support (single paste fills all). Resend disables 60s with `aria-live` countdown. Wrong code → inline error, keep entered, allow re-entry.
- **S:** `loading` (sending), `error` (expired code → resend), `error` (max attempts → lockout banner), `error` (network), `success`, `empty` (code not yet entered — helper text), `disabled` (resend cooling).
- **R:** OTP field scales: 6×48px desktop, 6×44px mobile, min gap 8px.
- **A:** OTP field: `inputmode="numeric"`, `autocomplete="one-time-code"`, single aria label per box ("Digit 2 of 6"), error `aria-describedby`, no auto-submit race, resend is a real button with countdown in `aria-live`.

#### A5. Sign up

- **Goal:** create account (only when signup open — `allowRegister` policy; default for the org, not public self-serve).
- **L:** Card. Name (first/last), email, password (with strength meter if password login enabled), passkey offer ("Add passkey to skip passwords"). Terms & privacy links (no fake "I agree" checkbox — consent contract is separate, see A9).
- **C:** `TextField`, `PasswordField+StrengthMeter`, `Checkbox` (only for *optional* consent, real purpose), `Button`, `TextLink`.
- **I:** Live validation (blur-triggered, never on keystroke for async), password strength meter updates live (tiered: weak/ok/strong per policy), submit → A6 email verification.
- **S:** `loading`, `error` (email exists — offer sign-in), `error` (password fails policy — specific rule listed), `error` (rate-limit), `success`, `empty` (pre-filled from invite if invited).
- **R:** Single column.
- **A:** All labels programmatically associated, error summary in `role=alert` at top **and** field-level, password meter has text labels (not color-only, WCAG 1.4.1), autocomplete="new-password", focus order = visual order.

#### A6. Email verification

- **Goal:** prove ownership of the email (post-signup or re-verify).
- **L:** Card, centered check icon (ceremony on success), email shown. "We sent a verification link to X" + OTP alternative + resend.
- **C:** `OtpField` or `Button(link)`, `CountdownLink`, `TextLink("use a different email")`.
- **I:** Link click (deep link) or OTP entry. Success → ceremony → continue to post-auth (or dashboard).
- **S:** `loading`, `error` (expired/invalid link — resend), `success`, `empty`.
- **R:** Single column.
- **A:** Success announced `aria-live=polite`, focus moves to next surface heading on redirect.

#### A7. MFA — TOTP challenge

- **Goal:** second factor via authenticator app (backup factor; passkey remains primary for write roles per contract §4).
- **L:** Card, factor selector if multiple enrolled (passkey/TOTP/backup code/OTP email). 6-digit TOTP field. "Having trouble?" → backup code / recovery.
- **C:** `OtpField`, `FactorTabs`, `TextLink`, `Button`.
- **I:** Auto-submit at 6 digits; wrong → inline error, allow re-entry; 3 wrong → policy lockout countdown.
- **S:** `loading`, `error` (invalid code), `error` (lockout), `success`, `empty`, `disabled` (factor unavailable → offer next factor).
- **A:** `autocomplete="one-time-code"`, `inputmode="numeric"`, focus on first box, errors `aria-live`, factor tabs keyboard navigable.

#### A8. MFA — backup codes (challenge)

- **Goal:** sign-in when primary factor unavailable, using one-time backup codes.
- **L:** Card, mono code field (8–10 chars, `XXXX-XXXX`), shows how many codes remain (e.g., "2 of 10 remaining — regenerate after sign-in"). Warning copy: treat like passwords.
- **C:** `CodeField` (mono, hyphen auto-format), `Button`, `TextLink` (recovery).
- **I:** Auto-format hyphen; wrong → inline error; one code = one use (server-side).
- **S:** `loading`, `error` (invalid/used), `success`, `empty`.
- **R/A:** Mono font, `aria-label="Backup code"`, no autocomplete, `spellcheck=false`, `autocapitalize=off`.

#### A9. Consent / OAuth authorization (the ceremony)

- **Goal:** user grants/denies an OIDC application access (per OAuth 2.1 consent, our own UI — never a bland checkbox page).
- **L:** **Ceremony layout** — this is the one screen with elevated drama: centered card, applicant avatar/logo + name, scope list as a *ledger* (each scope with human meaning + capability mapping), "Continue as **user@lab.pics** (not you?)". Two buttons: **Allow** (primary) and **Cancel** (secondary). Applicant-requested *write-capable* scopes are flagged with a warning tier, per identity contract: write scopes on high-privilege roles may require re-auth + MFA step-up (contract §4.3 — the UI *presents* the step-up; the broker enforces claims).
- **H:** 1. What is requesting access 2. What exactly is being granted (scope ledger) 3. Who is authorizing (identity) 4. Decision.
- **C:** `ApplicantCard`, `ScopeLedger` (each row: icon, name, human sentence, sensitivity chip), `Button(allow)`, `Button(cancel)`, `IdentityBar`.
- **I:** Expand scopes → detail (what data, what actions). Allow → ceremony (1-beat hold) → redirect to redirect_uri. Cancel → redirect with `access_denied` per spec. "Remember this decision" is **opt-in**, never default.
- **S:** `loading` (introspecting application), `error` (invalid client/redirect — typed, never leak secrets), `error` (application suspended — explanatory), `success` (decision made), `empty` (no scopes — validation error, must never render), `offline`.
- **R:** Mobile: same ceremony, bottom-anchored decision buttons (thumb), scopes in collapsible group (max 3 visible).
- **A:** Scope list is real content (not just images), contrast on chips, decision buttons ≥44px, keyboard: Allow/Cancel first tab stops in logical order, focus never trapped, `aria-live` announces completion before redirect.

#### A10. Device flow pairing

- **Goal:** sign in on a device with no browser via code (OAuth 2.0 device flow; used for machine/CLI pairing).
- **L:** Card: "Open this page on another device" → code entry (8-char `XXXX-XXXX` mono, large). Or QR (alt: code entry). Shows expiry countdown. Poll status area ("Waiting for approval…", "Approved! You can close this page.").
- **C:** `DeviceCodeField`, `QrPanel` (with alt text + code entry fallback), `Countdown`, `StatusBanner`.
- **I:** Enter code → status updates via polling. Approved → success ceremony. Expired → resubmit.
- **S:** `loading` (polling), `error` (expired), `error` (invalid code), `success` (approved — "return to your device"), `empty` (pre-entry helper), `disabled` (polling paused on tab blur).
- **R/A:** QR never sole method (WCAG 1.1.1 text alternative = code entry); countdown `aria-live=polite`; focus moves to status on state change.

#### A11. Password reset (forgot password)

- **Goal:** self-service password reset.
- **L:** Card. Step 1: email. Step 2: "Check your inbox" (link/OTP). Step 3: new password + strength. Step 4: success + "sign in with passkey instead?" (if enrolled).
- **C:** `EmailField`, `OtpField`, `PasswordField+StrengthMeter`, `Button`, stepper indicator (3 steps, calm transitions).
- **I:** Reset link validity window; reuse detection (same password as before → inline error); on success, **revoke other sessions** by default (checkbox pre-checked, real copy, per security posture; server enforces).
- **S:** `loading`, `error` (email not found — generic copy, no enumeration), `error` (expired link), `error` (weak/reused password), `success`, `empty`.
- **R/A:** Stepper is `aria-current=step`; success announced; never reveal account existence.

#### A12. Account locked / suspended

- **Goal:** communicate policy-driven lock/suspension with recovery path.
- **L:** Full-screen (not card) — lock icon, title "Your account is locked", reason tier (policy lockout vs suspension), action: "Reset password" / "Contact support" / "Try again in MM:SS" (countdown for lockout).
- **C:** `StatusBanner(error)`, `Countdown`, `Button`, `TextLink`.
- **I:** Countdown enables button; reset link.
- **S:** `loading`, `error` (recovery fails), `empty`, `success` (recovery path initiated — confirmation before redirect) — all states still render full-screen layout.
- **R/A:** `role=alert` on reason, countdown `aria-live`, no auto-redirect without notice.

#### A13. Session expired / re-authentication

- **Goal:** re-auth after session TTL or privilege escalation (step-up per contract §4.3).
- **L:** Card (preserves the flow context): "Your session expired. Sign in again to continue." — with passkey-first option, then password/OTP. If step-up triggered: "Confirm it's you to continue" + required factor badge (passkey for write-capable actions).
- **C:** `PasskeyButton`, `PasswordField`, `OtpField`, `Button`, context line ("You were about to: <action>"), `FactorTabs`.
- **I:** After success → **return to the interrupted action** (not home). Never lose the continuation URL.
- **S:** `loading`, `error`, `success`, `empty`, `disabled` (factor unavailable → alternative factor chain).
- **R/A:** Focus to first field; context preserved via query param validated server-side; step-up factor requirement announced (`aria-live`).

#### A14. MFA enrollment (onboarding ceremony)

- **Goal:** enroll passkey (primary) + TOTP (backup) at first sign-in when policy requires (identity contract: phishing-resistant factor before write-plane).
- **L:** **Ceremony wizard, 3 steps:** 1) "Add your passkey" (platform authenticator / security key / phone — native WebAuthn). 2) "Add a backup method" (TOTP scan QR + 6-digit verify, or backup codes). 3) "Done — review" (enrolled factors list + "skip for now" only if policy allows grace; write-capable roles cannot skip).
- **H:** Clear step ownership; each step one decision.
- **C:** `Stepper(3)`, `PasskeyButton`, `QrPanel`, `OtpField`, `BackupCodesCard` (one-time, mono, copy + download + "I've saved them" gate), `Button`.
- **I:** Passkey enroll → native prompt → success check (ceremony). TOTP: scan → enter code → verified. Backup codes: shown once, save gate must be confirmed before continue. Skipping shows policy consequence copy ("You won't be able to perform privileged actions until enrolled").
- **S:** `loading`, `error` (WebAuthn failure — retry/fallback), `error` (verify code wrong), `success` (per step, ceremony), `empty`.
- **R:** QR scales to 220px max; backup codes wrap; mobile: bottom-sheet for save gate.
- **A:** QR has text alt (manual entry key), backup codes readable by screen reader (real text, not image), save gate is a real checkbox with purpose, stepper `aria-current`, reduced-motion: ceremony→instant.

#### A15. Device / new-location verification (risk step, optional by policy)

- **Goal:** challenge on unrecognized device/location (policy option).
- **L:** Card: "We noticed a new device" — device fingerprint row (OS/browser/region), options: passkey / email code / TOTP / "This is a shared device" note. "Not you?" → revoke + contact support.
- **C:** `DeviceRow`, `FactorTabs`, `Button`, `TextLink`.
- **I:** Verify → session tagged with device fingerprint (visible later in sessions list). Deny → revoke candidate session.
- **S:** `loading`, `error`, `success`, `empty`.
- **R/A:** Full keyboard path, errors typed, "not you" is prominent not buried.

---

### SURFACE B — ACCOUNT (end-user, self-service)

Shell: topbar (brand, org switcher, theme, avatar) + content. Max-width 720px centered for settings; 1100px for lists.

#### B1. Account overview

- **Goal:** glanceable status: profile, security posture, active sessions, org memberships.
- **L:** Heading + 3 status tiles (Security, Sessions, Orgs) with health summaries (e.g., "Passkey enrolled · MFA active · 2 sessions"), then ledger of recent activity (5 rows, link to full audit B9).
- **H:** 1. Title 2. Posture tiles 3. Activity ledger.
- **C:** `StatusTile`, `Ledger`, `Button(manage)`, `Avatar`.
- **I:** Tile click → manage surface.
- **S:** `loading` (skeletons in tile shape), `empty` (no activity yet — teach: "Your sign-ins and changes will appear here"), `error` (posture unknown — "security status unavailable" + retry), `success`.
- **R:** Tiles stack 1→2→3 columns by breakpoint.
- **A:** Posture tiles expose status text (not color-only), heading hierarchy correct.

#### B2. Profile & preferences

- **Goal:** edit name, email (re-verify if changed), avatar, locale, timezone.
- **L:** Grouped settings list (`Grouped` backgrounds): Profile / Contact / Language / Timezone. Each row: label + current value + edit affordance (inline edit panel or drawer).
- **C:** `GroupedList`, `TextField`, `AvatarPicker`, `Select`, `SaveBar` (sticky bottom: Save / Cancel, appears on dirty).
- **I:** Email change → sends verification (A6) before commit. Locale/timezone instant apply (client + persisted).
- **S:** `loading`, `empty` (not applicable — profile always has server-backed values; documented n/a per §5.1), `error` (email already in use — typed), `error` (save failed — retry), `success` (toast "Saved", calm), `disabled` (fields locked by SSO/SCIM — show "Managed by your organization" note, no fake editability).
- **R:** Grouped list → stacked cards mobile.
- **A:** All inputs labeled, dirty-state announcement `aria-live=polite`, Save button disabled until dirty, focus returns to edit trigger on cancel.

#### B3. Security overview

- **Goal:** single security posture page: MFA status, passkeys, sessions, authorized apps.
- **L:** Grouped list of security domains, each with status line + manage. Top: posture banner (Good / Action needed with concrete next step).
- **C:** `PostureBanner`, `GroupedList` (MFA / Passkeys / Sessions / Authorized applications / Backup codes), `Button`.
- **I:** Each row → dedicated surface (B4/B5/B6/B7/B8).
- **S:** `loading`, `empty` (no factors — CTA enroll), `error` (posture fetch failed — retry), `success`.
- **R/A:** Banner is text (not color-only), list rows keyboard navigable as links.

#### B4. MFA management

- **Goal:** view/enroll/remove factors.
- **L:** Ledger of enrolled factors: type, enrolled date, last used, status dot, actions (verify/remove). "Add factor" button → factor chooser (passkey/TOTP/backup codes/email OTP) → enrollment wizard (A14 pattern).
- **C:** `FactorLedger`, `AddMenu`, `ConfirmDialog` (remove requires typed confirmation + re-auth per policy), `Button`.
- **I:** Remove → re-auth (step-up) → confirm dialog with factor name → success ceremony. Keep at least one factor enforced (policy rule: cannot remove last factor → disabled action with explainer).
- **S:** `loading`, `empty` (no factors — enroll CTA), `error`, `success`.
- **R/A:** Confirm dialog is modal with focus trap; last-factor rule announced in dialog copy.

#### B5. Passkeys

- **Goal:** manage WebAuthn credentials.
- **L:** Ledger: credential name, device/OS, created/last used, actions (rename, remove). Add passkey.
- **C:** `PasskeyLedger`, `RenameDialog`, `ConfirmDialog`, `Button`.
- **I:** Add → native WebAuthn. Rename inline (drawer). Remove → confirm + re-auth.
- **S:** `loading`, `empty` (no passkeys — CTA with benefit copy), `error`, `success`.
- **R/A:** Mono for credential IDs (truncated with copy), rename is accessible inline form.

#### B6. Sessions

- **Goal:** see all active sessions/devices; revoke.
- **L:** Ledger of sessions: device, OS/browser, region, IP (truncated), signed-in time, last active, **current session highlighted** ("This device"), revoke action per row + "Sign out all other devices".
- **C:** `SessionLedger`, `RevokeDialog`, `Button`, `CurrentBadge`.
- **I:** Revoke → confirm → ceremony → row leaves with `calm`. Sign out all others → re-auth confirm (per security: confirm identity) → mass revoke with per-row live update.
- **S:** `loading`, `empty` (should not happen — but if none: "No active sessions", edge), `error` (revoke failed — typed, row stays), `success`.
- **R:** Mobile: rows stack, revoke full-width bottom sheet.
- **A:** Current session announced (`aria-live`), revoke is destructive-confirm pattern, mono timestamps RFC3339 in a `time` element with `datetime`.

#### B7. Authorized applications

- **Goal:** review OAuth grants given to third-party/own apps; revoke.
- **L:** Ledger: app name/logo, scopes granted (collapsed, expandable), last used, revoke.
- **C:** `GrantLedger`, `ScopeChips`, `RevokeDialog`, `Button`.
- **I:** Expand scope detail; revoke → confirm → ceremony. Revoking removes the app's refresh tokens for this account.
- **S:** `loading`, `empty` (no grants — "Apps you authorize will appear here"), `error`, `success`.
- **R/A:** Scope chips have text, revoke confirm modal accessible.

#### B8. Connected accounts / external identities

- **Goal:** link/unlink external IdP identities (Google/GitHub — only if org enables external IdPs per SSO inventory).
- **L:** Grouped list of identity providers: linked status, email used, link/unlink.
- **C:** `ProviderRow`, `ConfirmDialog`, `Button`.
- **I:** Unlink last identity → warning (may require another factor); link → OIDC flow.
- **S:** `loading`, `empty` (no providers configured by org — explainer), `error`, `success`.
- **R/A:** Provider rows show logo + text (never logo alone).

#### B9. Activity log (self)

- **Goal:** see own security events: sign-ins, factor changes, session revokes, consent grants.
- **L:** Full ledger (paginated, filterable by type/date). Each row: timestamp (RFC3339), event type, summary, IP/device, status dot.
- **C:** `AuditLedger`, `FilterBar`, `Pagination`, `ExportButton(csv)`.
- **I:** Filter, paginate, export (client-side CSV for own events; server-side limit).
- **S:** `loading` (skeletons), `empty` ("No events yet — activity appears here as it happens"), `error`, `success`.
- **R:** Table → stacked cards mobile (columns collapse), filters become horizontal scroll chips.
- **A:** Table has proper `th` scope, sortable columns announce state, export accessible via keyboard.

#### B10. Organizations

- **Goal:** view memberships, switch org, create/leave org.
- **L:** Ledger of orgs: name, role, member since, switch/leave. "Create organization" / "Join with code".
- **C:** `OrgLedger`, `CreateDialog`, `JoinDialog(code)`, `Button`, `RoleBadge`.
- **I:** Switch → session context swap (S3: keep other sessions intact). Create → name + slug preview (mono, validity check). Leave → confirm (last owner cannot leave — handover required).
- **S:** `loading`, `empty` (no orgs — create/join CTA), `error` (slug taken), `success`.
- **R/A:** Create dialog validates slug live (mono, `aria-live`), leave-last-owner rule explained in dialog.

---

### SURFACE C — ADMIN (owner/operator, `admin.lab.pics`)

Shell: sidebar nav (collapsible) + topbar (breadcrumbs, theme, avatar) + content. Nav: Overview, Members, Roles, Groups, Applications, Service accounts, Sessions, Audit, Webhooks, SSO & SCIM, Security policies, Settings.

#### C1. Admin overview

- **Goal:** estate pulse: counts, recent audit, open alerts (e.g., drift RC≠0, policy warnings, pending invites).
- **L:** Metric row (Members / Applications / Service accounts / Active sessions), alert band (security-relevant events), recent audit ledger (10), quick actions.
- **C:** `MetricCard`, `AlertBanner`, `AuditLedger`, `QuickActions`.
- **I:** Metric click → filtered list. Alert → detail with action.
- **S:** `loading`, `empty` (fresh org — onboarding checklist, e.g., "Add your first app, set MFA policy"), `error` (estate status unavailable), `success`.
- **R:** Metrics 4→2→1 cols; alert band full-width.
- **A:** Metric values real text, alerts `role=alert`, checklist is real list.

#### C2. Members

- **Goal:** manage human members (Git-SSOT: grants are live-state via audited tooling — the UI presents and requests, the API writes with ledger).
- **L:** Table: member (avatar+name+email), role, status (active/invited/disabled), MFA status, last active, actions menu. Search + filter (status/role/MFA) + sort. Invite button.
- **C:** `DataTable`, `SearchField`, `FilterChips`, `InviteDialog`, `MemberRowMenu`, `Pagination`.
- **I:** Invite → email list (multi) → role picker → sends invites (A6 flow for recipient). Row menu: view profile (drawer), change role, disable/enable, revoke sessions, remove (confirm). Bulk actions with selection checkboxes.
- **S:** `loading`, `empty` ("No members yet — invite your team"), `empty` (filter no-match — "No members match your filters" + clear), `error` (fetch failed — retry), `success` (invite sent / role changed / disabled — toast calm), `disabled` (role locked by policy).
- **R:** Table → cards mobile; actions menu → bottom sheet; search pinned sticky.
- **A:** Table semantics (`th scope`, sort aria-sort), role change is confirm dialog with consequence copy, disabled members visibly labeled (not just gray), bulk actions `aria-live` count.

#### C3. Member profile (drawer/full page)

- **Goal:** one member's full record.
- **L:** Header (avatar, name, email, role, status, MFA badge), tabs: Overview / Sessions / Roles & grants / Activity. Overview: contact, MFA factors, last active, invited/created timestamps, ID (mono+copy).
- **C:** `MemberHeader`, `Tabs`, `FactorList`, `SessionList(mini)`, `AuditLedger(mini)`, `RevokeButton`, `RoleBadge`.
- **I:** Revoke sessions (contract §3: revoke ≤60s) → confirm with consequence → ceremony → live status change. Change role → confirm (blast-radius copy). Disable → confirm.
- **S:** `loading`, `empty` (no sessions — fine, show note; no activity — "No events yet"), `error` (profile unavailable), `success`.
- **R:** Tabs → stacked sections mobile (no horizontal tab scroll).
- **A:** All timestamps `time[datetime]`, revoke is high-consequence confirm (typed role if removing last admin), MFA status text.

#### C4. Roles

- **Goal:** view role catalog (declared in `policies.yml` — read-only from Git SSOT; UI may not *create* undeclared roles, shows "declared in Git" linkage).
- **L:** Ledger of roles: name, description, scope (org/project), member count, capabilities chip list, "declared in Git" badge with commit SHA (mono). Click → role detail.
- **C:** `RoleLedger`, `GitBadge`, `CapabilityChips`, `Button(view in Git)`.
- **I:** Drill into role detail: capabilities, members with this role, policy linkage. All edits routed to Git PR flow (UI can open a pre-filled PR link or show "propose change" that leads to the GitOps path — per contract R1.1: Git is the only declaration).
- **S:** `loading`, `empty` (no roles declared — link to policies.yml), `error` (drift detected — banner: "Live state differs from Git declaration"), `success`.
- **R/A:** Capability chips text-based, Git badge opens repo (external link with `rel=noopener`).

#### C5. Role detail

- **Goal:** full role contract: capabilities, members, policy source.
- **L:** Header (name, Git SHA, member count). Tabs: Capabilities (ledger: capability → allowed tools/actions), Members (table subset), Source (YAML block, mono, read-only, with "edit in Git" link).
- **C:** `CapabilityLedger`, `MemberSubTable`, `CodeBlock(readonly, mono)`, `LinkButton`.
- **I:** Member click → member profile. Capability expand → detail.
- **S:** `loading`, `empty` (no capabilities — must not happen, validation), `error` (drift), `success`.
- **R/A:** YAML block horizontally scrollable with keyboard, mono, copy button.

#### C6. Applications (OIDC clients)

- **Goal:** manage registered apps (`identity.yml` projects/apps — declared; UI reads live state, mutations via GitOps + reconciler).
- **L:** Ledger of apps: name, type (OIDC public/confidential, SAML), project, status (active/suspended), client ID (mono truncated+copy), last used, actions. Create button.
- **C:** `AppLedger`, `SearchField`, `CreateDialog`, `RowMenu`, `StatusBadge`, `ClientIdChip`.
- **I:** Create → wizard (C7). Row menu: detail, suspend/activate, rotate secret (C9), delete (confirm, typed name — revokes all grants, high consequence).
- **S:** `loading`, `empty` ("No applications yet — register your first client"), `empty` (filter no-match), `error`, `success`.
- **R/A:** Client ID always mono+copy (never truncated without copy), status text, delete typed-confirmation.

#### C7. Application create wizard

- **Goal:** register an OIDC/SAML client.
- **L:** Stepper: 1) Name & type (public with PKCE / confidential / SAML / service account link) 2) Redirect URIs & allowed origins (mono list, validation: https required except loopback) 3) Auth methods (PKCE/no-secret vs secret, token type opaque/jwt per identity contract §3.4) 4) Scopes & claims 5) Review.
- **C:** `Stepper(5)`, `TextField`, `UriListEditor`, `Select`, `ScopeEditor`, `ReviewCard`, `Button`.
- **I:** Live redirect-URI validation (loopback `http://localhost` allowed, else https), scope presets with expand, review shows full contract, submit → success ceremony → C8 (keys/endpoints).
- **S:** `loading`, `error` (redirect invalid — field), `error` (duplicate name), `error` (save failed), `success`, `empty` (no scopes selected — validation error, cannot proceed).
- **R/A:** URI list editor keyboard-addable, stepper `aria-current`, validation errors `aria-live` per step.

#### C8. Application detail — overview & endpoints

- **Goal:** the app's operational face.
- **L:** Header (name, status, type, project). Tabs: Overview / Settings / Credentials / Logins (sessions) / Webhooks / SCIM / Danger.
  Overview: client ID + secret status (set/rotated date), issuer URL, discovery URL, all endpoint URLs in mono code blocks with copy (authorize, token, userinfo, JWKS, introspection, revoke, device).
- **C:** `EndpointList` (each: label, mono URL, copy), `CodeBlock`, `StatusBadge`, `TabNav`.
- **I:** Copy endpoints; view discovery JSON.
- **S:** `loading`, `empty` (no endpoints — must not happen, error), `error`, `success`.
- **R/A:** Endpoints mono + copy, horizontal scroll ok, copy feedback `aria-live`.

#### C9. Application detail — credentials

- **Goal:** manage client secrets & token settings.
- **L:** Secret ledger: secret id (suffix), created, expires, last used, revoke. Rotate flow: generate new → **show once** (mono, copy, "I've saved it" gate) → old secret grace period (configurable) → revoke old. Token settings: token type (opaque/jwt per contract), lifetimes (instance-level note for access token TTL), PKCE enforcement.
- **C:** `SecretLedger`, `RotateFlow` (show-once gate), `Select`, `NoteBanner` (instance TTL blast-radius note per contract §3.4/3.7), `Button`.
- **I:** Rotate → confirm → show-once ceremony → grace toggle → revoke old. Never show existing secret again (show-once invariant).
- **S:** `loading`, `empty` (no secrets — create), `error` (rotate failed — typed), `success`, `disabled` (public PKCE client has no secret — explainer instead of dead control).
- **R/A:** Show-once gate identical to A14 backup codes pattern; secrets never in DOM after close (clear on close); copy feedback accessible.

#### C10. Service accounts (machine identities)

- **Goal:** manage machine identities (`identity.yml` machine_identities; key-based auth `private-key-jwt` recommended per contract).
- **L:** Ledger: name, project, auth method (private-key-jwt/PAT/client-credentials), scopes, status, last used, actions. Create.
- **C:** `ServiceAccountLedger`, `CreateDialog`, `RowMenu`, `ScopeChips`, `StatusBadge`.
- **I:** Create → name + auth method → generate key pair (private key **shown once**, PKCS8 PEM, copy/download, gate) or PAT (expiry, scopes). Rotate/revoke keys (show-once invariant).
- **S:** `loading`, `empty` ("No service accounts — create one for automated access"), `error`, `success`.
- **R/A:** PEM key in mono code block with copy+download, show-once gate, scope chips text.

#### C11. Sessions (admin view)

- **Goal:** see estate-wide sessions; bulk revoke.
- **L:** Table: member, device, IP/region, started, last active, current, actions (revoke). Filters: member/status/device. "Revoke all sessions for X member" and policy-driven bulk.
- **C:** `SessionTable`, `FilterBar`, `BulkRevoke`, `RevokeDialog`.
- **I:** Revoke → confirm → ceremony (contract: ≤60s effect on broker; UI shows "revoking" state until confirmed done).
- **S:** `loading`, `empty` (no sessions), `error`, `success`.
- **R/A:** Matches B6 pattern; bulk actions `aria-live`.

#### C12. Audit log (full estate)

- **Goal:** immutable-ish security/ops ledger: auth events, grants, role changes, app mutations, policy drift checks, webhook deliveries, admin actions.
- **L:** Full ledger table: timestamp (RFC3339 UTC, mono), actor (member/machine), action, resource, result (success/denied/failed), IP/device, details (expandable JSON). Filters: date range, actor, action type, result, resource. Export (CSV/JSON). Retention note.
- **C:** `AuditTable`, `AdvancedFilter`, `ExpandableRow`, `ExportMenu`, `Pagination/VirtualScroll`.
- **I:** Expand row → raw event JSON (mono, copy). Filter combos. Export respects RBAC (sensitive fields masked per role).
- **S:** `loading` (virtualized), `empty` ("No audit events in this range"), `error` (audit unavailable — "audit trail is temporarily unavailable, events are not lost" + retry), `success`.
- **R:** Table → cards mobile with expand; filters become collapsible panel.
- **A:** Table semantics, sort `aria-sort`, expandable rows keyboard accessible (button pattern), JSON block readable + copy, timestamps in `time[datetime]`.

#### C13. Webhooks

- **Goal:** configure outbound event delivery.
- **L:** Ledger of endpoints: name, URL, events count, status (active/disabled), last delivery (status + latency), failures, actions. Create.
- **C:** `WebhookLedger`, `CreateDialog`, `DeliveryBadge`, `RowMenu`.
- **I:** Create → wizard: URL, event selection (typed list from domain: user.created, session.revoked, member.role_changed, app.secret_rotated, webhook.delivery_failed…), signing secret (auto-generated, shown once, mono), test ping.
- **S:** `loading`, `empty` ("No webhooks — receive events when users, sessions, or security settings change"), `error`, `success`.
- **R/A:** Signing secret show-once, URL https validation, event list checkboxes with `aria-describedby` grouping.

#### C14. Webhook detail & deliveries

- **Goal:** inspect delivery attempts, retry, redeliver.
- **L:** Header (endpoint, status). Tabs: Overview (URL, events, signing secret rotate) / Deliveries (ledger: timestamp, event, attempt, status, latency, response code; expand → request/response body JSON, mono, copy; retry).
- **C:** `DeliveryLedger`, `RetryButton`, `CodeBlock`, `RotateSecret`.
- **I:** Retry → attempt ceremony → status update live. Rotate secret → show-once.
- **S:** `loading`, `empty` ("No deliveries yet — send a test ping"), `error` (delivery failed — row shows failure + retry), `success`.
- **R/A:** Delivery status text+dot, retry is button with result `aria-live`.

#### C15. SSO & SCIM

- **Goal:** configure external identity providers (OIDC/SAML) and SCIM provisioning.
- **L:** Grouped sections: **Identity providers** (ledger of IdP configs: type OIDC/SAML, issuer, status; add/edit), **SCIM** (endpoint URL, token status, provisioning direction, sync status/last run, logs), **Domain** (verified domains, enforcement toggle: "require SSO for domain").
- **C:** `IdpLedger`, `OidcConfigForm`, `SamlMetadataUpload`, `ScimPanel`, `DomainList`, `Toggle`.
- **I:** Add IdP → discovery URL auto-fill (mono), redirect/callback URIs shown for copy into provider. Verify domain → DNS record display (mono, copy) → poll verification. SCIM token → generate (show once), endpoint URL copy.
- **S:** `loading`, `empty` (no IdP — "Connect your identity provider"; no SCIM — "Enable automated provisioning"), `error` (metadata invalid, domain verification failed — typed), `success`.
- **R/A:** DNS records mono+copy, Toggle has text on/off state (not just color), SCIM token show-once gate.

#### C16. Security policies

- **Goal:** view/adjust declared policies (source: `policies.yml` — Git SSOT; UI edits produce a declarative diff / PR link, or shows "managed in Git" with read-only display + drift status).
- **L:** Grouped sections with status + edit affordance: **Login** (allow registration, passwordless methods), **Password** (min length, complexity, history, expiry), **MFA** (force MFA toggle, force MFA local only, phishing-resistant factor requirement for write roles, skip-window), **Session** (lifetime, inactivity, revocation), **Lockout** (attempts, window, duration), **Rate limits**.
- **C:** `PolicyGroup`, `Toggle`, `NumberField`, `Select`, `DriftBanner`, `EditButton(opens Git PR flow)`.
- **I:** Every toggle has consequence copy (e.g., enabling force MFA shows impact: "All members will be required to enroll a passkey on next sign-in"). Saving routes to GitOps change proposal (PR) — never direct live mutation (contract R1.2). Drift banner: "Live differs from Git" with reconcile link.
- **S:** `loading`, `empty` (no policies — must not happen, error), `error` (policy unavailable / drift unknown — fail-closed display), `success` (proposal created — link to PR).
- **R/A:** Toggles with text labels, consequence copy is real text, PR link external-safe.

#### C17. Settings — organization

- **Goal:** org identity: name, slug, logo, verified domain, locale, security contact.
- **L:** Grouped list.
- **C:** `TextField`, `AvatarPicker`, `DomainList`, `Select`.
- **I:** Slug change → redirect awareness + warning (existing links break); domain add → verification flow (C15 pattern).
- **S:** `loading`, `empty`, `error`, `success` (toast).
- **R/A:** Standard grouped-list a11y.

#### C18. Danger zone (admin)

- **Goal:** high-consequence org operations: export all data, delete organization.
- **L:** Distinct red-tier panel (error sentiment only here). Export: generate archive (async, notification). Delete: typed-name + re-auth (step-up) + irreversible copy + confirm.
- **C:** `DangerPanel`, `ExportButton(async)`, `DeleteFlow` (typed name + step-up + final confirm).
- **I:** Export → async job, notification on completion (email + in-app). Delete → step-up (passkey required) → typed org name → final confirm → ceremony → redirect.
- **S:** `loading`, `empty` (no data to export — show "nothing to export yet"), `error`, `success`.
- **R/A:** Delete flow never skips confirm, typed name exact-match, step-up explained, `aria-live` on async export status.

---

### SURFACE D — DEVELOPER (`developers.lab.pics`)

Shell: sidebar (Quickstart, Applications, Keys & tokens, Auth flows, Webhooks, SCIM, SDKs, API reference, Usage) + code-adjacent layout (content + right rail for code samples on desktop; code below on mobile).

#### D1. Developer overview

- **Goal:** fastest path from zero to first working auth flow.
- **L:** Hero: "Add sign-in to your app in minutes" + primary CTA (Create application). Quickstart steps (1-2-3 with live status: Create app → Copy endpoints → Use SDK). Recent apps ledger. Live sandbox hint.
- **C:** `HeroCard`, `QuickstartSteps`, `AppMiniLedger`, `Button`.
- **I:** Quickstart click → relevant setup (D2/D3/D7).
- **S:** `loading`, `empty` (no apps yet — hero only, no dead panels), `error`, `success`.
- **R/A:** Steps are real ordered list, code samples in mono blocks.

#### D2. Create application (developer wizard)

- **Goal:** register client with developer velocity.
- **L:** Stepper: 1) Name + framework picker (Next.js/React/other — sets defaults) 2) Auth methods (passkey/email/password per policy; defaults from security policy) 3) Redirect URIs (auto-suggested `localhost` + production) 4) Scopes 5) Review. Right rail: live code sample updating as steps complete.
- **C:** `Stepper(5)`, `FrameworkPicker`, `UriListEditor`, `ScopeEditor`, `CodeRail`, `Button`.
- **I:** Live code rail mirrors choices (SDK snippet changes). Completion → success → jump to Credentials (D3).
- **S:** `loading`, `error` (per-field, typed), `success`, `empty`.
- **R:** Code rail → below steps on mobile (full-width mono block, horizontal scroll).
- **A:** Code sample is real text (copyable), stepper `aria-current`, code updates announced `aria-live=polite` (rate-limited).

#### D3. App credentials (developer)

- **Goal:** keys, endpoints, quickstart code for the app.
- **L:** Top: client ID + secret (show-once pattern) + issuer. Endpoints ledger (mono+copy). Quickstart tab with SDK code (framework-matched). "Test your flow" button → D4.
- **C:** `CredentialPanel`, `EndpointList`, `CodeBlock`, `TestButton`, `ShowOnceGate`.
- **I:** Copy everything; regenerate secret (rotates); test flow launches D4.
- **S:** `loading`, `empty`, `error`, `success` (secret created ceremony).
- **R/A:** Same show-once invariants as C9.

#### D4. Auth flow tester (sandbox)

- **Goal:** try the configured flow in a sandboxed iframe/new tab.
- **L:** App frame (renders your configured sign-in at the real endpoints), side panel: scenario select (sign-in, MFA, consent, error states), request/response inspector (mono), "Reset session".
- **C:** `SandboxFrame`, `ScenarioPicker`, `Inspector`, `Button`.
- **I:** Run scenario → frame navigates real flow; inspector captures calls (authorize→callback, tokens, userinfo) with timing. Error scenarios injectable (invalid redirect, expired code).
- **S:** `loading`, `empty` (configure endpoints first), `error` (flow failed — inspector shows exact failure), `success`.
- **R:** Frame full-width mobile, inspector below.
- **A:** Frame is iframe with `title`, inspector mono, results `aria-live`.

#### D5. Webhooks (developer)

- **Goal:** subscribe to events, verify signatures, inspect deliveries.
- **L:** Mirror C13/C14 but developer-toned: endpoint ledger + create wizard + delivery ledger with signature verification helper (show how to verify HMAC).
- **C:** `WebhookLedger`, `CreateDialog`, `SignatureHelper` (code sample: verify `lab-signature` header), `DeliveryLedger`.
- **I:** Create → test ping → inspect. Signature helper shows SDK + raw example.
- **S:** `loading`, `empty` ("Receive events when users sign up, log in, or change security settings"), `error`, `success`.
- **R/A:** Signature code mono+copy, delivery statuses text.

#### D6. SCIM (developer)

- **Goal:** configure SCIM provisioning (groups/users sync).
- **L:** Endpoint URL (mono+copy), bearer token (show-once), supported methods (Users/Groups), sync status/last run, test connection.
- **C:** `ScimPanel`, `CodeBlock`, `TestButton`, `ShowOnceGate`, `SyncStatus`.
- **I:** Generate token → show once; test connection → result ceremony.
- **S:** `loading`, `empty` ("Enable SCIM to sync users and groups automatically"), `error` (connection failed — typed), `success`.
- **R/A:** Token show-once, status text.

#### D7. SDK & integration reference

- **Goal:** find the right integration snippet.
- **L:** Framework tabs (Next.js/React/vanilla), code blocks with copy, endpoints reference, environment checklist (issuer, client id, redirect), error reference table (typed error → meaning → fix).
- **C:** `FrameworkTabs`, `CodeBlock`, `EnvChecklist`, `ErrorReferenceTable`.
- **I:** Copy, switch framework, check env against live values (client ID filled if app selected).
- **S:** `loading`, `empty` (select an app first — CTA), `error`, `success`.
- **R/A:** Code is real text, table `th` scope, tabs keyboard navigable.

#### D8. Usage & limits

- **Goal:** transparent quotas: active users, MAU, sessions, webhook deliveries, rate limits.
- **L:** Metric cards + bars (usage vs quota), rate-limit docs table (endpoint → limit → window), upgrade/billing link (per plan).
- **C:** `MetricCard`, `UsageBar`, `LimitsTable`, `LinkButton`.
- **I:** Bars animate (calm) on load only; no live polling churn.
- **S:** `loading`, `empty` (no usage — "You haven't used this yet"), `error`, `success`.
- **R/A:** Bars have text labels + values (not color-only), limits table readable.

---

## 5. State contract (applies to every screen)

| Code | State | Definition | Must include |
|---|---|---|---|
| `loading` | Fetch/async in flight | Skeleton matching final layout; never spinner-only if layout changes | Reserved space, no layout shift, `aria-busy` on region |
| `empty` | Zero data, valid state | Teach the next action: "No X yet — <action>" | Actionable CTA or explainer; never a bare "no data" |
| `empty-filter` | Zero data after filter | Distinguish from true empty: "No results match your filters" | Clear-filters action |
| `error` | Request failed | Typed, human, actionable; never raw stack/JSON to end users | Retry, consequence copy, `role=alert` |
| `error-auth` | Session/permission expired mid-flow | Route to re-auth (A13) preserving continuation | Context restoration |
| `success` | Operation completed | Ceremony (calm→1-beat→continue) + persistence of new state | `aria-live` announcement |
| `disabled` | Action not permitted now | Explain why, offer path if any (policy/SSO/SCIM-managed) | Reason text; never silent dead control |
| `offline` | Network unavailable | Banner, not full-screen takeover; retry | Connection status + retry |
| `partial` | Multi-part load with some failure | Render successes + inline error for the failed region | No whole-screen failure |

**Rules:**
1. A screen spec that doesn't name at least `loading`, `empty`, `error`, `success` is incomplete (QA gate §9.5). A state may be declared **not applicable** only with an explicit inline justification ("documented n/a per §5.1") — silent omission is a spec defect.
2. Error and empty copy are written in Russian, no jargon for end-user surfaces (login/account); admin/developer may use precise technical terms (per labpics-cloud ch07 precedent: client console RU-only no-jargon; operator surfaces technical).
3. `empty` states are part of the design — they ship with illustrations/iconography and teach, never text-only lorem.

---

## 6. Responsive system

### 6.1 Breakpoints (fluid, not device-locked)

| Token | Width | Behavior |
|---|---|---|
| `--bp-sm` | < 640px | Single column, bottom-sheet menus, full-width actions |
| `--bp-md` | 640–1024px | 2-col grids, tables→cards, drawer nav |
| `--bp-lg` | > 1024px | Full shell (sidebar), 3-4 col grids, split panels |

### 6.2 Per-surface behavior

| Surface | Desktop | Mobile |
|---|---|---|
| Login (A) | Centered card on brand panel; 2-col ≥1024 | Full-bleed, brand mark top, sticky bottom primary action |
| Account (B) | Sidebar-less, topbar + 720px content | Grouped list → stacked cards, bottom action bars |
| Admin (C) | Collapsible sidebar, dense tables | Drawer nav, tables→cards, bottom-sheet menus, filters collapsible |
| Developer (D) | Sidebar + content + right code rail | Code rail below, horizontal-scroll mono blocks |

### 6.3 Touch

- All targets ≥ 44×44px (WCAG 2.5.8); 8px min gap between adjacent targets.
- Table row actions: kebab → bottom sheet (mobile) / popover (desktop) — same component.
- Horizontal scroll containers show edge fade + `scroll-snap` off (manual only).

---

## 7. Accessibility (WCAG commitments)

### 7.1 Global

- **Contrast:** all text/UI pass WCAG 2.2 **AA** (4.5:1 normal, 3:1 large/UI); enforced by `lab-colors` solver, **machine-checked** in CI (see §9.2). Login/account target AAA where feasible (7:1) for body text.
- **Focus:** visible 2px signal ring + 2px gap (2.4.7); focus never obscured (2.4.11); `:focus-visible` not `:focus`.
- **Keyboard:** full path operable (2.1.1); no traps (2.1.2); dialogs trap with escape + return focus; logical order.
- **Reduced motion:** `prefers-reduced-motion` = character switch (§3.2.4); `prefers-reduced-transparency` = Solid fallback for Glass/Blur.
- **Reflow:** no content loss to 320px @ 400% (1.4.10).
- **Non-text contrast:** all UI components (borders of active fields, status dots with text, icons paired with labels) 3:1 (1.4.11).
- **Text spacing:** overrides test passes (1.4.12); mono data `break-all` safe.
- **Target size:** ≥44px (2.5.8).
- **Autocomplete:** correct tokens (email, current-password, new-password, one-time-code) everywhere; never `autocomplete=off` on credentials.
- **Language:** `lang="ru"` root for RU; full copy is real text (no images of text).

### 7.2 Per-pattern

| Pattern | Commitment |
|---|---|
| Forms | Label association, error `aria-describedby` + summary `role=alert`, no color-only errors, focus kept on invalid field |
| OTP | Single masked field preferred, `inputmode=numeric`, `autocomplete=one-time-code`, per-box labels if boxes |
| Toggles | Text on/off (not color-only), `role=switch` with `aria-checked` |
| Tables | `th scope`, `aria-sort` on sortable, row keyboard nav, virtual scroll preserves focus |
| Ledger expandable rows | Button pattern, `aria-expanded`, `aria-controls` |
| Modals/dialogs | `role=dialog`, `aria-modal`, focus trap, escape, restore focus |
| Toasts/status | `role=status` / `role=alert` per severity, no auto-dismiss for errors |
| Countdowns (OTP resend, lockout) | `aria-live=polite` text; never rely on visual only |
| Code blocks | `role=region` + `aria-label`, mono, copy button with `aria-live` feedback |
| QR codes | Always have text alternative (manual entry) — never sole method |

### 7.3 Login-specific (highest-stakes)

- No timing enumeration (error copy identical for unknown email vs wrong password).
- `aria-live` announcements for every auth state change (code sent, code verified, lockout).
- Password fields never masked by JS hacks that break password managers.
- Session expiry never silences focus/announcements mid-form (interruptible, context preserved).

---

## 8. User journeys (end-to-end)

Each journey lists: actor → trigger → path (with screen refs) → edge paths → success/failure terminal states.

### J1. First sign-in + MFA enrollment (new member)
Invited employee → email invite (A6) → set password (A11) → **MFA enrollment ceremony** (A14: passkey + TOTP) → account overview (B1) → org context loads (B10) → first app session.
*Edges:* invite expired (resend), WebAuthn unsupported (fallback TOTP-only, policy-gated), skip-window expired (must enroll before write-capable access, per contract §4).

### J2. Daily sign-in (returning)
auth.lab.pics → email (A1) → passkey (A3, primary) → success ceremony → redirect to app (A9 consent skipped if previously granted+remembered) or account (B1).
*Edges:* passkey not on this device (fallback chain: password → TOTP → backup code), step-up required for write action (A13), session TTL expiry mid-flow (A13 continuation).

### J3. Forgotten password recovery
Forgot password (A11) → email → reset link/OTP → new password (policy-validated) → sessions revoked (default) → passkey enrollment prompt → sign-in.
*Edges:* link expired (resend), password reuse (inline error), account locked (A12 path).

### J4. OAuth consent for a third-party app
App redirects to authorize → **consent ceremony** (A9) → scope ledger reviewed → Allow (opt-in remember) → redirect with code → token exchange.
*Edges:* write-capable scopes → step-up (A13/A9 warning tier), client suspended (typed error), cancel (access_denied), "not you" → switch identity.

### J5. Admin invites a member
Admin → Members (C2) → Invite → email+role → recipient completes J1. Admin tracks invite status (pending/accepted) → revoke invite if needed.
*Edges:* invite to existing user (role grant path, contract G3 live-state), role requires MFA (recipient gated until enrolled).

### J6. Admin registers an application
Admin → Applications (C6) → wizard (C7) → endpoints+credentials (C8/C9) → shares with developer → app tested (D4).
*Edges:* redirect-URI validation failure, instance TTL blast-radius warning (contract §3.7), secret rotation mid-integration (grace period).

### J7. Developer connects an app
Developer → Overview (D1) → Create (D2) → Credentials (D3) → Test flow (D4) → Webhooks (D5) → SCIM (D6) → production.
*Edges:* scope mismatch with policy, test flow reveals 403 step-up gate (contract §4.3), webhook signature verify failure (SignatureHelper).

### J8. Security incident — revoke & respond
Admin sees alert (C1) → audit detail (C12) → member profile (C3) → **revoke sessions** (≤60s contract) → disable member → rotate app secret if app compromised (C9) → audit records all (C12).
*Edges:* member has offline JWT (documented OAuth boundary — UI shows "active JWT may live to expiry" note on revoke, contract §3.1), revoke of never-signed-in member (idempotent, C3 disabled state).

### J9. MFA policy rollout (owner)
Admin → Security policies (C16) → enable force MFA → impact copy → GitOps change proposal (PR) → reconcile → members see enrollment on next sign-in (A14). Drift banner if live diverges.
*Edges:* canary user first (contract §4.4 — UI can mark canary), rollback via Git revert, skip-window grace.

### J10. New device verification
Sign-in from unknown device (A15) → verify (passkey/email code) → session tagged → appears in sessions list (B6).
*Edges:* "not you" → revoke candidate + support contact; verification timeout.

---

## 9. Visual QA rubric (objective, pass/fail)

QA is **automated where possible** + **manual checklist** for subjective feel. Every item has a binary pass/fail and an evidence method. Nothing is "eyeball only".

### 9.1 Token purity (machine-checkable — CI)

| ID | Check | Method | Fail |
|---|---|---|---|
| T1 | No hardcoded colors in UI source (only `var(--lab-*)`) | Static scan (grep for `#[0-9a-f]{3,8}`, `rgb(`, `hsl(`) in components | Any hit |
| T2 | No hardcoded spacing outside `--lab-space-*` scale | Scan for `margin/padding/gap` with off-grid px values (not divisible by 4) | Any hit |
| T3 | No hardcoded font-size outside scale | Scan `font-size` values not in token set | Any hit |
| T4 | No `outline: none` without replacement focus style | AST scan | Any hit |
| T5 | Mono used for all identity data (ID/secret/key/timestamp) | Component review + data-type naming convention | Any proportional render |

### 9.2 Contrast (machine-checkable)

| ID | Check | Method | Fail |
|---|---|---|---|
| C1 | All text ≥ 4.5:1 (AA), large/UI ≥ 3:1 | `lab-colors` solver assertion in tests + axe-core CI on every screen | Any violation |
| C2 | Focus ring visible 3:1 against adjacent | axe-core `color-contrast` + manual spot check | Violation |
| C3 | Status never color-only (text/dot+icon present) | axe-core + static check on StatusBadge/StatusTile/PostureBanner | Violation |

### 9.3 Layout & hierarchy (manual checklist, deterministic)

| ID | Check | Pass condition |
|---|---|---|
| L1 | 4px grid | All measured gaps ∈ {4,8,12,16,24,32,48,64} |
| L2 | Single primary action per view | Exactly one primary button visible (except wizards with defined primary) |
| L3 | Ledger pattern on record surfaces | Audit/session/grant/webhook/role rows share the ledger row component |
| L4 | No card soup | ≤1 floating card per view beyond panels/groups; tables not wrapped in cards |
| L5 | Headline hierarchy | Exactly one h1 per screen; section titles h2; groups h3 |

### 9.4 States completeness (deterministic, per-screen)

| ID | Check | Pass condition |
|---|---|---|
| S1 | Every screen spec names loading/empty/error/success (§5) | Design review: screen checklist complete |
| S2 | Empty states teach next action | Each empty state has CTA or explainer (spot-check every empty copy) |
| S3 | Errors typed + retry | Every error copy has consequence + retry/alternative |
| S4 | No layout shift on loading | Screenshot compare loading vs loaded bounding boxes (Playwright) |

### 9.5 Motion (machine-checkable + manual)

| ID | Check | Method | Fail |
|---|---|---|---|
| M1 | `prefers-reduced-motion` switches character (no lingering animation) | Playwright with emulated reduced-motion: assert animations resolve to static within 200ms | Animation persists |
| M2 | Only transform/opacity animated on critical paths | Perf trace (CDP) on sign-in, consent, revoke | Layout-thrash |
| M3 | Stagger only on first render | Trace: no stagger on filter/re-sort | Violation |
| M4 | Ceremony/calm/instant presets match §3.1 durations | Trace timing vs token map | Mismatch |

### 9.6 Accessibility (automated + manual)

| ID | Check | Method | Fail |
|---|---|---|---|
| A1 | axe-core 0 critical/serious on every screen (both themes, desktop+mobile) | CI run on static renders + sandbox | Any critical/serious |
| A2 | Full keyboard path (no mouse) on login, consent, admin table, wizard | Playwright keyboard-only script | Any unreachable action |
| A3 | Focus trap + restore in all modals | Playwright focus assertions | Violation |
| A4 | `aria-live` on all status changes (code sent, revoked, saved, ceremony) | Manual + axe `aria-*` | Missing |
| A5 | Autocomplete tokens correct (email/current-password/new-password/one-time-code) | Static scan | Violation |
| A6 | 44px target size | axe-core `target-size` + manual | Violation |
| A7 | Reflow 320px@400% no content loss | Playwright viewport | Violation |

### 9.7 Responsive (Playwright matrix)

| ID | Check | Pass condition |
|---|---|---|
| R1 | Login/account/admin/developer render correctly at 375/768/1280/1536 | No overflow, no hidden content, no horizontal scroll on mobile (except intentional code blocks) |
| R2 | Tables degrade to cards on mobile with all data reachable | Spot per table |
| R3 | Bottom-sheet menus on mobile, popovers on desktop — same data | Compare |
| R4 | Sticky primary action reachable on mobile login | Scroll check |

### 9.8 Visual identity (manual, documented standard)

| ID | Check | Pass condition |
|---|---|---|
| V1 | Labpics Blue signal accent only on primary/active/focus/live | No stray blue on decorative elements; no teal anywhere |
| V2 | Zero Clerk/competitor visual imitation | Side-by-side reference review |
| V3 | Swiss instrument look: hairlines not shadows, ledger rows, mono data, Geist | Design review against §1.3 anchors + brand page |
| V4 | Brand DNA: flask mark, #007AFF anchor, clear space rules respected | Design review vs `lab.pics/brand` reference |

### 9.9 Acceptance gate

A screen ships only when:
- All `T*`, `C*`, `A1–A7`, `R1–R4` applicable pass (machine).
- All `S1–S4` pass (design completeness).
- `M1–M4` pass.
- `V1–V4` pass via the named reviewer.
- No open "does not apply" without an explicit written justification (no silent skips).

---

## 10. Open questions / dependencies for the team

1. ~~Theme policy~~ **RESOLVED by brand:** light-default everywhere (§1.4) — Labpics brand is light/Swiss/blue; dark remains a theme option, not the default.
2. **Session TTL values** for UI copy (expiry/grace) — from Security policies; placeholders until policy declared.
3. **Consent "remember" default:** opt-in only (recommended); confirm product stance.
4. **SCIM scope:** Groups sync in v1 or users-only? Affects D6/C15 UI depth.
5. **`identity.yml` contract fields** (redirect_uris, token_type) — finalize in t3 so D/C app forms match exactly.
6. **labui availability of primitives** (DataTable, Stepper, CodeBlock, QrPanel) — labui must expose or we build these as labui components, not one-off.
7. **Labpics Blue in `lab-colors`:** confirm the #007AFF anchor is added as a brand accent family (perceptual curve) or mapped onto existing indigo/blue sentiment — team decision, affects `--lab-accent-blue` token wiring.
8. **Flask mark assets:** confirm the canonical SVG (from brand page / lab-icons) for login/empty states; `labpics-id-logo.tsx` already ships a wordmark variant — reconcile which is used where.

---

## 11. Current implementation reality (`labpics-id` repo) — alignment

Read before implementation: the shipped product is not a blank slate. The brief above is the **target visual language**; this section maps it onto what exists today so the design brief becomes an implementation plan, not a parallel fiction.

### 11.1 Verified facts (read-only, `lemone112/labpics-id` @ `093722d`, 2026-08-10)

| Aspect | Today (shipped) | Target per this brief |
|---|---|---|
| Login surface | `/login` — email OTP (Supabase GoTrue) + OAuth Google/GitHub icon buttons; Russian copy; framer-motion step transition | A1/A2/A4 with passkey-first path when policy allows |
| OIDC authorize | `/authorize` — **auto-consent**: no user-facing scope/consent ceremony; redirects to `/login` with `return_to` when unauthenticated, then issues code | A9 consent ceremony (additive — no breaking change to protocol) |
| Callback | `/auth/callback` — OAuth provider callback → session | unchanged protocol, styled |
| Verify | `/api/verify` — internal session/domain product check | becomes part of session model, same contract |
| Backend | Fastify OIDC service (`apps/auth`): authorization codes, id/access/refresh tokens, signing keys/JWKS, product access, audit, rate limit, RBAC | retained; UI must not bypass it |
| Auth providers | Supabase GoTrue (email OTP) + Google + GitHub + Yandex | provider ledger (C15) adds/removes per org policy |
| Roles (RBAC) | `super_admin`, `admin`, `owner`, `pm`, `delivery_lead`, `employee`, `executor`, `client`, `viewer` | role catalog surfaces (C4/C5) render this exact set |
| Permissions | `project.read/create`, `platform.write`, `user.read/manage`, `project_assignment.manage`, `api_keys.manage`, `workforce.*` | capability ledger (C5) renders from this set |
| Products/apps | `products` table: slug, name, `base_url`, `token_audience`, `redirect_uris`, `client_id`, `is_active`; per-user `user_product_access` grants | maps to Applications (C6–C9) + Authorized apps (B7) |
| Frontend stack | Next.js 16 App Router, **HeroUI + framer-motion + Geist + Tailwind v4**, `@supabase/ssr` | migrate to `labui` + `lab-colors` + `@labpics/motion` per §2–§3 |

### 11.2 Gap decisions for the team

1. **Consent ceremony (A9) is the single largest UX change.** Today `/authorize` auto-issues the code (no consent UI). Adding a user-facing consent screen changes the OIDC UX but **not the protocol** (code still issued on Allow). Recommend: ship A9 in the same release as the first `labui`-based login, because it's a *trust* feature, not cosmetic.
2. **Stack migration is now smaller than feared.** Current UI already uses **Geist + Tailwind v4 + Next.js 16 App Router** — Geist is the brand font (§2.2), so typography is aligned. The migration is: HeroUI → `labui`, framer-motion → `@labpics/motion`, Tailwind tokens → `--lab-*` tokens, accent color → Labpics Blue. **Yellow-gate, reversible, component-by-component; migrate, don't fork.**
3. **Passkey/MFA is backend-gated.** `forceMfa` is declared `false` today (identity contract §4). The UI (A3/A14/B4) must render the *enrollment* path regardless; enforcement is the backend's job. UI shows posture honestly (B3) even when MFA is optional.
4. **Session revocation ≤60s** (contract §3): C3/C11 revoke buttons must show an explicit "revoking… → done" state and, where relevant, the offline-JWT caveat for tokens validated by signature only (contract §3.1).
5. **Admin/developer/account surfaces (C/D/B) don't exist in the repo yet** — the brief defines them; the A-surface (login) is the migration pilot.
6. **Brand grounding:** verify `#007AFF` anchor availability in `lab-colors` (§10.7) and canonical flask mark usage (§10.8) before visual implementation starts.

### 11.3 Screen-by-screen mapping (current → brief)

| Today | Brief |
|---|---|
| `/login` (OTP step) | A1 + A4 |
| `/login` (OAuth icons) | A2 "other methods" / provider ledger |
| `/authorize` (auto) | A9 (new consent UI; protocol unchanged) |
| `/auth/callback` | A6 verification / callback handling |
| `/api/verify` | B6 session model |
| Fastify session/magic-link routes | A11/A13 |
| `products` + `user_product_access` | B7, C6–C9 |
| RBAC roles/permissions | C4/C5 |
| audit + rate-limit infra | B9, C12 |

---

*End of design brief v2. Screen specs reference the identity contract (Git-SSOT, Zitadel readback, MFA-before-write, revoke ≤60s), the SSO inventory, and the official Labpics brand source (lab.pics/brand: flask mark, Labpics Blue #007AFF, Geist, Swiss legacy); where the UI *presents* a policy or live state, the contract's enforcement layer is the source of truth, and the UI never claims a mutation it cannot make.*
