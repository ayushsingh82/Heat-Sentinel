/**
 * The portfolio of city assets Heat Sentinel watches. Each AOI (area of
 * interest) has a type; the agent tailors its reasoning and its recommended
 * action to that type.
 *
 * Coordinates are around Abu Dhabi — FortyGuard's home city and a place where
 * summer heat is a daily operational and legal constraint (the UAE enforces a
 * midday outdoor-work ban from mid-June to mid-September).
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
  name: string;
  type: AoiType;
  lat: number;
  lng: number;
  /** Cell on the map's heat grid (0..GRID_SIZE-1). Drives the 3D view. */
  gx: number;
  gy: number;
  /** A one-line "why this site is exposed" note shown in the UI. */
  exposureNote: string;
  building?: BuildingProfile;
  worksite?: WorksiteProfile;
  careHome?: CareHomeProfile;
  corridor?: CorridorProfile;
};

export const GRID_SIZE = 16;

export const AOI_TYPE_LABEL: Record<AoiType, string> = {
  building: "Commercial building",
  worksite: "Outdoor work site",
  care_home: "Elderly care home",
  corridor: "Transit corridor",
};

export const PORTFOLIO: Aoi[] = [
  {
    id: "al-maryah-tower",
    name: "Al Maryah Commercial Tower",
    type: "building",
    lat: 24.4991,
    lng: 54.3899,
    gx: 10,
    gy: 6,
    exposureNote: "Glass curtain wall, west-facing; afternoon solar gain drives an early-evening demand peak.",
    building: { baselineKw: 140, hvacCapacityKw: 260, coolingSetpointF: 73 },
  },
  {
    id: "mussafah-site",
    name: "Mussafah Infrastructure Site",
    type: "worksite",
    lat: 24.3538,
    lng: 54.5031,
    gx: 4,
    gy: 12,
    exposureNote: "Open ground, fresh asphalt and no shade — surface radiates heat well past solar noon.",
    worksite: { crewSize: 34, shiftStartHour: 6, shiftEndHour: 17 },
  },
  {
    id: "khalidiya-care",
    name: "Khalidiya Elder Care Residence",
    type: "care_home",
    lat: 24.4713,
    lng: 54.3441,
    gx: 6,
    gy: 4,
    exposureNote: "Dense low-rise block, limited cross-ventilation; overnight temperatures stay elevated.",
    careHome: { residents: 82, vulnerableResidents: 23, nearestCoolingCenter: "Khalidiya Mall community hall (600 m)" },
  },
  {
    id: "corniche-corridor",
    name: "Corniche Transit Corridor",
    type: "corridor",
    lat: 24.4764,
    lng: 54.3305,
    gx: 8,
    gy: 2,
    exposureNote: "Waterfront walkway between two stops; shade and sea breeze vary sharply along its length.",
    corridor: { fromName: "Corniche West stop", toName: "Marina Mall stop", walkMinutes: 14 },
  },
];

export function getAoi(id: string): Aoi | undefined {
  return PORTFOLIO.find((a) => a.id === id);
}
