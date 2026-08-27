"use client";

import { useMemo, useState } from "react";
import { DeckGL } from "@deck.gl/react";
import { OrbitView, COORDINATE_SYSTEM, type OrbitViewState } from "@deck.gl/core";
import { ColumnLayer, PathLayer, TextLayer } from "@deck.gl/layers";
import { PORTFOLIO, type Aoi } from "@/lib/aoi";
import type { Assessment } from "@/lib/agent";
import type { HeatGrid } from "@/lib/fortyguard";
import { heatColor, RISK_COLOR } from "@/lib/format";

const SPACING = 10;
const INITIAL_VIEW: OrbitViewState = {
  target: [0, 0, 34],
  rotationX: 34,
  rotationOrbit: -25,
  zoom: 1.75,
  minZoom: 0,
  maxZoom: 5,
};

type Props = {
  cityGrid: HeatGrid | null;
  assessments: Assessment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type GridDatum = { x: number; y: number; temp: number };
type AoiDatum = { aoi: Aoi; assessment?: Assessment };

export default function CityHeatMap({ cityGrid, assessments, selectedId, onSelect }: Props) {
  const [viewState, setViewState] = useState<OrbitViewState>(INITIAL_VIEW);

  const { gridData, min, max, span } = useMemo(() => {
    if (!cityGrid) return { gridData: [] as GridDatum[], min: 0, max: 1, span: 0 };
    const lo = Math.min(...cityGrid.cells);
    const hi = Math.max(...cityGrid.cells);
    const data: GridDatum[] = [];
    for (let y = 0; y < cityGrid.size; y++) {
      for (let x = 0; x < cityGrid.size; x++) {
        data.push({ x, y, temp: cityGrid.cells[y * cityGrid.size + x] });
      }
    }
    return { gridData: data, min: lo, max: hi, span: cityGrid.size };
  }, [cityGrid]);

  const center = (span - 1) / 2;
  const toWorld = (gx: number, gy: number): [number, number, number] => [
    (gx - center) * SPACING,
    (gy - center) * SPACING,
    0,
  ];

  const aoiData: AoiDatum[] = useMemo(
    () =>
      PORTFOLIO.map((aoi) => ({
        aoi,
        assessment: assessments.find((a) => a.aoiId === aoi.id),
      })),
    [assessments],
  );

  const selectedCorridor = assessments.find((a) => a.aoiId === selectedId && a.route);

  const layers = [
    new ColumnLayer<GridDatum>({
      id: "heat-grid",
      data: gridData,
      diskResolution: 4,
      radius: SPACING * 0.46,
      extruded: true,
      pickable: false,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => [(d.x - center) * SPACING, (d.y - center) * SPACING],
      getElevation: (d) => Math.max(1, (d.temp - min + 1) * 2.4),
      getFillColor: (d) => {
        const [r, g, b] = heatColor(d.temp, min, max);
        return [r, g, b, 210];
      },
      material: { ambient: 0.55, diffuse: 0.6, shininess: 32, specularColor: [40, 40, 40] },
    }),

    selectedCorridor?.route &&
      new PathLayer<{ path: [number, number, number][]; color: [number, number, number] }>({
        id: "corridor-routes",
        data: [
          {
            path: selectedCorridor.route.shortPath.map(([x, y]) => {
              const [wx, wy] = toWorld(x, y);
              return [wx, wy, 40] as [number, number, number];
            }),
            color: [148, 163, 184],
          },
          {
            path: selectedCorridor.route.coolPath.map(([x, y]) => {
              const [wx, wy] = toWorld(x, y);
              return [wx, wy, 44] as [number, number, number];
            }),
            color: [45, 212, 191],
          },
        ],
        coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
        getPath: (d) => d.path,
        getColor: (d) => d.color,
        getWidth: 5,
        widthMinPixels: 3,
        capRounded: true,
        jointRounded: true,
      }),

    new ColumnLayer<AoiDatum>({
      id: "aoi-markers",
      data: aoiData,
      diskResolution: 24,
      radius: SPACING * 0.42,
      extruded: true,
      pickable: true,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => {
        const [wx, wy] = toWorld(d.aoi.gx, d.aoi.gy);
        return [wx, wy];
      },
      getElevation: (d) => {
        const score = d.assessment?.riskScore ?? 20;
        const base = 20 + score * 0.42;
        return d.aoi.id === selectedId ? base + 12 : base;
      },
      getFillColor: (d) => {
        if (!d.assessment) return [100, 116, 139, 230];
        const [r, g, b] = RISK_COLOR[d.assessment.riskLabel].rgb;
        return [r, g, b, d.aoi.id === selectedId ? 255 : 225];
      },
      getLineColor: [255, 255, 255, 120],
      stroked: true,
      lineWidthMinPixels: 1,
      onClick: (info) => {
        const datum = info.object as AoiDatum | undefined;
        if (datum) onSelect(datum.aoi.id);
      },
      updateTriggers: {
        getElevation: [selectedId, assessments],
        getFillColor: [selectedId, assessments],
      },
    }),

    new TextLayer<AoiDatum>({
      id: "aoi-labels",
      data: aoiData,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => {
        const [wx, wy] = toWorld(d.aoi.gx, d.aoi.gy);
        const score = d.assessment?.riskScore ?? 20;
        return [wx, wy, 24 + score * 0.42 + (d.aoi.id === selectedId ? 16 : 7)];
      },
      getText: (d) => d.aoi.name.replace(/ (Commercial|Infrastructure|Elder Care|Transit) /, " "),
      getSize: 12,
      getColor: (d) => (d.aoi.id === selectedId ? [255, 255, 255, 255] : [203, 213, 225, 200]),
      getAngle: 0,
      billboard: true,
      fontWeight: 600,
      getTextAnchor: "middle",
      getAlignmentBaseline: "bottom",
      updateTriggers: { getPosition: [selectedId, assessments], getColor: [selectedId] },
    }),
  ].filter(Boolean);

  return (
    <div className="relative h-full w-full">
      <DeckGL
        views={new OrbitView({ orbitAxis: "Z", fovy: 50 })}
        viewState={viewState}
        controller={{ inertia: true }}
        onViewStateChange={(e) => setViewState(e.viewState as OrbitViewState)}
        layers={layers}
        style={{ position: "absolute", width: "100%", height: "100%" }}
        getCursor={({ isDragging, isHovering }) =>
          isDragging ? "grabbing" : isHovering ? "pointer" : "grab"
        }
      />
      {!cityGrid && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
          Run an assessment to render the city heat model
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-black/50 px-2.5 py-1.5 text-[11px] text-zinc-300 backdrop-blur">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#1e3a8a" }} />
        cooler
        <span className="inline-block h-2 w-8 rounded-full bg-gradient-to-r from-[#0d9488] via-[#d97706] to-[#dc2626]" />
        hotter
        <span className="ml-2 opacity-70">· tower height = risk score</span>
      </div>
    </div>
  );
}
