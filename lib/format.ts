import type { RiskLabel } from "./agent";

export function fmtHour(h: number): string {
  const x = ((Math.round(h) % 24) + 24) % 24;
  return `${String(x).padStart(2, "0")}:00`;
}

export function fmtHourRange(a: number, b: number): string {
  return `${fmtHour(a)}–${fmtHour(b)}`;
}

/** [text, background, border] tailwind-ish hex for a risk label. */
export const RISK_COLOR: Record<RiskLabel, { fg: string; bg: string; ring: string; rgb: [number, number, number] }> = {
  low: { fg: "#5eead4", bg: "rgba(45,212,191,0.12)", ring: "rgba(45,212,191,0.4)", rgb: [45, 212, 191] },
  moderate: { fg: "#fcd34d", bg: "rgba(251,191,36,0.12)", ring: "rgba(251,191,36,0.4)", rgb: [251, 191, 36] },
  high: { fg: "#fb923c", bg: "rgba(249,115,22,0.14)", ring: "rgba(249,115,22,0.45)", rgb: [249, 115, 22] },
  extreme: { fg: "#f87171", bg: "rgba(239,68,68,0.16)", ring: "rgba(239,68,68,0.5)", rgb: [239, 68, 68] },
};

export const RECOMMENDATION_ICON: Record<string, string> = {
  pre_cool: "❄",
  reschedule_shift: "⏱",
  resident_alert: "◎",
  cool_route: "↝",
};

/** Map a temperature (°F) to an RGB heat color for the 3D grid. */
export function heatColor(tempF: number, min: number, max: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (tempF - min) / Math.max(1, max - min)));
  // deep blue -> teal -> amber -> red
  const stops: [number, [number, number, number]][] = [
    [0.0, [30, 58, 138]],
    [0.35, [13, 148, 136]],
    [0.65, [217, 119, 6]],
    [1.0, [220, 38, 38]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (t >= p0 && t <= p1) {
      const k = (t - p0) / (p1 - p0);
      return [
        Math.round(c0[0] + k * (c1[0] - c0[0])),
        Math.round(c0[1] + k * (c1[1] - c0[1])),
        Math.round(c0[2] + k * (c1[2] - c0[2])),
      ];
    }
  }
  return stops[stops.length - 1][1];
}
