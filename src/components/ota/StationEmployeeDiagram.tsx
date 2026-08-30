"use client";

// Same hand-rolled hub-and-spoke geometry as RouteNetworkDiagram, adapted
// for station -> employee mapping instead of station -> destination: no
// distance labels, nodes color-coded by role instead of road type.
type StationEmployee = { id: string; fullName: string; role: string };

const ROLE_COLOR: Record<string, string> = {
  SUPERVISOR: "#7c3aed",
  TICKETER: "var(--primary)",
  CASHIER: "#d97706",
};

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export default function StationEmployeeDiagram({ stationName, employees }: { stationName: string; employees: StationEmployee[] }) {
  const size = 560;
  const center = size / 2;
  const n = employees.length;

  if (n === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, color: "var(--muted-foreground)", fontSize: 13 }}>
        No staff assigned to this station yet.
      </div>
    );
  }

  const useTwoRings = n > 12;
  const outerRingRadius = size / 2 - 50;
  const innerRingRadius = outerRingRadius * 0.58;
  const nodeRadius = Math.max(15, Math.min(30, 230 / Math.sqrt(useTwoRings ? Math.ceil(n / 2) : n)));
  const nameChars = nodeRadius >= 26 ? 10 : nodeRadius >= 20 ? 7 : 5;
  const fontSize = nodeRadius >= 26 ? 10 : nodeRadius >= 20 ? 9 : 8;

  const positions = employees.map((e, i) => {
    const onInner = useTwoRings && i % 2 === 1;
    const ring = onInner ? innerRingRadius : outerRingRadius;
    const ringIndices = employees.map((_, j) => j).filter((j) => (useTwoRings && j % 2 === 1) === onInner);
    const posInRing = ringIndices.indexOf(i);
    const angle = (2 * Math.PI * posInRing) / ringIndices.length - Math.PI / 2;
    return { e, x: center + ring * Math.cos(angle), y: center + ring * Math.sin(angle) };
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 560, display: "block", margin: "0 auto" }}>
      {positions.map(({ e, x, y }) => (
        <g key={e.id}>
          <line x1={center} y1={center} x2={x} y2={y} stroke="var(--border)" strokeWidth={1.5} />
          <circle cx={x} cy={y} r={nodeRadius} fill="var(--surface)" stroke={ROLE_COLOR[e.role] ?? "var(--primary)"} strokeWidth={1.5} />
          <text x={x} y={y} fontSize={fontSize} fontWeight={600} textAnchor="middle" dominantBaseline="middle" fill="var(--foreground)">
            {truncate(e.fullName, nameChars)}
          </text>
        </g>
      ))}
      <circle cx={center} cy={center} r={40} fill="var(--primary)" />
      <text x={center} y={center} fontSize={11.5} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill="#fff">
        {truncate(stationName, 11)}
      </text>
    </svg>
  );
}
