import Anthropic from "@anthropic-ai/sdk";
import { AOI_TYPE_LABEL, type Aoi, type AoiType } from "./aoi";
import { computeHeatRisk } from "./heatEngine";
import { coolestCorridor } from "./route";
import type { HourlySignal, SignalBundle } from "./fortyguard";

export type RecommendationKind =
  | "pre_cool"
  | "reschedule_shift"
  | "resident_alert"
  | "cool_route";

export type RiskLabel = "low" | "moderate" | "high" | "extreme";

export type HourWindow = { startHour: number; endHour: number };

export type Assessment = {
  aoiId: string;
  aoiName: string;
  aoiType: AoiType;
  aoiTypeLabel: string;
  agentSource: "claude" | "rules";
  dataSource: "live" | "mock";
  riskScore: number;
  riskLabel: RiskLabel;
  peakWindow: HourWindow;
  peakHour: number;
  headline: string;
  rationale: string;
  citedSignal: string;
  recommendation: {
    kind: RecommendationKind;
    label: string;
    actionWindow: HourWindow;
    detail: string;
    metric?: { label: string; value: string };
    draft: string;
  };
  /** Only present for corridor AOIs — feeds the map overlay. */
  route?: {
    coolPath: [number, number][];
    shortPath: [number, number][];
    coolAvgF: number;
    shortAvgF: number;
  };
  /** Hourly series echoed for the timeline chart. */
  hourly: HourlySignal[];
};

// --- Thresholds (documented, conservative) ---------------------------------

/** Wet-bulb °F above which sustained outdoor labour should be curtailed. ~31 °C. */
const WET_BULB_CURTAIL_F = 88;
/** Hours of pre-action lead time before the peak window. */
const LEAD_HOURS = 3;

function fmtHour(h: number): string {
  const x = ((h % 24) + 24) % 24;
  return `${String(x).padStart(2, "0")}:00`;
}

function labelFor(score: number): RiskLabel {
  if (score >= 80) return "extreme";
  if (score >= 60) return "high";
  if (score >= 35) return "moderate";
  return "low";
}

function peakWindowOf(hourly: HourlySignal[], key: keyof HourlySignal): { peakHour: number; window: HourWindow } {
  let peakHour = 0;
  let peakVal = -Infinity;
  for (const h of hourly) {
    const v = h[key] as number;
    if (v > peakVal) {
      peakVal = v;
      peakHour = h.hour;
    }
  }
  const threshold = peakVal - Math.max(2, peakVal * 0.03);
  const hoursOverThreshold = hourly.filter((h) => (h[key] as number) >= threshold).map((h) => h.hour);
  return {
    peakHour,
    window: {
      startHour: Math.min(...hoursOverThreshold),
      endHour: Math.max(...hoursOverThreshold),
    },
  };
}

// --- Rule-based assessor (always runs; deterministic) ----------------------

