# FortyGuard Temperature API® — Release Notes

Source: FortyGuard API docs — Release Notes page.

A running log of every change to FortyGuard's Temperature API® and its
documentation. Entries are listed most-recent first and grouped by the type of
change (Added / Updated / Deprecated). Major version upgrades and breaking
changes are announced here in advance.

---

## v1.0.0 — Latest

**April 22, 2026 · Initial Public Release**

First general-availability release of the FortyGuard Enterprise API. Introduces
the core Temperature API® surface, two subscription plans, credit tracking, and
complete documentation for every supported endpoint.

### Added

#### Endpoints

| Method & path | Description |
|---|---|
| `POST /v1/heatmap` | Generate high-resolution GeoJSON thermal maps for a polygon AOI across **Single Hour**, **Range of Hours**, and **Single Day** filters at granularity **60m / 80m / 100m**. |
| `POST /v1/satellite` | Tile-based satellite view segmentation with Base64-encoded imagery and per-class coverage metrics. |
| `POST /v1/streetview` | Ground-level street view segmentation including front (and optional back) view with per-class coverage metrics. |
| `POST /v1/heat_intelligence` | Multi-dimensional Heat Intelligence Reports across **Geographic, Environmental, Urban, Events, and Anthropogenic** categories, delivered through a temporary `download_link` returned by the completed status response. |
| `POST /v1/env_params` | Environmental Parameters: heat index, apparent temperature, wet bulb temperature, relative humidity, AQI (PM2.5 / PM10 / NO₂ / CO / O₃ / SO₂), methane, CO₂, and solar irradiance (GHI / DNI / DHI). |
| `GET /v1/status/{activity_id}` | Unified status and result-retrieval endpoint for all asynchronous submissions. |
| `POST /v1/system/fetch-api-key-usage` | Credit usage reporting at billing-cycle granularity. |
| `POST /v1/system/fetch-api-key-custom-usage` | Credit usage reporting for a custom date range. |

#### Authentication

- API key authentication via the `api-key` request header — no OAuth or token
  exchange required.

### Plans & Access Control

| | **API Basic** | **API Premium** |
|---|---|---|
| Monthly credits | 1,000,000 | 5,000,000 |
| License | Commercial | Commercial |
| Heatmap area limit | up to 10 mi² | up to 50 mi² |
| Map Statistics | Full | Full |
| Environmental parameters | Up to 3 customizable per request | Full Environmental Parameters |
| Satellite Segmentation | — | ✓ |
| Street View Segmentation | — | ✓ |
| Heat Intelligence | — | ✓ |
| Temperature Property API | — | ✓ |

- Per-endpoint plan availability badges and an in-page availability banner on
  every endpoint, so subscribers can see at a glance what each plan unlocks.

### Documentation

- **Quickstart** guide covering authentication, request submission, and
  activity-status polling with a runnable Python example.
- **Known Limitations** page documenting plan limits, input constraints, rate
  limits, processing behavior, and regional coverage.
- **Release Notes** page (this page) tracking every API and documentation change.
- **Credit Usage Tracker** — enter your API key to view your plan, remaining
  credits, activity breakdown, and custom date-range usage.

---

## Notes for this project

- This repo's `lib/fortyguard.ts` currently targets `POST /v1/heat-intelligence`
  with `Authorization: Bearer` — the real API uses `POST /v1/heat_intelligence`
  (underscore) with an `api-key` header, and is **asynchronous**: submit →
  receive `activity_id` → poll `GET /v1/status/{activity_id}` → download from
  `download_link`.
- Hourly temperature curves are not a documented response shape. The closest
  fits for "hourly temperature" are `POST /v1/heatmap` (Range of Hours filter)
  and `POST /v1/env_params`.
- Heat Intelligence and the Temperature Property API require the **API Premium**
  plan.
