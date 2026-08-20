# Building Heat-Risk Copilot

Predicts hourly cooling-load risk for a building from hyperlocal temperature data, and recommends a pre-cooling window to shave the predicted peak demand — built for the [FortyGuard Hackathon'26](https://www.fortyguard.com/hackathon26).

**Challenge tracks:** Future Buildings & Energy, Agentic AI.

## The problem

Buildings get surprised by heat-driven demand spikes: HVAC systems react to temperature after it's already climbed, so peak electrical draw lands right when grids and budgets are most stressed. Hyperlocal temperature forecasts make it possible to see the spike coming and pre-cool *before* it hits, flattening the peak.

## How it works

1. **`lib/fortyguard.ts`** — a pluggable client for FortyGuard's Temperature API (`POST /v1/heat-intelligence`). It fetches an hourly temperature curve for a location.
2. **`lib/heatEngine.ts`** — a deterministic degree-hour heuristic (`load = baseline + k × max(0, temp − setpoint)`) that turns the temperature curve into a predicted hourly cooling-load curve, finds the peak hour, and recommends a pre-cool start time (peak hour minus a lead window) with an estimated peak reduction.
3. **`app/api/heat-risk/route.ts`** — validates a building profile (baseline kW, HVAC capacity, cooling setpoint) and location, runs the pipeline above, returns the hourly curve and recommendation as JSON.
4. **`app/page.tsx`** — a form for the building profile, and a chart (temperature + predicted load, `recharts`) with the recommended pre-cool window highlighted.

This is intentionally a simple, explainable physical heuristic — not a calibrated thermal simulation. The constant and lead-time assumptions are documented as comments in `lib/heatEngine.ts`.

## Live vs. mock data

The hackathon only publishes credentials-gated access to the real Temperature API, so this app ships with **both modes**, and is honest about which one is active:

- **Live mode** — set `FORTYGUARD_API_KEY` and `FORTYGUARD_API_BASE_URL` (see `.env.example`) and the app calls the real `POST /v1/heat-intelligence` endpoint.
- **Mock mode** (default, no keys needed) — a seeded, deterministic daily temperature curve (afternoon peak, location-derived baseline) so the app is fully demoable right now.

The UI always shows a **"Live" / "Mock" badge** on the results so it's never ambiguous which one produced a given prediction.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env.local` and fill in real FortyGuard credentials to switch to live mode.

## Hackathon docs

Timeline, submission process, and rules for this hackathon are in [`hackathon/`](./hackathon).
