# Heat Sentinel

An autonomous agent that watches a city's assets with hyperlocal temperature
intelligence and acts *before* the heat peak hits — built for the
[FortyGuard Hackathon'26](https://www.fortyguard.com/hackathon26).

**Primary track:** Agentic AI. **Also spanning:** Resilient Cities & Infrastructure ·
Future Buildings & Energy · Industrial & Enterprise · Government & Environment.

## The problem

Heat doesn't hit a city evenly. Two sites 500 m apart — measured at 2 m above
ground, at 10 mi² resolution — can face materially different risk over the same
afternoon. Yet the systems that respond to heat (building HVAC, work-crew
schedules, public-health alerts) react *after* temperature has already climbed,
which is exactly when grids, budgets, and bodies are most stressed.

Hyperlocal temperature forecasting makes the spike visible hours ahead. Heat
Sentinel turns that foresight into decisions.

## How it works

Heat Sentinel manages a **portfolio of AOIs** (areas of interest) pinned on a
city map. Pick a city — Abu Dhabi, Dubai, Phoenix, or Singapore — and the agent
assesses its four assets. Each AOI has a type, and the agent tailors both its
reasoning and its recommended action to that type.

| AOI type | FortyGuard signals it leans on | Agent output |
|---|---|---|
| Commercial building | heat index, apparent temperature, solar irradiance (GHI) | Pre-cool window + estimated peak-kW shaved |
| Outdoor work site | **wet-bulb temperature**, apparent temperature | Shift reschedule + mandatory break windows when wet-bulb crosses the safe-work threshold |
| Elderly care home | overnight temperature recovery, **PM2.5 sub-index**, AQI | Draft resident heat advisory + route to the nearest cooling centre |
| Transit corridor | local heat grid | Coolest-corridor vs shortest path, with exposure delta |

### The agent loop

```
for each AOI:
  1. fetch signal bundle   — FortyGuard env_params: heat index, wet-bulb,
                             apparent temp, humidity, AQI, PM2.5, cloud cover,
                             solar irradiance, CO₂ — 24 hourly steps
  2. reason                — one structured Claude call
        → risk score 0–100
        → peak window (start / end hour)
        → typed recommendation for this AOI type
        → rationale naming the signal that drove it
  3. emit to Action Feed   — human-in-the-loop: Approve / Dismiss
on Approve:
  draft the artifact (pre-cool schedule / shift plan / advisory / route) and
  mark it dispatched
```

## FortyGuard Temperature API

The app calls the real async Temperature API (`https://api.fortyguard.com`,
`api-key` header):

- **`POST /v1/env_params`** (`filter_type: 3`) — one submission per AOI returns a
  24-hour curve of heat index, wet-bulb, apparent temperature, humidity, the AQI
  and PM2.5 sub-indices, cloud cover, CO₂, and clear-sky solar irradiance
  (GHI / DNI / DHI).
- **`GET /v1/status/{activity_id}`** — polled until the activity completes; all
  values are returned in °C / indices and converted to °F internally.

The extracted API contract and release notes are in
[`components/api-reference.md`](./components/api-reference.md) and
[`components/api-release-notes.md`](./components/api-release-notes.md).

## Architecture

1. **`lib/aoi.ts`** — the cities and their asset portfolios; each city carries a
   climate profile.
2. **`lib/fortyguard.ts`** — the Temperature API client. Submits `env_params` per
   AOI, polls for the result, and normalises it into an hourly `SignalBundle`
   (plus a local heat grid around the asset for the 3D view and the corridor
   route search).
3. **`lib/heatEngine.ts`** — a deterministic degree-hour heuristic
   (`load = baseline + k × max(0, temp − setpoint)`) that turns the temperature
   curve into a predicted cooling-load curve and a pre-cool recommendation.
   Constants and assumptions are documented inline; this is an explainable
   physical heuristic, not a calibrated thermal simulation.
4. **`lib/agent.ts`** — the reasoning layer. Given an AOI and its signal bundle,
   it computes a structured `Assessment` (risk score, peak window, typed
   recommendation) and Claude writes the human-facing headline, rationale, and
   ready-to-send draft, citing the exact signal and hour that drove the call
   (`ANTHROPIC_API_KEY`).
5. **`lib/route.ts`** — the corridor coolest-path search (Dijkstra over the heat
   grid).
6. **`app/api/assess/route.ts`** — runs the pipeline over a city's portfolio and
   returns the assessments plus a composed city heat grid as JSON.
7. **`app/page.tsx`** — the operations console: a 3D deck.gl heat map of the
   portfolio, a per-AOI heat-index / wet-bulb timeline, a signal readout, and the
   Action Feed.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to
`.env.local` and set:

```
FORTYGUARD_API_KEY=…       # required
ANTHROPIC_API_KEY=…        # for the Claude-written rationales and drafts
```

## Tech stack

FortyGuard Temperature API® · Next.js / React / TypeScript · Claude (agent
reasoning) · deck.gl (3D heat map) · Recharts (timelines).
