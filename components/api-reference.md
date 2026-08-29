# FortyGuard Temperature API® — Reference (extracted)

Source: https://docs-api.fortyguard.com/docs/introduction (v1.0.0)

## Basics

- **Base URL:** `https://api.fortyguard.com`
- **Auth:** header `api-key: YOUR_API_KEY` on every request (plus
  `Content-Type: application/json`). No OAuth, no token exchange.
- **Everything is asynchronous.** Every `POST` returns an `activity_id`; you poll
  `GET /v1/status/{activity_id}` until `status` is `Completed` or `Failed`.

### Submit response (all endpoints)

```json
{ "error": false, "status_code": 200, "message": "... Submitted Successfully",
  "data": { "activity_id": "f501e334-572b-40c4-8eb9-c9b679eff6ee" } }
```

### Status response

```json
{ "error": false, "status_code": 200, "message": "Completed",
  "data": { "activity_id": "UUID", "status": "Completed", "result": { ... } } }
```

`status` ∈ `Processing` | `Completed` | `Failed`. Poll every ~5 s, bounded
(~120 tries). For Heat Intelligence, `result.download_link` is a temporary
signed URL — fetch it immediately, do not log it.

---

## `POST /v1/env_params` — Environmental Parameters

Used by Heat Sentinel for the per-AOI hourly signal bundle.

**Request**

```json
{
  "latitude": 40.7128,
  "longitude": -74.0060,
  "temperature": 32.5,
  "date_time": { "start_date": "2024-07-15", "start_time": "14:00", "filter_type": 1 }
}
```

