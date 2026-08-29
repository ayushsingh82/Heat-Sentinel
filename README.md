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
city map. Each AOI has a type, and the agent tailors both its reasoning and its
recommended action to that type.

| AOI type | FortyGuard signals | Agent output |
|---|---|---|
| Office / commercial building | `env_params` (heat index), hourly heatmap | Pre-cool window + estimated peak-kW shaved |
| Construction / outdoor work site | `env_params` **wet-bulb temperature**, apparent temp | Shift reschedule + mandatory break windows when wet-bulb crosses the safe-work threshold |
| Elderly care home / shelter | `heat_intelligence` (urban, anthropogenic), AQI | Draft resident heat alert + route to nearest cooling center |
| Transit corridor / walkway | hourly heatmap grid | Coolest-corridor vs shortest path, with exposure delta |

### The agent loop

```
for each AOI:
  1. fetch signal bundle   — FortyGuard: env_params + heatmap [+ heat_intelligence]
  2. reason                — one structured Claude call
        → risk score 0–100
        → peak window (start / end hour)
        → typed recommendation for this AOI type
        → rationale naming the signal that drove it
  3. emit to Action Feed   — human-in-the-loop: Approve / Dismiss
on Approve:
  draft the artifact (pre-cool schedule / shift plan / alert / route) and
  mark it dispatched  (no real external sending in this build)
```

## Architecture

1. **`lib/fortyguard.ts`** — pluggable client for FortyGuard's Temperature API.
   Fetches an hourly **signal bundle** per AOI (`env_params`: heat index,
   wet-bulb, apparent temperature, humidity, AQI; plus a local heatmap grid).
2. **`lib/heatEngine.ts`** — deterministic degree-hour heuristic
   (`load = baseline + k × max(0, temp − setpoint)`) that turns the temperature
   curve into a predicted cooling-load curve and a pre-cool recommendation.
   Constants and assumptions are documented inline; this is an explainable
   physical heuristic, not a calibrated thermal simulation.
3. **`lib/agent.ts`** — the reasoning layer. Given an AOI and its signal bundle,
   produces a structured `Assessment` (risk score, peak window, typed
   recommendation, cited rationale). Uses Claude when `ANTHROPIC_API_KEY` is set;
   falls back to a deterministic rule-based assessor otherwise.
4. **`app/api/assess/route.ts`** — runs the pipeline over the AOI portfolio and
   returns the assessments as JSON.
5. **`app/page.tsx`** — the operations console: a 3D heat map of the portfolio,
   a per-AOI heat-index / wet-bulb timeline, and the Action Feed.

## Live vs. mock data

The hackathon only publishes credentials-gated access to the real Temperature
API, so this app ships with **both modes** and is honest about which is active:

- **Live mode** — set `FORTYGUARD_API_KEY` and `FORTYGUARD_API_BASE_URL`
  (see `.env.example`) and the app calls the real async
  `POST /v1/heat_intelligence` / `POST /v1/env_params` endpoints, polling
  `GET /v1/status/{activity_id}` for results.
- **Mock mode** (default) — a seeded, deterministic daily curve per AOI
  (afternoon peak, location-derived baseline) so the app is fully demoable with
  no credentials.

Likewise the agent runs on **Claude** when `ANTHROPIC_API_KEY` is set, and on a
deterministic rule-based assessor otherwise.

The UI always shows a **Live / Mock badge** (for both the data and the agent) so
it is never ambiguous what produced a given recommendation.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to
`.env.local` and fill in credentials to switch either subsystem to live mode.

## Tech stack

FortyGuard Temperature API® · Next.js / React / TypeScript · Claude (agent
reasoning) · deck.gl (3D heat map) · Recharts (timelines).

## API reference

The extracted FortyGuard Temperature API contract and release notes are in
[`components/api-reference.md`](./components/api-reference.md) and
[`components/api-release-notes.md`](./components/api-release-notes.md).
