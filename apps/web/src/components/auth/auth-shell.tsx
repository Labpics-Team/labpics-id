import type { ReactNode } from "react";
import { FlaskMark, WordMark } from "./brand";

/*
 * Shared auth shell (Figma frames 1552:3908 / 1563:7321): grey page wash,
 * centered column, white card (480px, radius-lg, four-layer card shadow,
 * padding 48/48/24), optional 48px logo tile overlapping the card top by
 * half its height, card footer caption behind a full-bleed hairline, and
 * the "© 2026 Labpics" page caption.
 *
 * Card padding is 48px inline — inner content resolves to the Figma 384px
 * column (480 − 2×48); max-w-auth-content guards the same value explicitly.
 */
export function AuthShell({
  children,
  showLogoTile = true,
}: {
  children: ReactNode;
  showLogoTile?: boolean;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-2 px-lab-16 py-lab-32">
      <div className="flex w-full max-w-auth flex-col items-center">
        {showLogoTile ? (
          /* Tile overlaps the card by half its 48px height (-24px stack);
           * z order from the token ladder so the tile sits above the card. */
          <div
            className="-mb-lab-24 relative flex size-logo-tile items-center justify-center rounded-md bg-tile-finish text-on-accent"
            style={{ zIndex: "var(--lab-z-sticky)" }}
          >
            <FlaskMark />
          </div>
        ) : null}
        <section className="flex w-full flex-col rounded-lg bg-surface px-lab-48 pt-lab-48 pb-lab-24 shadow-card">
          <div className="mx-auto flex w-full max-w-auth-content flex-col">{children}</div>
          <CardFooter />
        </section>
      </div>
      <p className="mt-lab-24 text-caption text-label-t">© 2026 Labpics</p>
    </main>
  );
}

/** Card footer: full-bleed hairline + "Защищено через labpics id" caption. */
function CardFooter() {
  return (
    <footer className="mt-lab-36 flex flex-col">
      {/* Full-bleed hairline: breaks out of the 48px inline padding. */}
      <div className="-mx-lab-48 border-t border-hairline" aria-hidden="true" />
      <p className="mt-lab-24 flex items-center justify-center gap-lab-4 text-caption text-label-t">
        Защищено через
        {/* Logotype tint: the decorative-only faint ink (WCAG logotype
         * exemption) — the sr-only text carries the accessible name. */}
        <span className="text-ink-faint">
          <WordMark />
          <span className="sr-only">labpics id</span>
        </span>
      </p>
    </footer>
  );
}

/** Full-bleed hairline separator for use inside the card content column. */
export function CardHairline() {
  /* Content column is 384px inside 48px card padding: bleed = 48px. */
  return <div className="-mx-lab-48 border-t border-hairline" aria-hidden="true" />;
}
