/**
 * Heat Sentinel watches a portfolio of city assets. Each AOI (area of interest)
 * has a type; the agent tailors its reasoning and its recommended action to that
 * type. Portfolios are grouped by city — pick a city, get its assets.
 */

export type AoiType = "building" | "worksite" | "care_home" | "corridor";

export type BuildingProfile = {
  baselineKw: number;
  hvacCapacityKw: number;
  coolingSetpointF: number;
};

export type WorksiteProfile = {
  crewSize: number;
  shiftStartHour: number;
  shiftEndHour: number;
};

export type CareHomeProfile = {
  residents: number;
  vulnerableResidents: number;
  nearestCoolingCenter: string;
};

export type CorridorProfile = {
  fromName: string;
  toName: string;
  walkMinutes: number;
};

export type Aoi = {
  id: string;
  cityId: string;
  name: string;
  type: AoiType;
  lat: number;
  lng: number;
  /** Cell on the map's heat grid (0..GRID_SIZE-1). Drives the 3D view. */
  gx: number;
  gy: number;
  exposureNote: string;
  building?: BuildingProfile;
  worksite?: WorksiteProfile;
  careHome?: CareHomeProfile;
  corridor?: CorridorProfile;
};

/** Climate regime drives the deterministic mock model for a city. */
export type HumidityRegime = "arid" | "coastal-humid" | "continental" | "tropical";

export type City = {
  id: string;
  name: string;
  country: string;
  timezone: string;
  utcOffsetHours: number;
  lat: number;
  lng: number;
  climate: {
    /** Peak-season daily mean air temperature (°F). */
    meanTempF: number;
    /** Peak-to-trough daily swing (°F). */
    diurnalRangeF: number;
    regime: HumidityRegime;
  };
  /** One-line "why this city has a heat problem" for the UI. */
  note: string;
};

export const GRID_SIZE = 16;

export const AOI_TYPE_LABEL: Record<AoiType, string> = {
  building: "Commercial building",
  worksite: "Outdoor work site",
  care_home: "Elderly care home",
  corridor: "Transit corridor",
};

// --- Cities ---------------------------------------------------------------

export const CITIES: City[] = [
  {
    id: "abu-dhabi",
    name: "Abu Dhabi",
    country: "United Arab Emirates",
    timezone: "GST",
    utcOffsetHours: 4,
    lat: 24.4764,
    lng: 54.3705,
    climate: { meanTempF: 96, diurnalRangeF: 20, regime: "coastal-humid" },
    note: "Gulf coast: 45 °C afternoons and humid nights that never let the city cool down.",
  },
  {
    id: "dubai",
    name: "Dubai",
    country: "United Arab Emirates",
    timezone: "GST",
    utcOffsetHours: 4,
    lat: 25.2048,
    lng: 55.2708,
    climate: { meanTempF: 97, diurnalRangeF: 22, regime: "coastal-humid" },
    note: "Dense high-rise core plus vast construction fronts under a Gulf humidity load.",
  },
  {
    id: "phoenix",
    name: "Phoenix",
    country: "United States",
    timezone: "MST",
    utcOffsetHours: -7,
    lat: 33.4484,
    lng: -112.074,
    climate: { meanTempF: 95, diurnalRangeF: 30, regime: "arid" },
    note: "Desert heat island: dry 47 °C days, asphalt that radiates heat well past midnight.",
  },
  {
    id: "singapore",
    name: "Singapore",
    country: "Singapore",
    timezone: "SGT",
    utcOffsetHours: 8,
    lat: 1.3521,
    lng: 103.8198,
    climate: { meanTempF: 88, diurnalRangeF: 12, regime: "tropical" },
    note: "Air temperature is moderate, but near-total humidity pushes the heat index into the danger band daily.",
  },
];

export function getCity(id: string): City | undefined {
  return CITIES.find((c) => c.id === id);
}

// --- Portfolios ----------------------------------------------------------
// Every city carries the same four asset archetypes, at the same grid cells,
// so the 3D view and the agent logic stay comparable across cities.

