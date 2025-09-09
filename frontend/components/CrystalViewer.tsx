"use client";

import React, { useEffect, useRef, useState } from "react";

declare global { interface Window { $3Dmol?: any; } }

function load3Dmol(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.$3Dmol) return Promise.resolve(window.$3Dmol);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://3Dmol.csb.pitt.edu/build/3Dmol-min.js";
    s.async = true;
    s.onload = () => resolve(window.$3Dmol);
    s.onerror = () => reject(new Error("Failed to load 3Dmol.js"));
    document.head.appendChild(s);
  });
}

function hasUnitCellInfo(cif: string): boolean {
  const t = cif.toLowerCase();
  const hasLengths = t.includes("_cell_length_a") && t.includes("_cell_length_b") && t.includes("_cell_length_c");
  const hasAngles  = t.includes("_cell_angle_alpha") && t.includes("_cell_angle_beta") && t.includes("_cell_angle_gamma");
  const hasSymOp   = t.includes("_symmetry_equiv_pos_as_xyz") || t.includes("_space_group_symop_operation_xyz");
  const hasSg      = t.includes("_symmetry_int_tables_number") || t.includes("_space_group_");
  return hasLengths && hasAngles && (hasSymOp || hasSg);
}

export type VizMode = "stick" | "ballstick" | "spacefill" | "line";
export type ColorScheme = "Jmol" | "Rasmol" | "default" | "mono";

export default function CrystalViewer({
  cifOrPoscar,
  mode = "stick",
  stickRadius = 0.15,
  sphereScale = 0.3,
  colorScheme = "Jmol",
  monoColor = "#4c78a8",
  supercell = [1, 1, 1],
  background = "white",
  style = {},
  containerRef,
}: {
  cifOrPoscar: string;
  mode?: VizMode;
  stickRadius?: number;
  sphereScale?: number;
  colorScheme?: ColorScheme;
  monoColor?: string;
  supercell?: [number, number, number];
  background?: "white" | "black";
  style?: React.CSSProperties;
  containerRef?: React.RefObject<HTMLDivElement>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const [err, setErr] = useState<string>("");

  const applyStyle = () => {
    const v = viewerRef.current;
    if (!v) return;
    v.setStyle({}, {}); // 清空

    let colorPart: any = {};
    if (colorScheme === "mono") colorPart = { color: monoColor };
    else if (colorScheme === "Jmol" || colorScheme === "Rasmol") colorPart = { colorscheme: colorScheme };

    if (mode === "stick") {
      v.setStyle({}, { stick: { radius: stickRadius, ...colorPart } });
    } else if (mode === "ballstick") {
      v.setStyle({}, { stick: { radius: stickRadius, ...colorPart }, sphere: { scale: sphereScale, ...colorPart } });
    } else if (mode === "spacefill") {
      v.setStyle({}, { sphere: { scale: Math.max(0.2, sphereScale), ...colorPart } });
    } else if (mode === "line") {
      v.setStyle({}, { line: { linewidth: 1.5, ...colorPart } });
    }
    v.setBackgroundColor(background);
    v.render();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const $3Dmol = await load3Dmol();
        if (cancelled || !$3Dmol || !rootRef.current) return;

        if (!viewerRef.current) {
          viewerRef.current = new $3Dmol.GLViewer(rootRef.current, { backgroundColor: background });
        }
        const v = viewerRef.current;

        try { v.removeAllModels?.(); } catch {}
        try { v.removeUnitCell?.(); } catch {}

        // 组装 + 归一化到晶胞（整体，不拆分分子）
        const m = v.addModel(cifOrPoscar, "cif", { doAssembly: true, normalizeAssembly: true });
        modelRef.current = m;

        // 始终：若 CIF 有晶胞信息则绘制单元格
        if (hasUnitCellInfo(cifOrPoscar)) {
          try { v.addUnitCell?.(m, { box: { color: background === "black" ? "white" : "black" } }); } catch {}
        }

        // 超晶胞（按 +a,+b,+c 的计数复制）
        const [nx, ny, nz] = supercell;
        const needRep = (nx ?? 1) > 1 || (ny ?? 1) > 1 || (nz ?? 1) > 1;
        if (needRep && hasUnitCellInfo(cifOrPoscar)) {
          try { v.replicateUnitCell?.(Math.max(1, nx), Math.max(1, ny), Math.max(1, nz), m); } catch {}
        }

        v.zoomTo();
        applyStyle();
        setErr("");
        setTimeout(() => { try { v.resize(); } catch {} }, 0);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "无法渲染结构");
      }
    })();

    const onResize = () => { try { viewerRef.current?.resize(); } catch {} };
    window.addEventListener("resize", onResize);
    return () => { cancelled = true; window.removeEventListener("resize", onResize); };
  }, [cifOrPoscar, supercell[0], supercell[1], supercell[2], background]);

  useEffect(() => { applyStyle(); }, [mode, stickRadius, sphereScale, colorScheme, monoColor]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 260, position: "relative", ...style }}
    >
      <div ref={rootRef} style={{ width: "100%", height: "100%" }} />
      {err && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "red", fontSize: 12 }}>
          {err}
        </div>
      )}
    </div>
  );
}
