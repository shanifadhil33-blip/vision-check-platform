const ANIMATION_CSS = `
.cpa-scene { animation: cpa-scene 4s ease-in-out infinite; }
.cpa-card { animation: cpa-card 4s ease-out infinite; }
.cpa-outline {
  transform-box: fill-box;
  transform-origin: center;
  animation: cpa-outline 4s ease-in-out infinite;
}
.cpa-pulse {
  opacity: 0;
  animation: cpa-pulse 4s ease-out infinite;
}
@keyframes cpa-scene {
  0% { opacity: 0; }
  8% { opacity: 1; }
  85% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes cpa-card {
  0% { transform: translateY(96px); }
  30%, 100% { transform: translateY(0); }
}
@keyframes cpa-outline {
  0%, 40% { transform: scaleX(0.84); }
  65%, 100% { transform: scaleX(1); }
}
@keyframes cpa-pulse {
  0%, 65% { opacity: 0; }
  70% { opacity: 1; }
  82%, 100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .cpa-scene, .cpa-card, .cpa-outline, .cpa-pulse { animation: none; }
}
`;

/**
 * Decorative illustration of where the card goes. Fixed illustration size,
 * never drawn at physical size; the real outline is the CardZone below.
 * Aligned frame: the card covers the outline except its bottom fifth, with
 * both sides in line. The reduced-motion still frame is that aligned frame.
 */
export function CardPlacementAnimation() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={200}
      height={130}
      viewBox="0 0 200 130"
      className="shrink-0"
    >
      <style>{ANIMATION_CSS}</style>
      <g className="cpa-scene">
        <rect
          x={40}
          y={40}
          width={120}
          height={76}
          rx={6}
          className="cpa-outline fill-none stroke-neutral-300"
          strokeWidth={2}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />
        <g className="cpa-card">
          <rect
            x={40}
            y={25}
            width={120}
            height={76}
            rx={6}
            className="fill-neutral-800 stroke-neutral-400"
            strokeWidth={1.5}
          />
          <rect x={54} y={47} width={18} height={13} rx={2} className="fill-sky-300" />
        </g>
        <circle cx={41.8} cy={114.2} r={3.5} className="cpa-pulse fill-sky-300" />
        <circle cx={158.2} cy={114.2} r={3.5} className="cpa-pulse fill-sky-300" />
      </g>
    </svg>
  );
}
