import { NextResponse } from "next/server";
import { PORTFOLIO, GRID_SIZE, getAoi } from "@/lib/aoi";
import { getSignalBundle, type HeatGrid } from "@/lib/fortyguard";
import { assessAoi, type Assessment } from "@/lib/agent";

export const maxDuration = 60;

export type AssessResponse = {
  generatedAt: string;
  dataSource: "live" | "mock" | "mixed";
  agentSource: "claude" | "rules" | "mixed";
  cityGrid: HeatGrid;
  assessments: Assessment[];
};

function collapse<T extends string>(values: T[]): T | "mixed" {
  const uniq = Array.from(new Set(values));
  return uniq.length === 1 ? uniq[0] : "mixed";
}

/** City-wide heat grid: per cell, the hottest value across every AOI's local grid. */
function composeCityGrid(grids: HeatGrid[]): HeatGrid {
  const cells = new Array(GRID_SIZE * GRID_SIZE).fill(-Infinity);
  for (const g of grids) {
    for (let i = 0; i < cells.length; i++) cells[i] = Math.max(cells[i], g.cells[i]);
  }
  return { size: GRID_SIZE, cells: cells.map((c) => Math.round(c * 10) / 10) };
}

async function runPortfolio(ids: string[]): Promise<AssessResponse> {
  const aois = ids.map(getAoi).filter((a): a is NonNullable<typeof a> => Boolean(a));

  const results = await Promise.all(
    aois.map(async (aoi) => {
      const bundle = await getSignalBundle(aoi);
      const assessment = await assessAoi(aoi, bundle);
      return { bundle, assessment };
    }),
  );

  const assessments = results
    .map((r) => r.assessment)
    .sort((a, b) => b.riskScore - a.riskScore);

  return {
    generatedAt: new Date().toISOString(),
    dataSource: collapse(results.map((r) => r.bundle.source)),
    agentSource: collapse(assessments.map((a) => a.agentSource)),
    cityGrid: composeCityGrid(results.map((r) => r.bundle.grid)),
    assessments,
  };
}

export async function GET() {
  return NextResponse.json(await runPortfolio(PORTFOLIO.map((a) => a.id)));
}

export async function POST(request: Request) {
  let ids: string[] = PORTFOLIO.map((a) => a.id);
  try {
    const body = await request.json();
    if (Array.isArray(body?.aoiIds) && body.aoiIds.length > 0) {
      ids = body.aoiIds.filter((x: unknown): x is string => typeof x === "string");
    }
  } catch {
    // no body — assess the whole portfolio
  }
  return NextResponse.json(await runPortfolio(ids));
}
