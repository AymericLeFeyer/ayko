import type { ScreenState } from '@ayko/contracts';

/** The lamp of the house, and the one animated thing on screen. CSS and SVG only. */
export function Orb({ state, pulse, size }: { state: ScreenState; pulse: number; size: string }) {
  return (
    <div className={`orb orb-${state}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 200 200">
        <circle className="orb-ring" cx="100" cy="100" r="74" strokeDasharray="60 20" />
        <circle
          className="orb-ring orb-ring-inner"
          cx="100"
          cy="100"
          r="60"
          strokeDasharray="28 12"
        />
      </svg>
      <span key={pulse} className="orb-core" />
    </div>
  );
}
