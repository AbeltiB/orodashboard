"use client";

// Hand-rolled SVG hub-and-spoke diagram — no charting library needed for a
// single departure terminal fanning out to its own destinations (at most a
// few dozen). Destinations alternate between an inner and outer ring once
// there are more than ~14 of them, purely so the spoke labels stay legible
// instead of overlapping on one crowded ring.
type Destination = { id: string; arrivalTerminalName: string; distanceKm: number; roadType: string | null };

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default function RouteNetworkDiagram({ terminalName, destinations }: { terminalName: string; destinations: Destination[] }) {
  const size = 640;
  const center = size / 2;
  const n = destinations.length;

  if (n === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 260, color: "var(--muted-foreground)", fontSize: 13 }}>
        No registered destinations for this terminal yet.
      </div>
    );
  }

  const useTwoRings = n > 14;
  const outerRingRadius = size / 2 - 56;
  const innerRingRadius = outerRingRadius * 0.6;
  const nodeRadius = Math.max(16, Math.min(32, 260 / Math.sqrt(useTwoRings ? Math.ceil(n / 2) : n)));
  const nameChars = nodeRadius >= 28 ? 11 : nodeRadius >= 22 ? 8 : 6;
  const fontSize = nodeRadius >= 28 ? 10.5 : nodeRadius >= 22 ? 9.5 : 8.5;

  const positions = destinations.map((d, i) => {
    const onInner = useTwoRings && i % 2 === 1;
    const ring = onInner ? innerRingRadius : outerRingRadius;
    // Each ring gets its own even angular spacing among the points assigned
    // to it, not just every-other-index of one shared angle sequence — keeps
    // spacing uniform within each ring regardless of how many fall on it.
    const ringIndices = destinations.map((_, j) => j).filter((j) => (useTwoRings && j % 2 === 1) === onInner);
    const posInRing = ringIndices.indexOf(i);
    const angle = (2 * Math.PI * posInRing) / ringIndices.length - Math.PI / 2;
    return {
      d,
      x: center + ring * Math.cos(angle),
      y: center + ring * Math.sin(angle),
      midX: center + ring * 0.52 * Math.cos(angle),
      midY: center + ring * 0.52 * Math.sin(angle),
    };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 640, display: "block", margin: "0 auto" }}>
      {positions.map(({ d, x, y, midX, midY }) => (
        <g key={d.id}>
          <line x1={center} y1={center} x2={x} y2={y} stroke="var(--border)" strokeWidth={1.5} />
          <rect x={midX - 20} y={midY - 8} width={40} height={14} rx={4} fill="var(--surface)" opacity={0.9} />
          <text x={midX} y={midY + 3} fontSize={9} textAnchor="middle" fill="var(--muted-foreground)">
            {d.distanceKm % 1 === 0 ? d.distanceKm : d.distanceKm.toFixed(1)} km
          </text>
          <circle
            cx={x} cy={y} r={nodeRadius}
            fill={d.roadType === "gravel" ? "color-mix(in srgb, var(--warning, #d97706) 12%, var(--surface))" : "var(--surface)"}
            stroke="var(--primary)" strokeWidth={1.5}
          />
          <text x={x} y={y} fontSize={fontSize} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill="var(--foreground)">
            {truncate(d.arrivalTerminalName, nameChars)}
          </text>
        </g>
      ))}
      <circle cx={center} cy={center} r={44} fill="var(--primary)" />
      <text x={center} y={center} fontSize={12.5} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill="#fff">
        {truncate(terminalName, 12)}
      </text>
    </svg>
  );
}
