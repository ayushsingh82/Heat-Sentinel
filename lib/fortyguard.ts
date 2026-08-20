export type HourlyTemp = {
  hour: number;
  tempF: number;
  riskLevel: string;
};

export type HourlyTempResult = {
  source: "live" | "mock";
  hourly: HourlyTemp[];
};

function riskLevelFor(tempF: number): string {
  if (tempF >= 110) return "extreme";
  if (tempF >= 100) return "high";
  if (tempF >= 90) return "moderate";
  return "low";
}

/**
 * Deterministic seeded PRNG (mulberry32) so the same location + hour
 * always produces the same mock reading during a demo.
 */
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
 * Deterministic mock daily temperature curve: a sinusoid peaking mid-afternoon
 * (~hour 15) with a location-derived baseline and amplitude, plus small
 * seeded jitter so it looks like real sensor noise without being random
 * across runs.
 */
function mockHourlyTemps(location: string, hours: number): HourlyTemp[] {
  const seed = hashString(location.trim().toLowerCase());
  const rand = seededRandom(seed);

  const baseline = 78 + (seed % 20); // 78-97F baseline depending on location
  const amplitude = 12 + (rand() * 10); // 12-22F daily swing

  const result: HourlyTemp[] = [];
  for (let hour = 0; hour < hours; hour++) {
    // Peak at hour 15 (3pm), trough at hour 3 (3am), 24h period.
    const phase = ((hour - 15) / 24) * 2 * Math.PI;
    const jitter = (rand() - 0.5) * 3;
    const tempF = Math.round((baseline + amplitude * Math.cos(phase) + jitter) * 10) / 10;
    result.push({ hour, tempF, riskLevel: riskLevelFor(tempF) });
  }
  return result;
}

type LiveApiPoint = {
  temperature_f?: number;
  risk_level?: string;
  hour?: number;
};

/**
 * Calls the real FortyGuard Temperature API if credentials are configured.
 * The public docs only show a single-point `POST /v1/heat-intelligence`
 * response shape, not a forecast array, so this defensively:
 *  - looks for an array field (`hourly`, `forecast`, or a bare array body)
 *  - otherwise treats the response as a single current reading and repeats
 *    it as a flat forecast (better than crashing the demo).
 */
async function fetchLiveHourlyTemps(location: string, hours: number): Promise<HourlyTemp[] | null> {
  const apiKey = process.env.FORTYGUARD_API_KEY;
  const baseUrl = process.env.FORTYGUARD_API_BASE_URL;
  if (!apiKey || !baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/heat-intelligence`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ location, hours }),
    });

    if (!res.ok) return null;
    const data = await res.json();

    const arrayField: LiveApiPoint[] | undefined =
      Array.isArray(data) ? data : data?.hourly ?? data?.forecast ?? undefined;

    if (arrayField && arrayField.length > 0) {
      return arrayField.slice(0, hours).map((point, i) => ({
        hour: point.hour ?? i,
        tempF: point.temperature_f ?? 0,
        riskLevel: point.risk_level ?? riskLevelFor(point.temperature_f ?? 0),
      }));
    }

    // Single-point response: repeat it across the requested window.
    const single: LiveApiPoint = data;
    if (typeof single?.temperature_f === "number") {
      return Array.from({ length: hours }, (_, hour) => ({
        hour,
        tempF: single.temperature_f as number,
        riskLevel: single.risk_level ?? riskLevelFor(single.temperature_f as number),
      }));
    }

    return null;
  } catch {
    return null;
  }
}

export async function getHourlyTemps(location: string, hours = 24): Promise<HourlyTempResult> {
  const live = await fetchLiveHourlyTemps(location, hours);
  if (live) {
    return { source: "live", hourly: live };
  }
  return { source: "mock", hourly: mockHourlyTemps(location, hours) };
}
