"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { AssessResponse } from "@/app/api/assess/route";
import type { Assessment } from "@/lib/agent";
import SignalTimeline from "@/components/SignalTimeline";
import { fmtHour, fmtHourRange, RECOMMENDATION_ICON, RISK_COLOR } from "@/lib/format";

const CityHeatMap = dynamic(() => import("@/components/CityHeatMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-zinc-600">
      Loading city heat model…
    </div>
  ),
});

type ApprovalState = "pending" | "approved" | "dismissed";

export default function Console() {
  const [data, setData] = useState<AssessResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cityId, setCityId] = useState("abu-dhabi");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<Record<string, ApprovalState>>({});
  const [openDraft, setOpenDraft] = useState<string | null>(null);

  const runAssessment = useCallback(async (targetCity: string, keepSelection: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId: targetCity }),
      });
      const json = (await res.json()) as AssessResponse;
      if (!res.ok) throw new Error("assessment failed");
      setData(json);
      setSelectedId((cur) =>
        keepSelection && cur ? cur : json.assessments[0]?.aoiId ?? null,
      );
      setApprovals(
        Object.fromEntries(json.assessments.map((a) => [a.aoiId, "pending" as ApprovalState])),
      );
    } catch {
      setError("Could not run the assessment. Check the server logs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runAssessment(cityId, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeCity(next: string) {
    setCityId(next);
    setSelectedId(null);
    runAssessment(next, false);
  }

  const selected = useMemo(
    () => data?.assessments.find((a) => a.aoiId === selectedId) ?? null,
    [data, selectedId],
  );

  const pendingCount = Object.values(approvals).filter((s) => s === "pending").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 lg:px-6">
        <Header
          data={data}
          loading={loading}
          pendingCount={pendingCount}
          cityId={cityId}
          onCityChange={changeCity}
          onRun={() => runAssessment(cityId, true)}
        />

        {error && (
          <p className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <section className="relative h-[52vh] min-h-[380px] overflow-hidden rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 lg:h-[62vh]">
            <CityHeatMap
              cityGrid={data?.cityGrid ?? null}
              assessments={data?.assessments ?? []}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </section>

          <section className="flex flex-col gap-2.5 lg:h-[62vh] lg:overflow-y-auto lg:pr-1">
            <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Action feed · {data?.assessments.length ?? 0} assets
            </h2>
            {(data?.assessments ?? []).map((a) => (
              <FeedCard
                key={a.aoiId}
                assessment={a}
                selected={a.aoiId === selectedId}
                approval={approvals[a.aoiId] ?? "pending"}
                onSelect={() => setSelectedId(a.aoiId)}
                onApprove={() =>
                  setApprovals((s) => ({ ...s, [a.aoiId]: "approved" }))
                }
                onDismiss={() =>
                  setApprovals((s) => ({ ...s, [a.aoiId]: "dismissed" }))
                }
                onToggleDraft={() =>
                  setOpenDraft((cur) => (cur === a.aoiId ? null : a.aoiId))
                }
                draftOpen={openDraft === a.aoiId}
              />
            ))}
            {!data && !loading && (
              <p className="px-1 text-sm text-zinc-600">No assessment yet.</p>
            )}
          </section>
        </div>

        {selected && <DetailPanel assessment={selected} approval={approvals[selected.aoiId] ?? "pending"} />}

        <footer className="mt-2 px-1 text-[11px] text-zinc-600">
          Heat Sentinel · FortyGuard Hackathon&rsquo;26 · Data:{" "}
          {data?.dataSource ?? "—"} · Agent: {data?.agentSource ?? "—"} ·{" "}
          {data ? new Date(data.generatedAt).toLocaleTimeString() : ""}
        </footer>
      </div>
    </div>
  );
}

function Header({
  data,
  loading,
  pendingCount,
  cityId,
  onCityChange,
  onRun,
}: {
  data: AssessResponse | null;
  loading: boolean;
  pendingCount: number;
  cityId: string;
  onCityChange: (id: string) => void;
  onRun: () => void;
}) {
  const cities = data?.cities ?? [];
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-red-600 text-lg">
          ▲
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Heat Sentinel</h1>
          <p className="text-xs text-zinc-500">
            Autonomous heat-response console
            {data?.city ? ` · ${data.city.name}, ${data.city.country}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={cityId}
          onChange={(e) => onCityChange(e.target.value)}
          disabled={loading || cities.length === 0}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-zinc-500 disabled:opacity-50"
        >
          {(cities.length ? cities : [{ id: cityId, name: "Abu Dhabi" }]).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Badge
          tone={data?.dataSource === "live" ? "live" : "mock"}
          label={
            data
              ? data.dataSource === "live"
                ? "Live FortyGuard data"
                : data.dataSource === "mixed"
                  ? "Mixed data"
                  : "Mock data"
              : "—"
          }
        />
        <Badge
          tone={data?.agentSource === "claude" ? "live" : "mock"}
          label={
            data
              ? data.agentSource === "claude"
                ? "Claude agent"
                : data.agentSource === "mixed"
                  ? "Mixed agent"
                  : "Rule-based agent"
              : "—"
          }
        />
        {pendingCount > 0 && (
          <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
            {pendingCount} pending
          </span>
        )}
        <button
          onClick={onRun}
          disabled={loading}
          className="rounded-full bg-zinc-100 px-4 py-1.5 text-sm font-medium text-zinc-900 transition hover:bg-white disabled:opacity-50"
        >
          {loading ? "Assessing…" : "Re-run assessment"}
        </button>
      </div>
    </header>
  );
}

function Badge({ tone, label }: { tone: "live" | "mock"; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        tone === "live"
          ? "bg-emerald-950 text-emerald-300 ring-1 ring-emerald-800"
          : "bg-amber-950 text-amber-300 ring-1 ring-amber-800"
      }`}
    >
      {label}
    </span>
  );
}

