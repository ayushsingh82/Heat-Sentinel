import { GRID_SIZE, type Aoi, type City } from "./aoi";

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
  /** PM2.5 sub-index — the pollutant that usually drives AQI during heat. */
  pm25: number;
  /** Global horizontal irradiance (W/m²) — the solar load on a building/street. */
  solarGhi: number;
  /** Cloud cover in oktas (0 clear … 8 overcast). */
  cloudCoverOctas: number;
  /** CO₂ concentration (ppm) — an urban-density / stagnation proxy. */
  co2Ppm: number;
};

/** Static, non-hourly context returned alongside the curve. */
export type SignalContext = {
  elevationM: number | null;
  /** Peak clear-sky solar irradiance for the day (W/m²). */
  clearSkyGhi: number;
  clearSkyDni: number;
  clearSkyDhi: number;
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
  context: SignalContext;
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
 * Per-AOI-type thermal character (added on top of the city climate):
 *  - the work site sits on exposed/curing ground so its wet-bulb runs high
 *  - the care home is a poorly ventilated block whose overnight low barely drops
 *  - the corridor gets some breeze / shade relief
 */
const TYPE_THERMAL: Record<string, { baseOffsetF: number; nightHoldF: number; humidityBias: number }> = {
  building: { baseOffsetF: 1.0, nightHoldF: 0, humidityBias: 0 },
  worksite: { baseOffsetF: 3.0, nightHoldF: 1.0, humidityBias: 8 },
  care_home: { baseOffsetF: 2.0, nightHoldF: 8.0, humidityBias: 3 },
  corridor: { baseOffsetF: -1.5, nightHoldF: -1.5, humidityBias: 6 },
};

/** Base relative-humidity band (midday → night) per city climate regime. */
const REGIME_HUMIDITY: Record<string, { middayRh: number; nightRh: number }> = {
  arid: { middayRh: 14, nightRh: 42 },
  "coastal-humid": { middayRh: 40, nightRh: 82 },
  continental: { middayRh: 24, nightRh: 58 },
  tropical: { middayRh: 66, nightRh: 95 },
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

function mockHourly(aoi: Aoi, city: City): HourlySignal[] {
  const seed = hashString(aoi.id);
  const rand = seededRandom(seed);
  const character = TYPE_THERMAL[aoi.type];
  const hum = REGIME_HUMIDITY[city.climate.regime];

  const baseline = city.climate.meanTempF + (seed % 3) + character.baseOffsetF;
  const amplitude = city.climate.diurnalRangeF / 2 + rand() * 2;
  const midRh = (hum.middayRh + hum.nightRh) / 2;
  const rhSwing = (hum.nightRh - hum.middayRh) / 2;

  const out: HourlySignal[] = [];
  for (let hour = 0; hour < 24; hour++) {
    // Air temp: sinusoid peaking at 15:00, plus night heat-hold for some types.
    const phase = ((hour - 15) / 24) * 2 * Math.PI;
    const nightFactor = Math.max(0, Math.cos(((hour - 3) / 24) * 2 * Math.PI));
    const jitter = (rand() - 0.5) * 2;
    const tempF =
      baseline + amplitude * Math.cos(phase) + character.nightHoldF * nightFactor + jitter;

    // Humidity runs opposite to temperature; band set by the city's regime.
    const rh = Math.min(
      98,
      Math.max(8, midRh - rhSwing * Math.cos(phase) + character.humidityBias + (rand() - 0.5) * 4),
    );

    const hiF = heatIndexF(tempF, rh);
    const wbF = cToF(wetBulbC(fToC(tempF), rh));
    // Apparent temp: sun-exposed sites feel hotter by day, all sites ≈ air temp at night.
    const solarShape = Math.max(0, Math.cos(((hour - 13) / 24) * 2 * Math.PI));
    const apparentF = tempF + solarShape * (aoi.type === "worksite" ? 12 : aoi.type === "corridor" ? 7 : 4);

    // Cloud cover: mostly clear in arid climates, more convective cloud in the tropics.
    const cloudBase = city.climate.regime === "tropical" ? 3.5 : city.climate.regime === "coastal-humid" ? 1.5 : 0.6;
    const cloudCoverOctas = Math.max(0, Math.min(8, Math.round(cloudBase + (rand() - 0.4) * 3)));

    // Solar GHI: clear-sky bell curve, knocked down by cloud.
    const clearSkyPeak = 940 - Math.abs(city.lat) * 3;
    const solarGhi = Math.max(0, Math.round(clearSkyPeak * solarShape * (1 - cloudCoverOctas / 16)));

    // Air quality: worse when stagnant and hot; PM2.5 usually the dominant sub-index.
    const pm25 = Math.max(
      6,
      Math.round(28 + 34 * Math.max(0, Math.cos(phase)) + (aoi.type === "worksite" ? 30 : 0) + (rand() - 0.5) * 10),
    );
    const aqi = Math.round(pm25 * 2.6 + (aoi.type === "worksite" ? 18 : 6));
    const co2Ppm = Math.round(
      420 + (aoi.type === "corridor" ? 20 : 8) + 30 * Math.max(0, Math.cos(phase)) + (rand() - 0.5) * 8,
    );

    out.push({
      hour,
      tempF: Math.round(tempF * 10) / 10,
      heatIndexF: Math.round(hiF * 10) / 10,
      apparentF: Math.round(apparentF * 10) / 10,
      wetBulbF: Math.round(wbF * 10) / 10,
      relativeHumidityPct: Math.round(rh),
      aqi: Math.max(15, aqi),
      pm25,
      solarGhi,
      cloudCoverOctas,
      co2Ppm,
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
// Live client — real FortyGuard contract (see components/api-reference.md)
//   POST /v1/env_params  ->  { data: { activity_id } }
//   GET  /v1/status/{id} ->  { data: { status, result } }   (poll until Completed)
// All values come back in °C / indices; we convert to °F internally.
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://api.fortyguard.com";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function pollStatus(root: string, apiKey: string, activityId: string): Promise<unknown | null> {
  // Bounded so the whole assessment stays demo-responsive; a slow AOI falls back
  // to the labelled mock rather than blocking the page. env_params normally
  // completes in a few seconds.
  for (let attempt = 0; attempt < 9; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
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

async function fetchLiveBundle(aoi: Aoi, city: City): Promise<SignalBundle | null> {
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
        // Seed air temperature in °C — the city's peak-season daily mean.
        temperature: Math.round(fToC(city.climate.meanTempF)),
        date_time: { start_date: todayIso(), filter_type: 3 },
      }),
    });
    if (!submit.ok) return null;
    const activityId: string | undefined = (await submit.json())?.data?.activity_id;
    if (!activityId) return null;

    const result = await pollStatus(root, apiKey, activityId);
    const parsed = normalizeEnvParams(result);
    if (!parsed) return null;

    const peak = Math.max(...parsed.hourly.map((h) => h.tempF));
    return {
      source: "live",
      aoiId: aoi.id,
      hourly: parsed.hourly,
      context: parsed.context,
      grid: mockGrid(aoi, peak),
    };
  } catch {
    return null;
  }
}

type EnvParamsResult = {
  metadata?: { timestamps?: string[] };
  locations?: Array<{
    elevation?: number | null;
    parameters?: Record<string, Array<number | null>>;
    solar_irradiance?: { clear_sky?: { ghi?: number; dni?: number; dhi?: number } };
  }>;
};

/** Convert a possibly-null °C value; treat legacy -999 as missing. */
function cval(arr: Array<number | null> | undefined, i: number, fallbackC: number): number {
  const v = arr?.[i];
  return typeof v === "number" && Number.isFinite(v) && v > -900 ? v : fallbackC;
}

function normalizeEnvParams(result: unknown): { hourly: HourlySignal[]; context: SignalContext } | null {
  const r = result as EnvParamsResult;
  const loc = r?.locations?.[0];
  const params = loc?.parameters;
  const stamps = r?.metadata?.timestamps;
  if (!params || !stamps || stamps.length === 0) return null;

  const clear = loc?.solar_irradiance?.clear_sky ?? {};
  const context: SignalContext = {
    elevationM: typeof loc?.elevation === "number" ? loc.elevation : null,
    clearSkyGhi: Math.round(clear.ghi ?? 900),
    clearSkyDni: Math.round(clear.dni ?? 780),
    clearSkyDhi: Math.round(clear.dhi ?? 130),
  };

  const n = Math.min(24, stamps.length);
  const out: HourlySignal[] = [];
  for (let i = 0; i < n; i++) {
    // Timestamps carry a UTC offset; take the local hour from the string.
    const hourMatch = stamps[i].match(/T(\d{2}):/);
    const hour = hourMatch ? Number(hourMatch[1]) : i % 24;

    const apparentC = cval(params["apparent_temperature_celsius"], i, 40);
    const wbC = cval(params["wet_bulb_temperature_celsius"], i, 26);
    const rh = cval(params["relative_humidity_percent"], i, 50);
    const aqi = cval(params["air_quality:idx"], i, 80);
    const pm25 = cval(params["air_quality_pm2p5:idx"], i, Math.round(aqi / 2.6));
    const cloudCoverOctas = Math.max(0, Math.min(8, Math.round(cval(params["cloud_cover_octas"], i, 1))));
    const co2Ppm = Math.round(cval(params["co2_ppm"], i, 420));

    // env_params has no raw air-temp array, and its heat_index_celsius field runs
    // away under hot+humid conditions — so derive dry-bulb from apparent
    // temperature (apparent ≈ air + a few °C of sun/humidity load by day, ≈ air
    // at night) and recompute the heat index ourselves with the NWS cap.
    const solarLoad = hour >= 8 && hour <= 17 ? 3.5 : 1;
    const airF = cToF(apparentC) - solarLoad;

    // Solar GHI: shape the clear-sky peak over the day and knock it down for cloud.
    const solarShape = Math.max(0, Math.cos(((hour - 13) / 24) * 2 * Math.PI));
    const solarGhi = Math.max(0, Math.round(context.clearSkyGhi * solarShape * (1 - cloudCoverOctas / 16)));

    out.push({
      hour,
      tempF: Math.round(airF * 10) / 10,
      heatIndexF: Math.round(heatIndexF(airF, rh) * 10) / 10,
      apparentF: Math.round(cToF(apparentC) * 10) / 10,
      wetBulbF: Math.round(cToF(wbC) * 10) / 10,
      relativeHumidityPct: Math.round(rh),
      aqi: Math.max(15, Math.round(aqi)),
      pm25: Math.max(3, Math.round(pm25)),
      solarGhi,
      cloudCoverOctas,
      co2Ppm,
    });
  }
  return out.length ? { hourly: out, context } : null;
}

// ---------------------------------------------------------------------------

function mockContext(aoi: Aoi, city: City): SignalContext {
  const rand = seededRandom(hashString(aoi.id + ":ctx"));
  const ghi = Math.round(940 - Math.abs(city.lat) * 3 + (rand() - 0.5) * 40);
  return {
    elevationM: Math.round(4 + rand() * 40),
    clearSkyGhi: ghi,
    clearSkyDni: Math.round(ghi * 0.82),
    clearSkyDhi: Math.round(ghi * 0.15),
  };
}

export async function getSignalBundle(aoi: Aoi, city: City): Promise<SignalBundle> {
  const live = await fetchLiveBundle(aoi, city);
  if (live) return live;
  const hourly = mockHourly(aoi, city);
  const peak = Math.max(...hourly.map((h) => h.tempF));
  return {
    source: "mock",
    aoiId: aoi.id,
    hourly,
    context: mockContext(aoi, city),
    grid: mockGrid(aoi, peak),
  };
}