function assessByRules(aoi: Aoi, bundle: SignalBundle): Assessment {
  const { hourly } = bundle;
  const base = {
    aoiId: aoi.id,
    aoiName: aoi.name,
    aoiType: aoi.type,
    aoiTypeLabel: AOI_TYPE_LABEL[aoi.type],
    agentSource: "rules" as const,
    dataSource: bundle.source,
    hourly,
  };

  const peakHI = Math.max(...hourly.map((h) => h.heatIndexF));
  const peakWB = Math.max(...hourly.map((h) => h.wetBulbF));
  const peakAQIall = Math.max(...hourly.map((h) => h.aqi));
  const nightMinAll = Math.min(...hourly.filter((h) => h.hour >= 22 || h.hour <= 5).map((h) => h.tempF));

  // Normalised 0–1 risk components, each against a documented band.
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const hiComponent = clamp01((peakHI - 95) / (137 - 95)); // NWS caution → table max
  const wbComponent = clamp01((peakWB - 80) / (WET_BULB_CURTAIL_F + 3 - 80)); // → curtail line + margin
  const nightComponent = clamp01((nightMinAll - 84) / (100 - 84)); // failed overnight recovery
  const aqiComponent = clamp01((peakAQIall - 100) / (200 - 100)); // USG → very unhealthy

  if (aoi.type === "building" && aoi.building) {
    const risk = computeHeatRisk(hourly, aoi.building);
    const { peakHour, window } = peakWindowOf(hourly, "heatIndexF");
    const actionWindow = { startHour: risk.recommendation.startHour, endHour: risk.peakHour };
    // Building risk = heat-index load, lifted by how close demand runs to HVAC capacity.
    const loadFactor = clamp01((risk.peakLoadKw - aoi.building.baselineKw) / Math.max(1, aoi.building.hvacCapacityKw - aoi.building.baselineKw));
    const riskScore = Math.round(100 * clamp01(0.7 * hiComponent + 0.3 * loadFactor));
    return {
      ...base,
      riskScore,
      riskLabel: labelFor(riskScore),
      peakHour,
      peakWindow: window,
      headline: `Demand peak ~${risk.peakLoadKw} kW near ${fmtHour(risk.peakHour)}`,
      citedSignal: `heat index peaks at ${peakHI.toFixed(0)}°F (${fmtHour(peakHour)})`,
      rationale: `The heat-index curve peaks at ${peakHI.toFixed(0)}°F around ${fmtHour(
        peakHour,
      )}, which the degree-hour model turns into a cooling load of ~${risk.peakLoadKw} kW against a ${aoi.building.baselineKw} kW baseline. Pre-cooling from ${fmtHour(
        risk.recommendation.startHour,
      )} pulls the slab and air mass down before the peak, flattening it.`,
      recommendation: {
        kind: "pre_cool",
        label: "Pre-cool the building",
        actionWindow,
        detail: `Drop the setpoint 2–3°F from ${fmtHour(risk.recommendation.startHour)} to ${fmtHour(
          risk.peakHour,
        )}, then coast through the peak.`,
        metric: { label: "Est. peak shaved", value: `${risk.recommendation.estimatedPeakReductionPct}%` },
        draft: buildingDraft(aoi, risk.recommendation.startHour, risk.peakHour, risk.peakLoadKw, risk.recommendation.estimatedPeakReductionPct),
      },
    };
  }

  if (aoi.type === "worksite" && aoi.worksite) {
    const { peakHour, window } = peakWindowOf(hourly, "wetBulbF");
    const overHours = hourly
      .filter((h) => h.wetBulbF >= WET_BULB_CURTAIL_F && h.hour >= aoi.worksite!.shiftStartHour && h.hour <= aoi.worksite!.shiftEndHour)
      .map((h) => h.hour);
    const crosses = overHours.length > 0;
    const curtail: HourWindow = crosses
      ? { startHour: Math.min(...overHours), endHour: Math.max(...overHours) + 1 }
      : { startHour: 12, endHour: 15 };
    // Worksite risk = wet-bulb exposure, escalated by how many shift-hours breach the line.
    const durationFactor = clamp01(overHours.length / 6);
    const riskScore = Math.round(100 * clamp01(0.75 * wbComponent + 0.25 * durationFactor));
    return {
      ...base,
      riskScore,
      riskLabel: labelFor(riskScore),
      peakHour,
      peakWindow: window,
      headline: crosses
        ? `Wet-bulb over ${WET_BULB_CURTAIL_F}°F for ${overHours.length}h from ${fmtHour(curtail.startHour)}`
        : `Wet-bulb peaks ${peakWB.toFixed(0)}°F — near the ${WET_BULB_CURTAIL_F}°F curtail line`,
      citedSignal: `wet-bulb peaks at ${peakWB.toFixed(1)}°F (${fmtHour(peakHour)})`,
      rationale: crosses
        ? `Wet-bulb temperature reaches ${peakWB.toFixed(1)}°F at ${fmtHour(
            peakHour,
          )} and holds above the ${WET_BULB_CURTAIL_F}°F curtailment line from ${fmtHour(curtail.startHour)} to ${fmtHour(
            curtail.endHour,
          )}. Sustained outdoor work in that band risks heat illness even with water and rest, and it overlaps the UAE statutory midday break.`
        : `Wet-bulb temperature peaks at ${peakWB.toFixed(1)}°F at ${fmtHour(
            peakHour,
          )} — just under the ${WET_BULB_CURTAIL_F}°F curtailment line, but close enough that a hotter-than-forecast hour would cross it. Treat the ${fmtHour(
            curtail.startHour,
          )}–${fmtHour(curtail.endHour)} window as precautionary and align it with the statutory midday break.`,
      recommendation: {
        kind: "reschedule_shift",
        label: "Reschedule the afternoon block",
        actionWindow: curtail,
        detail: `Move the ${aoi.worksite.crewSize}-person crew's ${fmtHour(curtail.startHour)}–${fmtHour(
          curtail.endHour,
        )} block to an early start (${fmtHour(aoi.worksite.shiftStartHour)}–${fmtHour(curtail.startHour)}); mandate shaded rest 1:1 work:rest if any work remains in the band.`,
        metric: { label: "Crew affected", value: `${aoi.worksite.crewSize}` },
        draft: worksiteDraft(aoi, curtail, peakWB),
      },
    };
  }

  if (aoi.type === "care_home" && aoi.careHome) {
    const { peakHour, window } = peakWindowOf(hourly, "apparentF");
    const nightMin = nightMinAll;
    const peakAQI = peakAQIall;
    // Care-home risk = failed overnight recovery first, then daytime heat and air quality.
    const riskScore = Math.round(
      100 * clamp01(0.45 * nightComponent + 0.4 * hiComponent + 0.15 * aqiComponent),
    );
    return {
      ...base,
      riskScore,
      riskLabel: labelFor(riskScore),
      peakHour,
      peakWindow: window,
      headline: `Apparent temp peaks ${Math.max(...hourly.map((h) => h.apparentF)).toFixed(0)}°F; overnight low only ${nightMin.toFixed(0)}°F`,
      citedSignal: `overnight temperature stays at ${nightMin.toFixed(0)}°F; AQI peaks ${peakAQI}`,
      rationale: `The apparent temperature peaks in the afternoon, but the bigger risk for ${aoi.careHome.vulnerableResidents} vulnerable residents is that the overnight low only falls to ${nightMin.toFixed(
        0,
      )}°F — bodies don't get the recovery window. AQI also peaks at ${peakAQI}. Both point to moving residents to conditioned space and issuing an advisory before the afternoon.`,
      recommendation: {
        kind: "resident_alert",
        label: "Issue resident advisory + cooling plan",
        actionWindow: { startHour: Math.max(0, window.startHour - LEAD_HOURS), endHour: window.endHour },
        detail: `Brief staff by ${fmtHour(Math.max(0, window.startHour - LEAD_HOURS))}; relocate the ${aoi.careHome.vulnerableResidents} highest-risk residents to the coolest wing or to ${aoi.careHome.nearestCoolingCenter} for the ${fmtHour(
          window.startHour,
        )}–${fmtHour(window.endHour)} window.`,
        metric: { label: "Vulnerable residents", value: `${aoi.careHome.vulnerableResidents}` },
        draft: careHomeDraft(aoi, window, nightMin, peakAQI),
      },
    };
  }

  // corridor
  const route = coolestCorridor(bundle.grid, aoi);
  const { peakHour, window } = peakWindowOf(hourly, "apparentF");
  const delta = route.shortAvgF - route.coolAvgF;
  // Corridor risk = pedestrian heat exposure, but transient and mitigable, so it
  // sits below the fixed-asset risks at the same temperature.
  const riskScore = Math.round(100 * clamp01(0.6 * hiComponent + 0.2 * wbComponent));
  return {
    ...base,
    riskScore,
    riskLabel: labelFor(riskScore),
    peakHour,
    peakWindow: window,
    headline: `Cooler corridor route saves ${delta.toFixed(1)}°F average exposure`,
    citedSignal: `heatmap: cool path averages ${route.coolAvgF.toFixed(1)}°F vs ${route.shortAvgF.toFixed(1)}°F direct`,
    rationale: `Across the ${aoi.corridor?.walkMinutes ?? 14}-minute walk from ${aoi.corridor?.fromName} to ${aoi.corridor?.toName}, the local heatmap shows a shaded corridor averaging ${route.coolAvgF.toFixed(
      1,
    )}°F against ${route.shortAvgF.toFixed(1)}°F on the direct line — a ${delta.toFixed(1)}°F difference that matters most in the ${fmtHour(window.startHour)}–${fmtHour(
      window.endHour,
    )} peak.`,
    recommendation: {
      kind: "cool_route",
      label: "Publish the cool route",
      actionWindow: window,
      detail: `Push the cooler alignment to wayfinding signage and the transit app for the ${fmtHour(
        window.startHour,
      )}–${fmtHour(window.endHour)} window; it adds ~2 minutes of walking.`,
      metric: { label: "Exposure saved", value: `${delta.toFixed(1)}°F avg` },
      draft: corridorDraft(aoi, route, window),
    },
    route: {
      coolPath: route.coolPath,
      shortPath: route.shortPath,
      coolAvgF: route.coolAvgF,
      shortAvgF: route.shortAvgF,
    },
  } as Assessment;
}

