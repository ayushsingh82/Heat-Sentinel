import type { BuildingProfile } from "./aoi";

/** Minimal hourly temperature input the engine needs. */
export type HourlyTemp = { hour: number; tempF: number };

export type { BuildingProfile };

export type HourlyLoad = {
  hour: number;
  tempF: number;
  predictedLoadKw: number;
};

export type Recommendation = {
  startHour: number;
  peakHour: number;
  peakLoadKw: number;
  estimatedPeakReductionPct: number;
};

export type HeatRiskResult = {
  hourly: HourlyLoad[];
  peakHour: number;
  peakLoadKw: number;
  recommendation: Recommendation;
};

/**
 * kW of extra cooling load per degree F above the setpoint. This is a
 * simple degree-hour heuristic, not a real thermal/HVAC simulation -
 * it's tuned so a ~95F day against a 72F setpoint produces a load
 * increase that's a meaningful (but not absurd) fraction of a typical
 * commercial building's baseline draw.
 */
const KW_PER_DEGREE_OVER_SETPOINT = 1.1;

/** How many hours before the predicted peak pre-cooling should start. */
const PRE_COOL_LEAD_HOURS = 3;

/** Fraction of the peak's excess-over-baseline that pre-cooling is assumed to shave. */
const PRE_COOL_SHAVE_FRACTION = 0.45;

function predictedLoadKw(tempF: number, profile: BuildingProfile): number {
  const excessDegrees = Math.max(0, tempF - profile.coolingSetpointF);
  const load = profile.baselineKw + KW_PER_DEGREE_OVER_SETPOINT * excessDegrees;
  return Math.min(load, profile.hvacCapacityKw > 0 ? profile.hvacCapacityKw * 1.5 : load);
}

export function computeHeatRisk(
  hourlyTemps: HourlyTemp[],
  profile: BuildingProfile
): HeatRiskResult {
  const hourly: HourlyLoad[] = hourlyTemps.map((t) => ({
    hour: t.hour,
    tempF: t.tempF,
    predictedLoadKw: Math.round(predictedLoadKw(t.tempF, profile) * 10) / 10,
  }));

  let peak = hourly[0];
  for (const h of hourly) {
    if (h.predictedLoadKw > peak.predictedLoadKw) peak = h;
  }

  const totalHours = hourly.length || 24;
  const startHour = ((peak.hour - PRE_COOL_LEAD_HOURS) % totalHours + totalHours) % totalHours;

  const excessOverBaseline = Math.max(0, peak.predictedLoadKw - profile.baselineKw);
  const estimatedReductionKw = excessOverBaseline * PRE_COOL_SHAVE_FRACTION;
  const estimatedPeakReductionPct =
    peak.predictedLoadKw > 0
      ? Math.round((estimatedReductionKw / peak.predictedLoadKw) * 1000) / 10
      : 0;

  return {
    hourly,
    peakHour: peak.hour,
    peakLoadKw: peak.predictedLoadKw,
    recommendation: {
      startHour,
      peakHour: peak.hour,
      peakLoadKw: peak.predictedLoadKw,
      estimatedPeakReductionPct,
    },
  };
}
