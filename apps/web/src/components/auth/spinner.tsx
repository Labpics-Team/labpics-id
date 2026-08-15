/*
 * Loading spinner — the one legal animation loop (DESIGN.md §6.3). Rendered
 * inside a control that keeps its width and sets aria-busy; the spinner
 * itself is presentational. Track = current text color at low strength via
 * SVG stroke-opacity (opacity roles govern element opacity, not paint mixes).
 * Under prefers-reduced-motion the rotation stops (globals.css) and the
 * partial arc still reads as an in-progress glyph.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`animate-lab-spin ${className ?? ""}`}
    >
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M18 10a8 8 0 0 0-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
