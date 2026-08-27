import type { Aoi } from "./aoi";
import type { HeatGrid } from "./fortyguard";

type Cell = [number, number];

export type CorridorRoute = {
  from: Cell;
  to: Cell;
  coolPath: Cell[];
  shortPath: Cell[];
  coolAvgF: number;
  shortAvgF: number;
};

function tempAt(grid: HeatGrid, x: number, y: number): number {
  return grid.cells[y * grid.size + x];
}

/** Straight-ish path: Bresenham line between two cells. */
function linePath(from: Cell, to: Cell): Cell[] {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const path: Cell[] = [];
  for (;;) {
    path.push([x, y]);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
  return path;
}

/**
 * Dijkstra over the grid where step cost is the destination cell's temperature
 * plus a small constant (so the search still prefers shorter paths when heat is
 * flat). Returns the minimum-heat-exposure path.
 */
function coolestPath(grid: HeatGrid, from: Cell, to: Cell): Cell[] {
  const n = grid.size;
  const idx = (x: number, y: number) => y * n + x;
  const dist = new Array(n * n).fill(Infinity);
  const prev = new Array<number>(n * n).fill(-1);
  const visited = new Array<boolean>(n * n).fill(false);

  dist[idx(...from)] = 0;
  const minTemp = Math.min(...grid.cells);

  for (let step = 0; step < n * n; step++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < n * n; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1) break;
    visited[u] = true;
    const ux = u % n;
    const uy = Math.floor(u / n);
    if (ux === to[0] && uy === to[1]) break;

    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const vx = ux + dx;
      const vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= n || vy >= n) continue;
      const v = idx(vx, vy);
      // Normalise temperature to an "extra exposure over the coolest cell" cost.
      const cost = 1 + (tempAt(grid, vx, vy) - minTemp);
      if (dist[u] + cost < dist[v]) {
        dist[v] = dist[u] + cost;
        prev[v] = u;
      }
    }
  }

  const path: Cell[] = [];
  let cur = idx(...to);
  if (prev[cur] === -1 && cur !== idx(...from)) return linePath(from, to);
  while (cur !== -1) {
    path.push([cur % n, Math.floor(cur / n)]);
    cur = prev[cur];
  }
  return path.reverse();
}

function avgTemp(grid: HeatGrid, path: Cell[]): number {
  const sum = path.reduce((acc, [x, y]) => acc + tempAt(grid, x, y), 0);
  return Math.round((sum / path.length) * 10) / 10;
}

/**
 * The corridor AOI's two stops sit on opposite sides of its grid cell. Compare
 * the direct line between them with the coolest walkable path.
 */
export function coolestCorridor(grid: HeatGrid, aoi: Aoi): CorridorRoute {
  const n = grid.size;
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  const from: Cell = [clamp(aoi.gx - 4), clamp(aoi.gy + 3)];
  const to: Cell = [clamp(aoi.gx + 4), clamp(aoi.gy - 2)];

  const shortPath = linePath(from, to);
  const coolPath = coolestPath(grid, from, to);

  return {
    from,
    to,
    coolPath,
    shortPath,
    coolAvgF: avgTemp(grid, coolPath),
    shortAvgF: avgTemp(grid, shortPath),
  };
}