type AoiSpec = {
  slug: string;
  type: AoiType;
  name: string;
  lat: number;
  lng: number;
  exposureNote: string;
  building?: BuildingProfile;
  worksite?: WorksiteProfile;
  careHome?: CareHomeProfile;
  corridor?: CorridorProfile;
};

const GRID_CELL: Record<AoiType, [number, number]> = {
  building: [10, 6],
  worksite: [4, 12],
  care_home: [6, 4],
  corridor: [8, 2],
};

function buildPortfolio(cityId: string, specs: AoiSpec[]): Aoi[] {
  return specs.map((s) => {
    const [gx, gy] = GRID_CELL[s.type];
    return {
      id: `${cityId}:${s.slug}`,
      cityId,
      name: s.name,
      type: s.type,
      lat: s.lat,
      lng: s.lng,
      gx,
      gy,
      exposureNote: s.exposureNote,
      building: s.building,
      worksite: s.worksite,
      careHome: s.careHome,
      corridor: s.corridor,
    };
  });
}

const PORTFOLIOS: Record<string, Aoi[]> = {
  "abu-dhabi": buildPortfolio("abu-dhabi", [
    {
      slug: "al-maryah-tower",
      type: "building",
      name: "Al Maryah Commercial Tower",
      lat: 24.4991,
      lng: 54.3899,
      exposureNote: "Glass curtain wall, west-facing; afternoon solar gain drives an early-evening demand peak.",
      building: { baselineKw: 140, hvacCapacityKw: 260, coolingSetpointF: 73 },
    },
    {
      slug: "mussafah-site",
      type: "worksite",
      name: "Mussafah Infrastructure Site",
      lat: 24.3538,
      lng: 54.5031,
      exposureNote: "Open ground by a water channel — humid air and fresh asphalt hold heat past solar noon.",
      worksite: { crewSize: 34, shiftStartHour: 6, shiftEndHour: 17 },
    },
    {
      slug: "khalidiya-care",
      type: "care_home",
      name: "Khalidiya Elder Care Residence",
      lat: 24.4713,
      lng: 54.3441,
      exposureNote: "Dense low-rise block, limited cross-ventilation; overnight temperatures stay elevated.",
      careHome: { residents: 82, vulnerableResidents: 23, nearestCoolingCenter: "Khalidiya Mall community hall (600 m)" },
    },
    {
      slug: "corniche-corridor",
      type: "corridor",
      name: "Corniche Transit Corridor",
      lat: 24.4764,
      lng: 54.3305,
      exposureNote: "Waterfront walkway between two stops; shade and sea breeze vary sharply along its length.",
      corridor: { fromName: "Corniche West stop", toName: "Marina Mall stop", walkMinutes: 14 },
    },
  ]),

  dubai: buildPortfolio("dubai", [
    {
      slug: "marina-tower",
      type: "building",
      name: "Dubai Marina Office Tower",
      lat: 25.0805,
      lng: 55.1403,
      exposureNote: "44-storey tower, unshaded south face; lift and plant loads compound the afternoon cooling peak.",
      building: { baselineKw: 210, hvacCapacityKw: 380, coolingSetpointF: 72 },
    },
    {
      slug: "al-quoz-site",
      type: "worksite",
      name: "Al Quoz Logistics Build",
      lat: 25.1421,
      lng: 55.2311,
      exposureNote: "Slab-pour phase on exposed ground; concrete curing adds local humidity to Gulf air.",
      worksite: { crewSize: 52, shiftStartHour: 6, shiftEndHour: 18 },
    },
    {
      slug: "deira-care",
      type: "care_home",
      name: "Deira Assisted-Living Centre",
      lat: 25.2721,
      lng: 55.3247,
      exposureNote: "Old-Deira block with single-aspect rooms; night purge ventilation barely works.",
      careHome: { residents: 96, vulnerableResidents: 31, nearestCoolingCenter: "Al Ghurair Centre atrium (450 m)" },
    },
    {
      slug: "jumeirah-corridor",
      type: "corridor",
      name: "Jumeirah Beach Walk Corridor",
      lat: 25.2048,
      lng: 55.2381,
      exposureNote: "Boardwalk with intermittent palm shade; surface and reflected heat spike between canopies.",
      corridor: { fromName: "JBR tram stop", toName: "The Beach retail entrance", walkMinutes: 12 },
    },
  ]),

  phoenix: buildPortfolio("phoenix", [
    {
      slug: "downtown-tower",
      type: "building",
      name: "Downtown Phoenix Office Block",
      lat: 33.4515,
      lng: -112.0723,
      exposureNote: "Older curtain wall, minimal external shading; grid peak-demand charges bite hardest 15:00–19:00.",
      building: { baselineKw: 160, hvacCapacityKw: 300, coolingSetpointF: 74 },
    },
    {
      slug: "i10-widening",
      type: "worksite",
      name: "I-10 Widening Segment",
      lat: 33.4102,
      lng: -112.1245,
      exposureNote: "Freeway paving crew on black asphalt; radiant load stays brutal though the air is dry.",
      worksite: { crewSize: 41, shiftStartHour: 5, shiftEndHour: 15 },
    },
    {
      slug: "maryvale-senior",
      type: "care_home",
      name: "Maryvale Senior Residence",
      lat: 33.4967,
      lng: -112.1719,
      exposureNote: "Low-income neighbourhood, sparse tree canopy; heat-island keeps nights 8 °F above outlying areas.",
      careHome: { residents: 74, vulnerableResidents: 27, nearestCoolingCenter: "City-run cooling centre, Maryvale library (900 m)" },
    },
    {
      slug: "valley-metro-corridor",
      type: "corridor",
      name: "Valley Metro Rail Corridor",
      lat: 33.4655,
      lng: -112.0699,
      exposureNote: "Platform-to-platform walk with little shade; reflective hardscape raises exposure between stops.",
      corridor: { fromName: "Van Buren/1st Ave stop", toName: "Roosevelt/Central stop", walkMinutes: 13 },
    },
  ]),

  singapore: buildPortfolio("singapore", [
    {
      slug: "cbd-tower",
      type: "building",
      name: "Raffles Place Office Tower",
      lat: 1.2847,
      lng: 103.8515,
      exposureNote: "Cooling runs near-flat all day; humidity keeps latent load high even when air temp dips.",
      building: { baselineKw: 240, hvacCapacityKw: 400, coolingSetpointF: 73 },
    },
    {
      slug: "tuas-yard",
      type: "worksite",
      name: "Tuas Port Extension Yard",
      lat: 1.2966,
      lng: 103.6361,
      exposureNote: "Reclamation works with no shade; wet-bulb, not air temp, is the binding constraint here.",
      worksite: { crewSize: 63, shiftStartHour: 7, shiftEndHour: 19 },
    },
    {
      slug: "toa-payoh-care",
      type: "care_home",
      name: "Toa Payoh Eldercare Home",
      lat: 1.3327,
      lng: 103.8497,
      exposureNote: "Naturally ventilated wards; when the breeze drops, indoor heat index tracks outdoor within an hour.",
      careHome: { residents: 110, vulnerableResidents: 34, nearestCoolingCenter: "HDB Hub air-conditioned mall (300 m)" },
    },
    {
      slug: "marina-bay-corridor",
      type: "corridor",
      name: "Marina Bay Waterfront Corridor",
      lat: 1.283,
      lng: 103.8607,
      exposureNote: "Open promenade; the sheltered arcade route runs several degrees cooler at midday.",
      corridor: { fromName: "Bayfront MRT exit B", toName: "Marina Bay Sands events hall", walkMinutes: 15 },
    },
  ]),
};

export function getPortfolio(cityId: string): Aoi[] {
  return PORTFOLIOS[cityId] ?? [];
}

export function getAoi(id: string): Aoi | undefined {
  for (const list of Object.values(PORTFOLIOS)) {
    const found = list.find((a) => a.id === id);
    if (found) return found;
  }
  return undefined;
}

export const DEFAULT_CITY_ID = "abu-dhabi";
