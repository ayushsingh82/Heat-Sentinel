"use client";

import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Assessment } from "@/lib/agent";
import { fmtHour } from "@/lib/format";

const WET_BULB_CURTAIL_F = 88;

export default function SignalTimeline({ assessment }: { assessment: Assessment }) {
  const data = assessment.hourly.map((h) => ({
    hour: h.hour,
    label: fmtHour(h.hour),
    heatIndex: h.heatIndexF,
    wetBulb: h.wetBulbF,
    apparent: h.apparentF,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="hi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#fb923c" stopOpacity={0} />
            </linearGradient>
          </defs>

          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#71717a" }}
            interval={3}
            axisLine={{ stroke: "#27272a" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#71717a" }}
            axisLine={false}
            tickLine={false}
            unit="°"
            width={44}
            domain={[60, 145]}
            ticks={[70, 90, 110, 130]}
          />
          <Tooltip
            contentStyle={{
              background: "#09090b",
              border: "1px solid #27272a",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#a1a1aa" }}
          />

          <ReferenceArea
            x1={fmtHour(assessment.peakWindow.startHour)}
            x2={fmtHour(assessment.peakWindow.endHour)}
            fill="#ef4444"
            fillOpacity={0.08}
          />
          <ReferenceArea
            x1={fmtHour(assessment.recommendation.actionWindow.startHour)}
            x2={fmtHour(assessment.recommendation.actionWindow.endHour)}
            fill="#2dd4bf"
            fillOpacity={0.12}
          />
          {assessment.aoiType === "worksite" && (
            <ReferenceLine
              y={WET_BULB_CURTAIL_F}
              stroke="#f87171"
              strokeDasharray="4 4"
              label={{ value: "wet-bulb curtail", fontSize: 9, fill: "#f87171", position: "insideTopRight" }}
            />
          )}

          <Area
            type="monotone"
            dataKey="heatIndex"
            name="Heat index"
            stroke="#fb923c"
            strokeWidth={2}
            fill="url(#hi)"
          />
          <Line
            type="monotone"
            dataKey="wetBulb"
            name="Wet-bulb"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="apparent"
            name="Apparent"
            stroke="#a78bfa"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
