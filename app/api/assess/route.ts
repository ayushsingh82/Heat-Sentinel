import { NextResponse } from "next/server";
import {
  CITIES,
  DEFAULT_CITY_ID,
  GRID_SIZE,
  getCity,
  getPortfolio,
  type City,
} from "@/lib/aoi";
import { getSignalBundle, type HeatGrid, type SignalContext } from "@/lib/fortyguard";
import { assessAoi, type Assessment } from "@/lib/agent";

export const maxDuration = 60;

export type CitySummary = Pick<City, "id" | "name" | "country" | "timezone" | "note">;

export type AssessResponse = {
  generatedAt: string;
  city: CitySummary;
  cities: CitySummary[];
  dataSource: "live" | "mock" | "mixed";
  agentSource: "claude" | "rules" | "mixed";
  cityGrid: HeatGrid;
  context: SignalContext;
  assessments: Assessment[];
};

const toSummary = (c: City): CitySummary => ({
  id: c.id,
  name: c.name,
  country: c.country,
  timezone: c.timezone,
  note: c.note,
});

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

async function runCity(cityId: string): Promise<AssessResponse | null> {
  const city = getCity(cityId);
  if (!city) return null;
  const aois = getPortfolio(city.id);

  const results = await Promise.all(
    aois.map(async (aoi) => {
      const bundle = await getSignalBundle(aoi, city);
      const assessment = await assessAoi(aoi, bundle, city);
      return { bundle, assessment };
    }),
  );

  const assessments = results
    .map((r) => r.assessment)
    .sort((a, b) => b.riskScore - a.riskScore);

  return {
    generatedAt: new Date().toISOString(),
    city: toSummary(city),
    cities: CITIES.map(toSummary),
    dataSource: collapse(results.map((r) => r.bundle.source)),
    agentSource: collapse(assessments.map((a) => a.agentSource)),
    cityGrid: composeCityGrid(results.map((r) => r.bundle.grid)),
    context: results[0]?.bundle.context ?? { elevationM: null, clearSkyGhi: 0, clearSkyDni: 0, clearSkyDhi: 0 },
    assessments,
  };
}

export async function GET(request: Request) {
  const cityId = new URL(request.url).searchParams.get("city") ?? DEFAULT_CITY_ID;
  const res = await runCity(cityId);
  return res
    ? NextResponse.json(res)
    : NextResponse.json({ error: `Unknown city: ${cityId}` }, { status: 400 });
}

export async function POST(request: Request) {
  let cityId = DEFAULT_CITY_ID;
  try {
    const body = await request.json();
    if (typeof body?.cityId === "string") cityId = body.cityId;
  } catch {
    // no body — assess the default city
  }
  const res = await runCity(cityId);
  return res
    ? NextResponse.json(res)
    : NextResponse.json({ error: `Unknown city: ${cityId}` }, { status: 400 });
}
