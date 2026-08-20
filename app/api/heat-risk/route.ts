import { NextResponse } from "next/server";
import { getHourlyTemps } from "@/lib/fortyguard";
import { computeHeatRisk, type BuildingProfile } from "@/lib/heatEngine";

type RequestBody = {
  location?: unknown;
  baselineKw?: unknown;
  hvacCapacityKw?: unknown;
  coolingSetpointF?: unknown;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { location, baselineKw, hvacCapacityKw, coolingSetpointF } = body;

  if (typeof location !== "string" || location.trim().length === 0) {
    return NextResponse.json({ error: "`location` is required." }, { status: 400 });
  }
  if (!isFiniteNumber(baselineKw) || baselineKw < 0) {
    return NextResponse.json({ error: "`baselineKw` must be a non-negative number." }, { status: 400 });
  }
  if (!isFiniteNumber(hvacCapacityKw) || hvacCapacityKw < 0) {
    return NextResponse.json({ error: "`hvacCapacityKw` must be a non-negative number." }, { status: 400 });
  }
  if (!isFiniteNumber(coolingSetpointF)) {
    return NextResponse.json({ error: "`coolingSetpointF` must be a number." }, { status: 400 });
  }

  const profile: BuildingProfile = { baselineKw, hvacCapacityKw, coolingSetpointF };

  try {
    const { source, hourly } = await getHourlyTemps(location, 24);
    const risk = computeHeatRisk(hourly, profile);

    return NextResponse.json({
      source,
      hourly: risk.hourly,
      peakHour: risk.peakHour,
      peakLoadKw: risk.peakLoadKw,
      recommendation: risk.recommendation,
    });
  } catch {
    return NextResponse.json({ error: "Failed to compute heat risk." }, { status: 500 });
  }
}
