"use client";

import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useRef } from "react";
import type { Layout, Config, Data } from "plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export type ScatterPoint = {
  id: string;
  name: string;   // structure name
  x: number;      // density
  y: number;      // energy
  formula?: string;
};

export default React.memo(function PlotlyScatter({
  title,
  points,
  selectedName,
  onPointClick,
}: {
  title?: string;
  points: ScatterPoint[];
  selectedName?: string | null;
  onPointClick?: (p: ScatterPoint) => void;
}) {
  // --- ResizeObserver: fire a window 'resize' when container size changes
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(() => {
      // react-plotly listens to window resize; fake one to trigger relayout
      window.dispatchEvent(new Event("resize"));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const { bulk, sel } = useMemo(() => {
    const idx = selectedName ? points.findIndex(p => p.name === selectedName) : -1;
    if (idx >= 0) {
      const sel = points[idx];
      const bulk = points.filter((_, i) => i !== idx);
      return { bulk, sel };
    }
    return { bulk: points, sel: undefined as ScatterPoint | undefined };
  }, [points, selectedName]);

  const bulkData: Data = useMemo(() => ({
    type: "scattergl",
    mode: "markers",
    x: bulk.map(p => p.x),
    y: bulk.map(p => p.y),
    text: bulk.map(p => p.name),
    customdata: bulk.map(p => ({ id: p.id, name: p.name, formula: p.formula })),
    hovertemplate: "%{text}<br>ρ=%{x:.3f} g/cm³<br>E=%{y:.3f}<extra></extra>",
    marker: { size: 6, opacity: 0.85 },
  }), [bulk]);

  const selData: Data | null = useMemo(() => {
    if (!sel) return null;
    return {
      type: "scattergl",
      mode: "markers",
      x: [sel.x],
      y: [sel.y],
      text: [sel.name],
      customdata: [{ id: sel.id, name: sel.name, formula: sel.formula }],
      hovertemplate: "<b>%{text}</b><br>ρ=%{x:.3f} g/cm³<br>E=%{y:.3f}<extra></extra>",
      marker: { size: 11, opacity: 1, color: "#ff4d4f", line: { width: 1, color: "#7f1f1f" } },
    } as Data;
  }, [sel]);

  const data = selData ? [bulkData, selData] : [bulkData];

  const layout = useMemo<Partial<Layout>>(() => ({
    title: { text: title ?? "", x: 0, xanchor: "left", font: { size: 16 } },
    margin: { l: 60, r: 20, t: title ? 40 : 16, b: 60 },
    xaxis: { title: "Density (g/cm³)", zeroline: false },
    yaxis: { title: "Energy", zeroline: false },
    hovermode: "closest",
    showlegend: false,
    uirevision: "keep",
    autosize: true,
  }), [title]);

  const config = useMemo<Partial<Config>>(() => ({
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "zoomIn2d", "zoomOut2d"],
  }), []);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,         // allow shrinking inside flex/grid
        overflow: "hidden",  // prevent content overflow when width shrinks
        position: "relative"
      }}
    >
      <Plot
        data={data}
        layout={layout}
        config={config}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
        onClick={(ev) => {
          const p = ev.points?.[0];
          if (!p) return;
          const index = p.pointIndex as number;
          // click on selected trace returns the only point
          const hit = sel && p.curveNumber === 1 ? sel : (bulk[index] ?? points[index]);
          if (hit) onPointClick?.(hit);
        }}
      />
    </div>
  );
});
