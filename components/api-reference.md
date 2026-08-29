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
temperature) + `result.stats_data` (`Temperature_stats` min/max/mean/std,
`Overall_temperature_distribution`, `Normal_temperature_distribution` {x_axis,
y_axis}, `Temperature_frequency` histogram).

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
- `POST /v1/system/fetch-api-key-custom-usage` — usage for a custom date range.

---

## How Heat Sentinel uses it

| Heat Sentinel need | FortyGuard call |
|---|---|
| Per-AOI 24 h heat-index / wet-bulb / apparent / humidity / AQI curve | `POST /v1/env_params`, `filter_type: 3` |
| City heat grid for the 3D map + corridor route search | `POST /v1/heatmap`, `filter_type: 2`, `granularity: 100` |
| Deep context report for a flagged AOI (stretch) | `POST /v1/heat_intelligence`, `analysis: ["environmental","urban","anthropogenic"]` |

All values come back in °C / indices — Heat Sentinel converts to °F internally.
