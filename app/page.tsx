"use client";

import { useState, type FormEvent } from "react";
import {
  Bar,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

type HourlyLoad = {
  hour: number;
  tempF: number;
  predictedLoadKw: number;
};

type ApiResult = {
  source: "live" | "mock";
  hourly: HourlyLoad[];
  peakHour: number;
  peakLoadKw: number;
  recommendation: {
    startHour: number;
    peakHour: number;
    peakLoadKw: number;
    estimatedPeakReductionPct: number;
  };
};

function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

export default function Home() {
  const [location, setLocation] = useState("Phoenix, AZ");
  const [baselineKw, setBaselineKw] = useState(120);
  const [hvacCapacityKw, setHvacCapacityKw] = useState(80);
  const [coolingSetpointF, setCoolingSetpointF] = useState(72);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/heat-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location, baselineKw, hvacCapacityKw, coolingSetpointF }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResult(data);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  const chartData =
    result?.hourly.map((h) => ({
      label: formatHour(h.hour),
      tempF: h.tempF,
      loadKw: h.predictedLoadKw,
    })) ?? [];

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 px-6 py-16 sm:px-12">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Building Heat-Risk Copilot
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Predicts hourly cooling-load risk from hyperlocal temperature data and
            recommends a pre-cooling window to shave peak demand.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-4 rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950 sm:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Location</span>
            <input
              className="rounded-md border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Phoenix, AZ"
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Baseline load (kW)</span>
            <input
              type="number"
              min={0}
              className="rounded-md border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
              value={baselineKw}
              onChange={(e) => setBaselineKw(Number(e.target.value))}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">HVAC capacity (kW)</span>
            <input
              type="number"
              min={0}
              className="rounded-md border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
              value={hvacCapacityKw}
              onChange={(e) => setHvacCapacityKw(Number(e.target.value))}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">Cooling setpoint (°F)</span>
            <input
              type="number"
              className="rounded-md border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
              value={coolingSetpointF}
              onChange={(e) => setCoolingSetpointF(Number(e.target.value))}
              required
            />
          </label>

          <div className="flex items-end sm:col-span-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-foreground px-5 py-2.5 font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
            >
              {loading ? "Predicting..." : "Predict heat risk"}
            </button>
          </div>
        </form>

        {error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {result && (
          <section className="flex flex-col gap-6">
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`rounded-full px-3 py-1 font-medium ${
                  result.source === "live"
                    ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                }`}
              >
                {result.source === "live" ? "Live FortyGuard data" : "Mock data (no API key configured)"}
              </span>
            </div>

            <div className="h-72 w-full rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" fontSize={12} />
                  <YAxis yAxisId="temp" orientation="left" fontSize={12} unit="°F" />
                  <YAxis yAxisId="load" orientation="right" fontSize={12} unit="kW" />
                  <Tooltip />
                  <Legend />
                  <ReferenceArea
                    yAxisId="load"
                    x1={formatHour(result.recommendation.startHour)}
                    x2={formatHour(result.recommendation.peakHour)}
                    fill="#0ea5e9"
                    fillOpacity={0.15}
                  />
                  <Bar yAxisId="load" dataKey="loadKw" name="Predicted load (kW)" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="temp" type="monotone" dataKey="tempF" name="Temp (°F)" stroke="#f97316" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border border-sky-300 bg-sky-50 p-5 text-sm dark:border-sky-900 dark:bg-sky-950">
              <p className="font-medium text-sky-900 dark:text-sky-200">
                Recommendation: start pre-cooling at {formatHour(result.recommendation.startHour)}
              </p>
              <p className="mt-1 text-sky-800 dark:text-sky-300">
                Predicted peak of {result.peakLoadKw} kW at {formatHour(result.peakHour)}. Pre-cooling
                ahead of the peak is estimated to shave it by{" "}
                <strong>{result.recommendation.estimatedPeakReductionPct}%</strong>.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
