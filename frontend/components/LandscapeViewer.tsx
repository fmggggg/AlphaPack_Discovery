"use client";

import React, { useEffect, useState } from "react";
import { Spin, Empty } from "antd";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import PlotlyScatter, { ScatterPoint } from "@/components/PlotlyScatter";

export default React.memo(function LandscapeViewer({ dsid }: { dsid: string }) {
  const [pts, setPts] = useState<ScatterPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(api(`/api/datasets/${dsid}/landscape`), { cache: "no-store" });
        const d = r.ok ? await r.json() : [];
        if (alive) {
          const mapped: ScatterPoint[] = d.map((x: any) => ({
            id: x.id ?? x.name,
            name: x.name ?? x.id,
            x: Number(x.x),
            y: Number(x.y),
            label: x.label,
          }));
          setPts(mapped);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [dsid]);

  if (loading) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Spin /></div>;
  }
  if (!pts.length) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Empty description="没有可显示的点" /></div>;
  }

  // 占满父容器
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <PlotlyScatter
        title=""
        points={pts}
        onPointClick={(p) => router.push(`/datasets/${dsid}/structures/${p.name}`)}
      />
    </div>
  );
}, (prev, next) => prev.dsid === next.dsid);
