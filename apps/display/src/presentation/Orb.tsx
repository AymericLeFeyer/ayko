import type { ScreenState } from '@ayko/contracts';

const TICKS = Array.from({ length: 36 }, (_, index) => index * 10);

/** The lamp of the house, and the one animated thing on screen. CSS and SVG only. */
export function Orb({ state, pulse, size }: { state: ScreenState; pulse: number; size: string }) {
  return (
    <div className={`orb orb-${state}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 200 200">
        <g className="orb-ticks">
          {TICKS.map((angle) => (
            <line
              key={angle}
              x1="100"
              y1="4"
              x2="100"
              y2={angle % 30 === 0 ? 14 : 9}
              transform={`rotate(${angle} 100 100)`}
            />
          ))}
        </g>
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
