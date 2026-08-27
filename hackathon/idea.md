# Heat Sentinel — Hackathon Idea

**One line:** Heat doesn't hit a city evenly — Heat Sentinel is an autonomous
agent that watches a portfolio of city assets with hyperlocal temperature
intelligence and acts *before* the peak.

**Tracks (combined):** 06 Agentic AI (primary) · 01 Resilient Cities · 02 Future
Buildings & Energy · 03 Industrial & Enterprise · 04 Government & Environment

**Why it wins:** shows off what makes FortyGuard's API distinctive —
hyperlocal 10 mi² resolution, **wet-bulb temperature** (life-safety threshold,
rare hyperlocally), and the `heat_intelligence` category signals — wrapped in a
real agentic loop with human-in-the-loop dispatch. Legible in a 2-minute video:
map + timeline + decision feed.

---

## The product

A single operations console. The user manages a mixed **portfolio of AOIs**
(areas of interest) pinned on a city map. Each AOI has a type; the agent tailors
its reasoning and its recommended action to that type.

| AOI type | FortyGuard signals | Agent output |
|---|---|---|
| Office / commercial building | `env_params` (heat index), `heatmap` range-of-hours | Pre-cool window + estimated peak-kW shaved (reuses `lib/heatEngine.ts`) |
| Construction / outdoor work site | `env_params` **wet-bulb temperature**, apparent temp | Shift reschedule + mandatory break windows when wet-bulb crosses threshold |
| Elderly care home / shelter | `heat_intelligence` (urban, anthropogenic), AQI | Draft resident heat alert + route to nearest cooling center |
| Bus route / pedestrian corridor | `heatmap` grid | "Coolest corridor" vs shortest path between two stops, with exposure delta |

## The agent loop

```
for each AOI:
  1. fetch signal bundle  (FortyGuard: env_params + heatmap [+ heat_intelligence])
  2. reason               (one structured Claude call)
       -> risk score 0-100
       -> peak window (start/end hour)
       -> typed recommendation for this AOI type
       -> rationale that names the signal that drove it
  3. emit to Action Feed  (human-in-the-loop: Approve / Dismiss)
on Approve:
  draft the artifact (pre-cool schedule / shift plan / alert SMS / route) and
  mark "dispatched" — no real external sending in the MVP
```

## Screens

1. **Map** — city view, AOI pins colored by current risk, click to inspect.
2. **AOI timeline** — 24-48h chart: heat index + wet-bulb (recharts), peak
   window shaded, pre-cool / action window marked.
3. **Action Feed** — chronological list of agent recommendations across all
   AOIs, each with rationale, cited signal, and Approve/Dismiss.
4. **Explain** — click any recommendation to see the raw signal bundle + the
   agent's reasoning trace.

## Honesty

Keep the existing **Live / Mock badge**. Mock mode extends the current seeded
deterministic generator to cover `env_params` and `heatmap`. Live mode uses real
FortyGuard credentials and the async submit → poll `GET /v1/status/{activity_id}`
→ download flow (see `api-release-notes.md` — note the endpoint is
`/v1/heat_intelligence` with an `api-key` header, and it's asynchronous).

---

## 3-day MVP scope (deadline Aug 30, 23:59 GST)

**Ship:**
- Map + **4 preset AOIs** (one of each type), no add/remove AOI UI needed.
- Mock lib extended for `env_params` + `heatmap`; live mode best-effort.
- Agent = **single Claude call per AOI** with structured JSON output (not a
  multi-step tool-using loop).
- Action Feed with Approve → drafts artifact + marks dispatched.
- One timeline chart component reused across AOI types.

**Cut if slipping:** drop to 2 AOI types (building pre-cool + construction
wet-bulb). Drop the cool-route AOI first (most infra).

**Explicitly out of scope:** real SMS/email dispatch, real street-graph routing
(grid-based corridor only), user auth, persistence beyond in-memory.

## Demo script (2 min)

1. "Same city, 3pm. These two sites are 500m apart." — show heatmap, materially
   different risk. (Hyperlocal.)
2. Construction site: wet-bulb crosses 31°C at 14:00 → agent recommends moving
   the crew's afternoon block to 06:00-10:00. Approve → shift plan drafted.
   (UAE has a legal summer midday work ban — this is real.)
3. Office next door: agent finds the 17:00 demand peak, recommends pre-cool from
   14:00, estimates 12% peak-kW shaved. Approve → schedule drafted.
4. Care home: agent drafts a resident alert + cooling-center route.
5. Action Feed: "one agent, one city, four decisions, before the heat landed."