function RiskDot({ label }: { label: Assessment["riskLabel"] }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: RISK_COLOR[label].fg }}
    />
  );
}

function FeedCard({
  assessment,
  selected,
  approval,
  onSelect,
  onApprove,
  onDismiss,
  onToggleDraft,
  draftOpen,
}: {
  assessment: Assessment;
  selected: boolean;
  approval: ApprovalState;
  onSelect: () => void;
  onApprove: () => void;
  onDismiss: () => void;
  onToggleDraft: () => void;
  draftOpen: boolean;
}) {
  const color = RISK_COLOR[assessment.riskLabel];
  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border bg-zinc-900/70 p-3 transition ${
        selected ? "border-zinc-500" : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <RiskDot label={assessment.riskLabel} />
            <span className="truncate text-sm font-medium">{assessment.aoiName}</span>
          </div>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-zinc-500">
            {assessment.aoiTypeLabel}
          </p>
        </div>
        <div
          className="shrink-0 rounded-md px-2 py-1 text-right text-xs font-semibold"
          style={{ background: color.bg, color: color.fg }}
        >
          {assessment.riskScore}
          <span className="ml-1 font-normal opacity-70">{assessment.riskLabel}</span>
        </div>
      </div>

      <p className="mt-2 text-sm text-zinc-300">{assessment.headline}</p>

      <div className="mt-2 flex items-center gap-2 rounded-lg bg-zinc-800/50 px-2.5 py-2 text-xs">
        <span className="text-base leading-none">
          {RECOMMENDATION_ICON[assessment.recommendation.kind]}
        </span>
        <span className="font-medium text-zinc-200">{assessment.recommendation.label}</span>
        <span className="text-zinc-500">
          {fmtHourRange(
            assessment.recommendation.actionWindow.startHour,
            assessment.recommendation.actionWindow.endHour,
          )}
        </span>
        {assessment.recommendation.metric && (
          <span className="ml-auto rounded bg-zinc-900 px-1.5 py-0.5 text-zinc-400">
            {assessment.recommendation.metric.label}: {assessment.recommendation.metric.value}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {approval === "approved" ? (
          <span className="rounded-full bg-emerald-950 px-3 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-800">
            ✓ Approved · dispatched
          </span>
        ) : approval === "dismissed" ? (
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">Dismissed</span>
        ) : (
          <>
            <button
              onClick={onApprove}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-500"
            >
              Approve &amp; dispatch
            </button>
            <button
              onClick={onDismiss}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800"
            >
              Dismiss
            </button>
          </>
        )}
        <button
          onClick={onToggleDraft}
          className="ml-auto text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
        >
          {draftOpen ? "Hide draft" : "View draft"}
        </button>
      </div>

      {draftOpen && (
        <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-relaxed text-zinc-400">
          {assessment.recommendation.draft}
        </pre>
      )}
    </div>
  );
}

function DetailPanel({
  assessment,
  approval,
}: {
  assessment: Assessment;
  approval: ApprovalState;
}) {
  const color = RISK_COLOR[assessment.riskLabel];
  return (
    <section className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">{assessment.aoiName}</h3>
            <p className="text-xs text-zinc-500">
              {assessment.aoiTypeLabel} · peak {fmtHour(assessment.peakHour)} · action{" "}
              {fmtHourRange(
                assessment.recommendation.actionWindow.startHour,
                assessment.recommendation.actionWindow.endHour,
              )}
            </p>
          </div>
          <span
            className="rounded-md px-2.5 py-1 text-sm font-semibold"
            style={{ background: color.bg, color: color.fg }}
          >
            {assessment.riskScore} / 100
          </span>
        </div>

        <SignalTimeline assessment={assessment} />

        <div className="flex flex-wrap gap-2 text-[11px] text-zinc-500">
          <Legend swatch="#fb923c" label="Heat index" />
          <Legend swatch="#38bdf8" label="Wet-bulb" />
          <Legend swatch="#a78bfa" label="Apparent" />
          <Legend swatch="rgba(239,68,68,0.4)" label="Peak window" />
          <Legend swatch="rgba(45,212,191,0.5)" label="Action window" />
        </div>

        <SignalReadout assessment={assessment} />
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Agent rationale
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{assessment.rationale}</p>
          <p className="mt-2 rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-400">
            <span className="text-zinc-500">Cited signal — </span>
            {assessment.citedSignal}
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex items-center gap-2">
            <span className="text-base">{RECOMMENDATION_ICON[assessment.recommendation.kind]}</span>
            <p className="text-sm font-medium">{assessment.recommendation.label}</p>
            {approval === "approved" && (
              <span className="ml-auto text-xs text-emerald-400">dispatched</span>
            )}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">
            {assessment.recommendation.detail}
          </p>
        </div>
      </div>
    </section>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: swatch }} />
      {label}
    </span>
  );
}

function SignalReadout({ assessment }: { assessment: Assessment }) {
  const h = assessment.hourly;
  const max = (sel: (x: Assessment["hourly"][number]) => number) => Math.max(...h.map(sel));
  const min = (sel: (x: Assessment["hourly"][number]) => number) => Math.min(...h.map(sel));
  const stats: { label: string; value: string }[] = [
    { label: "Peak heat index", value: `${max((x) => x.heatIndexF).toFixed(0)}°F` },
    { label: "Peak wet-bulb", value: `${max((x) => x.wetBulbF).toFixed(1)}°F` },
    { label: "Overnight low", value: `${min((x) => x.tempF).toFixed(0)}°F` },
    { label: "Min humidity", value: `${min((x) => x.relativeHumidityPct)}%` },
    { label: "Peak PM2.5", value: `${max((x) => x.pm25)}` },
    { label: "Peak solar GHI", value: `${max((x) => x.solarGhi)} W/m²` },
    { label: "Peak CO₂", value: `${max((x) => x.co2Ppm)} ppm` },
    { label: "Max cloud", value: `${max((x) => x.cloudCoverOctas)}/8` },
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">{s.label}</p>
          <p className="text-sm font-medium text-zinc-200">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
