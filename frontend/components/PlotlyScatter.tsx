"use client";

import dynamic from "next/dynamic";
import React, { useMemo } from "react";
import type { Layout, Config, Data } from "plotly.js";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

export type ScatterPoint = {
  id: string;
  name: string;
  x: number;
  y: number;
  label?: string;
};

export default React.memo(function PlotlyScatter({
  title,
  points,
  onPointClick,
}: {
  title?: string;
  points: ScatterPoint[];
  onPointClick?: (p: ScatterPoint) => void;
}) {
  const { xs, ys, text, customdata } = useMemo(() => {
    const xs: number[] = new Array(points.length);
    const ys: number[] = new Array(points.length);
    const text: string[] = new Array(points.length);
    const customdata: any[] = new Array(points.length);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      xs[i] = p.x;
      ys[i] = p.y;
      text[i] = p.label ?? p.name ?? p.id;
      customdata[i] = { id: p.id, name: p.name };
    }
    return { xs, ys, text, customdata };
  }, [points]);

  const data = useMemo<Data[]>(() => [
    {
      type: "scattergl",
      mode: "markers",
      x: xs,
      y: ys,
      text,
      customdata,
      hovertemplate: "%{text}<br>ρ=%{x:.3f} g/cm³<br>E=%{y:.3f}<extra></extra>",
      marker: { size: 6, opacity: 0.85 },
    } as Data,
  ], [xs, ys, text, customdata]);

  const layout = useMemo<Partial<Layout>>(() => ({
    title: { text: title ?? "", x: 0, xanchor: "left", font: { size: 16 } },
    margin: { l: 60, r: 20, t: title ? 40 : 16, b: 60 },
    xaxis: { title: "Density (g/cm³)", zeroline: false },
    yaxis: { title: "Energy", zeroline: false },
    hovermode: "closest",
    showlegend: false,
    uirevision: "keep",
    autosize: true, // 关键：随容器尺寸自动调整
  }), [title]);

  const config = useMemo<Partial<Config>>(() => ({
    responsive: true,
    displaylogo: false,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "zoomIn2d", "zoomOut2d"],
  }), []);

  return (
    <Plot
      data={data}
      layout={layout}
      config={config}
      // 让 Plotly 跟随父容器尺寸
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
      onClick={(ev) => {
        const p = ev.points?.[0];
        if (!p) return;
        const cd = p.customdata as { id: string; name: string };
        if (cd && onPointClick) {
          const hit = points[p.pointIndex];
          onPointClick(hit ?? { id: cd.id, name: cd.name, x: p.x as number, y: p.y as number });
        }
      }}
    />
  );
});