// --- Draft artifact writers ----------------------------------------------

function buildingDraft(aoi: Aoi, start: number, end: number, peakKw: number, pct: number): string {
  return [
    `BUILDING MANAGEMENT NOTICE — ${aoi.name}`,
    ``,
    `Predicted cooling-demand peak: ~${peakKw} kW.`,
    `Pre-cooling schedule (today):`,
    `  • ${fmtHour(start)}  Lower cooling setpoint by 2–3°F across all zones.`,
    `  • ${fmtHour(end)}  Return to normal setpoint; allow indoor temp to drift up to +2°F through the peak.`,
    ``,
    `Expected outcome: demand peak reduced by ~${pct}% by shifting load out of the grid's most stressed hours.`,
  ].join("\n");
}

function worksiteDraft(aoi: Aoi, curtail: HourWindow, peakWB: number): string {
  return [
    `SITE SAFETY DIRECTIVE — ${aoi.name}`,
    ``,
    `Forecast wet-bulb temperature peaks at ${peakWB.toFixed(0)}°F today.`,
    `Outdoor work is CURTAILED ${fmtHour(curtail.startHour)}–${fmtHour(curtail.endHour)} (aligns with statutory midday break).`,
    ``,
    `Revised plan for the ${aoi.worksite?.crewSize}-person crew:`,
    `  • ${fmtHour(aoi.worksite?.shiftStartHour ?? 6)}–${fmtHour(curtail.startHour)}  Full outdoor work.`,
    `  • ${fmtHour(curtail.startHour)}–${fmtHour(curtail.endHour)}  Shaded rest / indoor tasks only. Water every 15 min.`,
    `  • ${fmtHour(curtail.endHour)} onward  Resume, 1:1 work:rest until wet-bulb drops below ${WET_BULB_CURTAIL_F}°F.`,
  ].join("\n");
}

