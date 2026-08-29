import { GRID_SIZE, type Aoi } from "./aoi";

/**
 * One hour of hyperlocal thermal signal for an AOI. In live mode these fields
 * come from FortyGuard's `POST /v1/env_params`; in mock mode they are generated
 * by a seeded deterministic model so every demo run is identical.
 */
export type HourlySignal = {
  hour: number;
  tempF: number;
  /** NWS heat index (feels-like in shade). */
  heatIndexF: number;
  /** Apparent temperature including sun and wind. */
  apparentF: number;
  /** Wet-bulb temperature — the safe-work / survivability metric. */
  wetBulbF: number;
  relativeHumidityPct: number;
  /** Air Quality Index (0–500), correlated with stagnant heat. */
  aqi: number;
};

export type HeatGrid = {
  size: number;
  /** Row-major tempF per cell, length size*size. */
  cells: number[];
};

export type SignalBundle = {
  source: "live" | "mock";
  aoiId: string;
  hourly: HourlySignal[];
  /** Local heatmap around the AOI, for the 3D view and the corridor route calc. */
  grid: HeatGrid;
};

// ---------------------------------------------------------------------------
// Deterministic mock model
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Per-AOI-type thermal character, tuned to Abu Dhabi August:
 *  - air-temp mean ~38 °C (100 °F), diurnal swing ~±10 °F
 *  - the work site sits by a water channel (humid) so its wet-bulb genuinely
 *    crosses the ~31 °C / 88 °F outdoor-labour curtailment line midday
 *  - the care home is a poorly ventilated block: its overnight low barely drops
 */
const TYPE_THERMAL: Record<string, { baseOffsetF: number; nightHoldF: number; humidityBias: number }> = {
  building: { baseOffsetF: 1.0, nightHoldF: 0, humidityBias: 0 },
  worksite: { baseOffsetF: 3.0, nightHoldF: 1.0, humidityBias: 13 },
  care_home: { baseOffsetF: 2.0, nightHoldF: 8.0, humidityBias: 3 },
  corridor: { baseOffsetF: -1.5, nightHoldF: -1.5, humidityBias: 8 },
};

/** Stull (2011) wet-bulb approximation. T in °C, RH in %, returns °C. */
function wetBulbC(tempC: number, rh: number): number {
  return (
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
}

/** NWS Rothfusz heat-index regression. T in °F, RH in %, returns °F. */
function heatIndexF(tempF: number, rh: number): number {
  if (tempF < 80) return tempF;
  let hi =
    -42.379 +
    2.04901523 * tempF +
    10.14333127 * rh -
    0.22475541 * tempF * rh -
    0.00683783 * tempF * tempF -
    0.05481717 * rh * rh +
    0.00122874 * tempF * tempF * rh +
    0.00085282 * tempF * rh * rh -
    0.00000199 * tempF * tempF * rh * rh;
  if (rh < 13 && tempF >= 80 && tempF <= 112) {
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
  }
  // The NWS heat-index table tops out around 137°F; the regression runs away
  // past that, so clamp to the chart's documented maximum.
  return Math.min(hi, 137);
}

const fToC = (f: number) => ((f - 32) * 5) / 9;
const cToF = (c: number) => (c * 9) / 5 + 32;

function mockHourly(aoi: Aoi): HourlySignal[] {
  const seed = hashString(aoi.id);
  const rand = seededRandom(seed);
  const character = TYPE_THERMAL[aoi.type];

  // Coastal Abu Dhabi summer: hot, humid, strong afternoon peak.
  const baseline = 93 + (seed % 3) + character.baseOffsetF; // ~93–99°F mean
  const amplitude = 9 + rand() * 3;

  const out: HourlySignal[] = [];
  for (let hour = 0; hour < 24; hour++) {
    // Air temp: sinusoid peaking at 15:00, plus night heat-hold for some types.
    const phase = ((hour - 15) / 24) * 2 * Math.PI;
    const nightFactor = Math.max(0, Math.cos(((hour - 3) / 24) * 2 * Math.PI));
    const jitter = (rand() - 0.5) * 2;
    const tempF =
      baseline + amplitude * Math.cos(phase) + character.nightHoldF * nightFactor + jitter;

    // Humidity runs opposite to temperature; higher near the coast.
    const rh = Math.min(
      90,
      Math.max(22, 55 - 16 * Math.cos(phase) + character.humidityBias + (rand() - 0.5) * 4),
    );

    const hiF = heatIndexF(tempF, rh);
    const wbF = cToF(wetBulbC(fToC(tempF), rh));
    // Apparent temp: sun-exposed sites feel hotter by day, all sites ≈ air temp at night.
    const solar = Math.max(0, Math.cos(((hour - 13) / 24) * 2 * Math.PI));
    const apparentF = tempF + solar * (aoi.type === "worksite" ? 12 : aoi.type === "corridor" ? 7 : 4);
    const aqi = Math.round(
      70 + 60 * Math.max(0, Math.cos(phase)) + (aoi.type === "worksite" ? 35 : 0) + (rand() - 0.5) * 15,
    );

    out.push({
      hour,
      tempF: Math.round(tempF * 10) / 10,
      heatIndexF: Math.round(hiF * 10) / 10,
      apparentF: Math.round(apparentF * 10) / 10,
      wetBulbF: Math.round(wbF * 10) / 10,
      relativeHumidityPct: Math.round(rh),
      aqi: Math.max(15, aqi),
    });
  }
  return out;
}

/**
 * Local heatmap grid centred on the AOI. A smooth radial hot-spot at the AOI's
 * grid cell over a city-wide gradient, plus seeded texture — enough for the 3D
 * view and for the corridor route search to find a genuinely cooler path.
 */
function mockGrid(aoi: Aoi, peakTempF: number): HeatGrid {
  const rand = seededRandom(hashString(aoi.id + ":grid"));
  const cells: number[] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const gradient = ((x + y) / (2 * GRID_SIZE)) * 10 - 5; // NW cooler, SE hotter
      const d = Math.hypot(x - aoi.gx, y - aoi.gy);
      const hotspot = Math.max(0, 5 - d) * 2.2;
      // A cool "shade lane" (tree line / built shadow) running NE–SW near the AOI.
      const lane = -3.5 * Math.exp(-(((x - y) - (aoi.gx - aoi.gy)) ** 2) / 8);
      const texture = (rand() - 0.5) * 2.5;
      cells.push(Math.round((peakTempF - 6 + gradient + hotspot + lane + texture) * 10) / 10);
    }
  }
  return { size: GRID_SIZE, cells };
}