- `temperature` — seed air temperature (**°C** in this endpoint's example).
- `filter_type`: `1` single hour · `2` range same day (needs `end_time`) ·
  `3` single day 00:00–23:59 · `4` range of days (≤ 1 month, needs `end_date`).
  **For a 24 h curve use `filter_type: 3`.**

**Result** (`data.result`)

```
metadata.timezone, metadata.timezone_offset_hours
metadata.time_range { start, end, interval, count }
metadata.timestamps: [ ISO8601, ... ]
locations[0]: { lat, lon, elevation, temperature,
  parameters: {              // time-aligned arrays, all °C / index / ppb / ppm
    heat_index_celsius: [],
    apparent_temperature_celsius: [],
    relative_humidity_percent: [],
    precipitation_mm: [],
    cloud_cover_octas: [],
    wet_bulb_temperature_celsius: [],
    "air_quality:idx": [],
    "air_quality_pm2p5:idx": [], "air_quality_pm10:idx": [], "air_quality_no2:idx": [],
    aqi_us_co: [], "air_quality_o3:idx": [], "air_quality_so2:idx": [],
    methane_ppb: [], co2_ppm: []
  },
  solar_irradiance: { clear_sky: { ghi, dni, dhi }, description } }
```

Missing values → JSON `null` (legacy stored responses may use `-999`). `null` ≠ 0.

### Verified against the live API (2026-08-29)

- Works for every location tried, including Abu Dhabi; completes in ~5–10 s.
- Real payload matches the schema above:
  `result.locations[0].parameters.<name>` are 24-long arrays,
  `result.metadata.timestamps` are ISO strings carrying the city's UTC offset
  (e.g. `2026-08-29T14:00:00+04:00`) — parse the local hour from the string.
- **There is no raw air-temperature array**, and `heat_index_celsius` runs away
  under hot + humid conditions (values like 74–80 °C at night). Heat Sentinel
  derives dry-bulb from `apparent_temperature_celsius` and recomputes the heat
  index itself with the NWS 137 °F cap.

---

## `POST /v1/heatmap` — Heatmap Generation

**Request** (Single Hour shown; use `filter_type: 2` + `end_time` for Range of Hours)

```json
{
  "polygon_aoi": {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature", "properties": {},
      "geometry": { "type": "Polygon", "coordinates": [[
        [-74.0170,40.7050],[-74.0030,40.7050],[-74.0030,40.7180],
        [-74.0170,40.7180],[-74.0170,40.7050]
      ]]}
    }]
  },
  "date_time": { "start_date": "2024-07-15", "start_time": "14:00", "filter_type": 1 },
  "granularity": 100
}
```

- `granularity`: `60` | `80` | `100` (metres). Area caps: 10 mi² (Basic) / 50 mi² (Premium).

**Result:** `result.map_data` (GeoJSON FeatureCollection of tile polygons with
temperature) + `result.stats_data` (`temperature_stats` min/max/mean/std,
`overall_temperature_distribution`, `normal_temperature_distribution` {x_axis,
y_axis}, `temperature_frequency` histogram).

### Verified against the live API (2026-08-29)

- Takes ~40 s to complete. Each tile:
  `{ properties: { tile_id, average_temperature, min_temperature, max_temperature }, geometry: Polygon }`
  — temperatures in °C.
- **Gridded coverage is currently US-only.** A ~3 km polygon returned:
  Phoenix 1209 tiles, New York 150 tiles; Abu Dhabi / Dubai / Singapore returned
  an empty `map_data.features: []` and `stats_data: { activity_id, n_cells: 0 }`.
- Spatial spread at 100 m granularity for a single hour is small (≈ 0.2 °C across
  3 km in Phoenix at 14:00) — useful for absolute level, less so for
  within-neighbourhood routing at that timestamp.
- Heat Sentinel therefore drives its per-city assessment from `env_params`
  (global coverage) and keeps a modeled local grid for the 3D view and the
  corridor route search.

---

## `POST /v1/heat_intelligence` — Heat Intelligence Report

```json
{ "latitude": 40.7128, "longitude": -74.0060, "temperature": 82.4,
  "date": "2024-07-15", "analysis": ["environmental"] }
```

`analysis` categories: geographic, environmental, urban, events, anthropogenic.
Completed status returns `data.result.download_link` → a **PDF** (temporary URL).
Generation can take several minutes. Not a programmatic data feed.

---

## `POST /v1/satellite` — Satellite View Segmentation

```json
{ "sat": { "latitude": 41.8463, "longitude": -87.7433 },
  "date_time": { "start_date": "2024-07-15", "start_time": "14:00", "filter_type": 1 },
  "granularity": 80 }
```

Result: `result.orignal_image` (Base64), `result.image_year`,
`result.segmentation` { image_dimensions, per-class coverage }.

---

## `POST /v1/streetview` — Street View Segmentation

```json
{ "latitude": 40.7128, "longitude": -74.0060,
  "vertical_angle": 10.0, "horizontal_angle": 90.0, "back_view": false }
```

Result: `result.front` { original_image, segments, image_legend,
segmented_image, image_date } (+ `result.back` when `back_view: true`).

---

## System

- `GET /v1/status/{activity_id}` — unified status / result retrieval.
- `POST /v1/system/fetch-api-key-usage` — usage for the current billing cycle.
  **Body must include `{ "api_key": "…" }`** (the header alone gives a 422);
  returns `plan_details`, `credit_summary`, and an `activity_breakdown` array of
  `{ name, credits, count, percentage }` per activity type.
- `POST /v1/system/fetch-api-key-custom-usage` — custom date range
  (`{ api_key, start_date, end_date }`).

---

## How Heat Sentinel uses it

| Heat Sentinel need | FortyGuard call | Status |
|---|---|---|
| Per-AOI 24 h curve: heat index, wet-bulb, apparent temp, humidity, AQI, PM2.5, cloud, CO₂, solar irradiance | `POST /v1/env_params`, `filter_type: 3` | **in use** — global coverage |
| Real gridded heat map (would replace the modeled local grid) | `POST /v1/heatmap`, `granularity: 100` | validated; gridded coverage US-only for now, so not on the live path |
| Deep context report for a flagged AOI | `POST /v1/heat_intelligence`, `analysis: ["environmental","urban","anthropogenic"]` | future — returns a PDF, not structured data |

All values come back in °C / indices — Heat Sentinel converts to °F internally.
