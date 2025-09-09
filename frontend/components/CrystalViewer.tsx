"use client";
import { useEffect, useRef, useState } from "react";

export default function CrystalViewer({ cifOrPoscar }: { cifOrPoscar: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 动态加载 3Dmol.js CDN
    if ((window as any).$3Dmol) { setReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://3dmol.org/build/3Dmol-min.js";
    s.async = true;
    s.onload = () => setReady(true);
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const $3Dmol = (window as any).$3Dmol;
    const viewer = new $3Dmol.GLViewer(containerRef.current, { backgroundColor: "white" });
    const m = viewer.addModel(cifOrPoscar, cifOrPoscar.trim().startsWith("data_") ? "cif" : "vasp");
    viewer.setStyle({}, { stick: {} });
    // 显示晶胞
    (viewer as any).addUnitCell(m);
    viewer.zoomTo();
    viewer.render();
    return () => { viewer.clear(); };
  }, [ready, cifOrPoscar]);

  return <div ref={containerRef} className="w-full h-[540px] rounded-2xl shadow border"/>;
}