// ---------------------------------------------------------------------------
// Live client — real FortyGuard contract (see hackathon/api-reference.md)
//   POST /v1/env_params  ->  { data: { activity_id } }
//   GET  /v1/status/{id} ->  { data: { status, result } }   (poll until Completed)
// All values come back in °C / indices; we convert to °F internally.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://api.fortyguard.com";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function pollStatus(root: string, apiKey: string, activityId: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 22; attempt++) {
    await new Promise((r) => setTimeout(r, 2200));
    const res = await fetch(`${root}/v1/status/${activityId}`, { headers: { "api-key": apiKey } });
    if (!res.ok) continue;
    const json = await res.json();
    const data = json?.data ?? json;
    const status = String(data?.status ?? "").toLowerCase();
    if (status === "completed") return data?.result ?? null;
    if (status === "failed") return null;
  }
  return null;
}

async function fetchLiveBundle(aoi: Aoi): Promise<SignalBundle | null> {
  const apiKey = process.env.FORTYGUARD_API_KEY;
  if (!apiKey) return null;
  const root = (process.env.FORTYGUARD_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

  try {
    const submit = await fetch(`${root}/v1/env_params`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        latitude: aoi.lat,
        longitude: aoi.lng,
        // Seed air temperature in °C — a plausible Abu Dhabi summer mean.
        temperature: 38,
        date_time: { start_date: todayIso(), filter_type: 3 },
      }),
    });
    if (!submit.ok) return null;
    const activityId: string | undefined = (await submit.json())?.data?.activity_id;
    if (!activityId) return null;

    const result = await pollStatus(root, apiKey, activityId);
    const hourly = normalizeEnvParams(result);
    if (!hourly) return null;

    const peak = Math.max(...hourly.map((h) => h.tempF));
    return { source: "live", aoiId: aoi.id, hourly, grid: mockGrid(aoi, peak) };
  } catch {
    return null;
  }
}

type EnvParamsResult = {
  metadata?: { timestamps?: string[] };
  locations?: Array<{
    parameters?: Record<string, Array<number | null>>;
  }>;
};

/** Convert a possibly-null °C value; treat legacy -999 as missing. */
function cval(arr: Array<number | null> | undefined, i: number, fallbackC: number): number {
  const v = arr?.[i];
  return typeof v === "number" && Number.isFinite(v) && v > -900 ? v : fallbackC;
}

function normalizeEnvParams(result: unknown): HourlySignal[] | null {
  const r = result as EnvParamsResult;
  const params = r?.locations?.[0]?.parameters;
  const stamps = r?.metadata?.timestamps;
  if (!params || !stamps || stamps.length === 0) return null;

  const n = Math.min(24, stamps.length);
  const out: HourlySignal[] = [];
  for (let i = 0; i < n; i++) {
    // Timestamps carry a +04:00 offset; take the local hour from the string.
    const hourMatch = stamps[i].match(/T(\d{2}):/);
    const hour = hourMatch ? Number(hourMatch[1]) : i % 24;

    const apparentC = cval(params["apparent_temperature_celsius"], i, 40);
    const wbC = cval(params["wet_bulb_temperature_celsius"], i, 26);
    const rh = cval(params["relative_humidity_percent"], i, 50);
    const aqi = cval(params["air_quality:idx"], i, 80);

    // env_params has no raw air-temp array, and its heat_index_celsius field runs
    // away under hot+humid conditions — so derive dry-bulb from apparent
    // temperature (apparent ≈ air + a few °C of sun/humidity load by day, ≈ air
    // at night) and recompute the heat index ourselves with the NWS cap.
    const solarLoad = hour >= 8 && hour <= 17 ? 3.5 : 1;
    const airF = cToF(apparentC) - solarLoad;

    out.push({
      hour,
      tempF: Math.round(airF * 10) / 10,
      heatIndexF: Math.round(heatIndexF(airF, rh) * 10) / 10,
      apparentF: Math.round(cToF(apparentC) * 10) / 10,
      wetBulbF: Math.round(cToF(wbC) * 10) / 10,
      relativeHumidityPct: Math.round(rh),
      aqi: Math.max(15, Math.round(aqi)),
    });
  }
  return out.length ? out : null;
}

// ---------------------------------------------------------------------------

export async function getSignalBundle(aoi: Aoi): Promise<SignalBundle> {
  const live = await fetchLiveBundle(aoi);
  if (live) return live;
  const hourly = mockHourly(aoi);
  const peak = Math.max(...hourly.map((h) => h.tempF));
  return { source: "mock", aoiId: aoi.id, hourly, grid: mockGrid(aoi, peak) };
}
