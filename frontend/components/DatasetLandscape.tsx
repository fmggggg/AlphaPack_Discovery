"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Spin, Empty, Typography, Divider, Skeleton } from "antd";
import { api } from "@/lib/api";
import PlotlyScatter, { ScatterPoint } from "@/components/PlotlyScatter";
import StructureDetailPanel, { CrystalMeta } from "@/components/StructureDetailPanel";

const { Text } = Typography;

type ManifestItem = {
  name: string;
  energy: number;
  density?: number;
  sg?: number;
  a?: number; b?: number; c?: number;
  alpha?: number; beta?: number; gamma?: number;
  formula?: string;
  [k: string]: any;
};

type DsMeta = {
  dsid: string;
  title?: string;
  smiles?: string;
  selfies?: string;
  [k: string]: any;
};

export default function DatasetLandscape({ dsid }: { dsid: string }) {
  const [pts, setPts] = useState<ScatterPoint[]>([]);
  const [manifest, setManifest] = useState<ManifestItem[]>([]);
  const [dsMeta, setDsMeta] = useState<DsMeta | null>(null);
  const [loading, setLoading] = useState(true);

  // 就绪闸门（可选）
  const [plotReady, setPlotReady] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setPlotReady(false);
      setSelectedName(null);
      setPendingName(null);
      try {
        const [pr, mr, metar] = await Promise.all([
          fetch(api(`/api/datasets/${dsid}/landscape`), { cache: "no-store" }),
          fetch(api(`/api/datasets/${dsid}/manifest`), { cache: "no-store" }),
          fetch(api(`/api/datasets/${dsid}/meta`), { cache: "no-store" }),
        ]);

        const pointsRaw = pr.ok ? await pr.json() : [];
        const manifestRaw: ManifestItem[] = mr.ok ? await mr.json() : [];
        const metaJson: DsMeta | null = metar.ok ? await metar.json() : null;

        if (!alive) return;

        const mapped: ScatterPoint[] = (pointsRaw || []).map((x: any) => ({
          id: x.id ?? x.name,
          name: x.name ?? x.id,
          x: Number(x.x),
          y: Number(x.y),
          formula: x.formula,
        }));

        setPts(mapped);
        setManifest(manifestRaw);
        setDsMeta(metaJson);

        // 预选能量最低
        if (manifestRaw.length) {
          const minItem = manifestRaw.reduce<ManifestItem | null>(
            (best, cur) =>
              best == null || (typeof cur.energy === "number" && cur.energy < (best as any).energy)
                ? cur
                : best,
            null
          );
          setPendingName(minItem?.name ?? mapped[0]?.name ?? null);
        } else {
          setPendingName(mapped[0]?.name ?? null);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [dsid]);

  useEffect(() => {
    if (!loading && plotReady && pendingName && !selectedName) {
      setSelectedName(pendingName);
    }
  }, [loading, plotReady, pendingName, selectedName]);

  const selectedMeta: CrystalMeta | null = useMemo(() => {
    if (!selectedName) return null;
    const m = manifest.find((x) => x.name === selectedName);
    if (!m) return null;
    return {
      name: m.name,
      energy: m.energy,
      density: m.density,
      sg: m.sg,
      cell: m.a
        ? { a: m.a, b: m.b, c: m.c, alpha: m.alpha, beta: m.beta, gamma: m.gamma }
        : undefined,
      formula: m.formula,
      // SMILES/SELFIES 来自数据集级别
      smiles: dsMeta?.smiles,
      selfies: dsMeta?.selfies,
      extra: m,
    };
  }, [selectedName, manifest, dsMeta]);

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spin />
      </div>
    );
  }
  if (!pts.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Empty description="No points to display" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 12, height: "100%" }}>
      {/* 左：Plotly 2/3 */}
      <div style={{ flex: 2, minWidth: 0, height: "100%", background: "#fff" }}>
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <Text strong>Landscape — {dsid}</Text>
          <Text type="secondary">X: Density (g/cm³) · Y: Energy</Text>
        </div>
        <div style={{ height: "calc(100% - 44px)", padding: 8 }}>
          <PlotlyScatter
            key={dsid}
            points={pts}
            selectedName={selectedName}
            onPointClick={(p) => setSelectedName(p.name)}
            onReady={() => setPlotReady(true)}
          />
        </div>
      </div>

      {/* 右：详情 1/3 */}
      <div
        style={{
          flex: 1,
          minWidth: 320,
          height: "100%",
          background: "#fff",
          border: "1px solid #f0f0f0",
          borderRadius: 12,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #f0f0f0" }}>
          <Text strong>Details</Text>
          <Divider type="vertical" />
          <Text type="secondary">{selectedName ?? "Not selected"}</Text>
        </div>
        <div style={{ flex: 1, minHeight: 300 }}>
          {(!plotReady || !selectedName) ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <StructureDetailPanel dsid={dsid} name={selectedName} meta={selectedMeta} />
          )}
        </div>
      </div>
    </div>
  );
}