function careHomeDraft(aoi: Aoi, window: HourWindow, nightMin: number, aqi: number): string {
  return [
    `HEAT ADVISORY — ${aoi.name}`,
    ``,
    `Today: high apparent temperature ${fmtHour(window.startHour)}–${fmtHour(window.endHour)}; overnight low only ~${nightMin.toFixed(
      0,
    )}°F; AQI up to ${aqi}.`,
    ``,
    `Actions:`,
    `  • Relocate the ${aoi.careHome?.vulnerableResidents} highest-risk residents to the coolest wing (or ${aoi.careHome?.nearestCoolingCenter}).`,
    `  • Hourly hydration checks; hold outdoor activities.`,
    `  • Keep windows shut and blinds down during the peak; run night ventilation only if outdoor temp drops below indoor.`,
  ].join("\n");
}

function corridorDraft(
  aoi: Aoi,
  route: ReturnType<typeof coolestCorridor>,
  window: HourWindow,
): string {
  return [
    `WAYFINDING UPDATE — ${aoi.name}`,
    ``,
    `Recommended cooler walking route ${aoi.corridor?.fromName} → ${aoi.corridor?.toName}, active ${fmtHour(
      window.startHour,
    )}–${fmtHour(window.endHour)}.`,
    `Average exposure: ${route.coolAvgF.toFixed(1)}°F (cool route) vs ${route.shortAvgF.toFixed(1)}°F (direct). Adds ~2 min.`,
    `Publish to: transit app, platform screens, wayfinding signage.`,
  ].join("\n");
}

// --- Claude enrichment ---------------------------------------------------

