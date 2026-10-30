"use client";
import { useMemo } from "react";

export type Cell = { lat: number; lon: number; rank: number; area: string | null; hot: boolean };

const W = 640, H = 420, PAD = 36;

/** Plots Qloo's hottest heatmap cells. Positions are real lat/lon; nothing is invented. */
export default function HeatMap({ cells, active, onActive, labels }: {
  cells: Cell[]; active: string | null; onActive: (a: string | null) => void; labels: string[];
}) {
  const pts = useMemo(() => {
    if (!cells.length) return [];
    const lat0 = cells.reduce((s, c) => s + c.lat, 0) / cells.length;
    const kx = Math.cos((lat0 * Math.PI) / 180);
    const xs = cells.map((c) => c.lon * kx), ys = cells.map((c) => c.lat);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min((W - PAD * 2) / (x1 - x0 || 1), (H - PAD * 2) / (y1 - y0 || 1));
    const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    return cells.map((c, i) => ({ ...c, i, x: ox + (c.lon * kx - x0) * s, y: H - (oy + (c.lat - y0) * s) }));
  }, [cells]);

  const centroids = useMemo(() => labels.map((name) => {
    const m = pts.filter((p) => p.area === name && p.hot);
    return m.length ? { name, x: m.reduce((s, p) => s + p.x, 0) / m.length, y: m.reduce((s, p) => s + p.y, 0) / m.length } : null;
  }).filter(Boolean) as { name: string; x: number; y: number }[], [pts, labels]);

  // Nudge labels apart so a dense downtown doesn't stack them on top of each other.
  const placed = useMemo(() => {
    const out: { name: string; x: number; y: number; ly: number }[] = [];
    for (const c of centroids) {
      let ly = c.y;
      while (out.some((o) => Math.abs(o.x - c.x) < 120 && Math.abs(o.ly - ly) < 24)) ly += 24;
      out.push({ ...c, ly });
    }
    return out;
  }, [centroids]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img" aria-label="Map of the hottest audience cells">
      <defs>
        <radialGradient id="hg"><stop offset="0" stopColor="var(--b)" stopOpacity=".95" /><stop offset=".5" stopColor="var(--a)" stopOpacity=".45" /><stop offset="1" stopColor="var(--a)" stopOpacity="0" /></radialGradient>
      </defs>
      {pts.map((p) => {
        const dim = active && p.area !== active;
        const r = (p.hot ? 14 + p.rank * 22 : 8 + p.rank * 8);
        return (
          <circle key={p.i} cx={p.x} cy={p.y} r={r} fill="url(#hg)" className="blob"
            style={{ animationDelay: `${p.i * 12}ms`, opacity: dim ? 0.12 : p.hot ? 1 : 0.5 }}
            onPointerEnter={() => p.area && onActive(p.area)} onPointerLeave={() => onActive(null)} />
        );
      })}
      {placed.map((c, i) => (
        <g key={c.name} className="pin" style={{ animationDelay: `${600 + i * 120}ms`, opacity: active && active !== c.name ? 0.25 : 1 }}>
          <circle cx={c.x} cy={c.y} r="5" fill="#fff" />
          <line x1={c.x} y1={c.y} x2={c.x + 12} y2={c.ly} stroke="rgba(255,255,255,.35)" />
          <text x={c.x + 16} y={c.ly + 6}>{i + 1} · {c.name}</text>
        </g>
      ))}
    </svg>
  );
}