const ENRICH_TOOL: Anthropic.Tool = {
  name: "submit_assessment",
  description: "Return the finalized human-facing text for this heat-risk assessment.",
  input_schema: {
    type: "object",
    properties: {
      riskScore: { type: "number", description: "0-100, may adjust the rule-based score by at most ±15" },
      headline: { type: "string", description: "One line, <90 chars, concrete and quantified" },
      rationale: { type: "string", description: "2-4 sentences. Must name the specific FortyGuard signal and hour that drives the call." },
      citedSignal: { type: "string", description: "The single signal + value + hour the recommendation rests on" },
      recommendationDetail: { type: "string", description: "The concrete action, with times" },
      draft: { type: "string", description: "The ready-to-send artifact (notice / directive / advisory / update), plain text with line breaks" },
    },
    required: ["riskScore", "headline", "rationale", "citedSignal", "recommendationDetail", "draft"],
  },
};

async function enrichWithClaude(aoi: Aoi, bundle: SignalBundle, rule: Assessment): Promise<Assessment> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return rule;

  const client = new Anthropic({ apiKey });
  const digest = bundle.hourly
    .filter((h) => h.hour % 2 === 0)
    .map(
      (h) =>
        `${fmtHour(h.hour)}  air ${h.tempF}°F  HI ${h.heatIndexF}°F  wet-bulb ${h.wetBulbF}°F  apparent ${h.apparentF}°F  RH ${h.relativeHumidityPct}%  AQI ${h.aqi}`,
    )
    .join("\n");

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      tool_choice: { type: "tool", name: "submit_assessment" },
      tools: [ENRICH_TOOL],
      messages: [
        {
          role: "user",
          content: `You are Heat Sentinel, an autonomous agent managing heat risk for a portfolio of city assets in Abu Dhabi.

ASSET
  Name: ${aoi.name}
  Type: ${rule.aoiTypeLabel}
  Exposure note: ${aoi.exposureNote}

24H HYPERLOCAL SIGNAL (FortyGuard Temperature API, ${bundle.source} data), every 2h:
${digest}

RULE-BASED DRAFT (your job is to sharpen this, not replace the plan)
  risk score: ${rule.riskScore}
  headline: ${rule.headline}
  recommendation (${rule.recommendation.kind}): ${rule.recommendation.detail}
  action window: ${fmtHour(rule.recommendation.actionWindow.startHour)}–${fmtHour(rule.recommendation.actionWindow.endHour)}
  rationale: ${rule.rationale}

Keep the recommended ACTION and its timing. Improve the writing: make the headline and rationale concrete and quantified, cite the exact signal + hour, and produce a crisp ready-to-send ${rule.recommendation.kind === "pre_cool" ? "building notice" : rule.recommendation.kind === "reschedule_shift" ? "site safety directive" : rule.recommendation.kind === "resident_alert" ? "heat advisory" : "wayfinding update"}. You may adjust the risk score by at most ±15 if the signal clearly warrants it. Call submit_assessment.`,
        },
      ],
    });

    const block = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!block) return rule;
    const out = block.input as {
      riskScore?: number;
      headline?: string;
      rationale?: string;
      citedSignal?: string;
      recommendationDetail?: string;
      draft?: string;
    };

    const adjusted = Math.max(
      0,
      Math.min(100, Math.round(clampDelta(out.riskScore ?? rule.riskScore, rule.riskScore, 15))),
    );

    return {
      ...rule,
      agentSource: "claude",
      riskScore: adjusted,
      riskLabel: labelFor(adjusted),
      headline: out.headline?.trim() || rule.headline,
      rationale: out.rationale?.trim() || rule.rationale,
      citedSignal: out.citedSignal?.trim() || rule.citedSignal,
      recommendation: {
        ...rule.recommendation,
        detail: out.recommendationDetail?.trim() || rule.recommendation.detail,
        draft: out.draft?.trim() || rule.recommendation.draft,
      },
    };
  } catch {
    return rule;
  }
}

function clampDelta(value: number, anchor: number, maxDelta: number): number {
  if (value > anchor + maxDelta) return anchor + maxDelta;
  if (value < anchor - maxDelta) return anchor - maxDelta;
  return value;
}

// --- Public entry point -------------------------------------------------

export async function assessAoi(aoi: Aoi, bundle: SignalBundle): Promise<Assessment> {
  const rule = assessByRules(aoi, bundle);
  return enrichWithClaude(aoi, bundle, rule);
}
