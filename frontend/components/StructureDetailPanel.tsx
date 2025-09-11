"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Descriptions, Empty, Spin, Typography, Space, Tag,
  Select, Switch, InputNumber, Button, Collapse, Tooltip, Slider
} from "antd";
import { DownloadOutlined, ReloadOutlined, FullscreenOutlined, FullscreenExitOutlined } from "@ant-design/icons";
import CrystalViewer, { VizMode, ColorScheme } from "@/components/CrystalViewer";
import { api } from "@/lib/api";

const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

export type CrystalMeta = {
  name: string;
  energy?: number;
  density?: number;
  sg?: number;
  cell?: { a: number; b: number; c: number; alpha: number; beta: number; gamma: number };
  formula?: string;
  selfies?: string;  
  smiles?: string;    
  extra?: Record<string, any>;
};

const DEF = {
  mode: "ballstick" as VizMode,
  stickRadius: 0.15,
  sphereScale: 0.3,
  colorScheme: "Jmol" as ColorScheme,
  monoColor: "#4c78a8",
  nx: 1, ny: 1, nz: 1,
  bgDark: false,
};

export default function StructureDetailPanel({
  dsid, name, meta
}: { dsid: string; name: string | null; meta: CrystalMeta | null }) {
  const [cif, setCif] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Visualization settings
  const [mode, setMode] = useState<VizMode>(DEF.mode);
  const [stickRadius, setStickRadius] = useState(DEF.stickRadius);
  const [sphereScale, setSphereScale] = useState(DEF.sphereScale);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(DEF.colorScheme);
  const [monoColor, setMonoColor] = useState(DEF.monoColor);
  const [nx, setNx] = useState(DEF.nx);
  const [ny, setNy] = useState(DEF.ny);
  const [nz, setNz] = useState(DEF.nz);
  const [bgDark, setBgDark] = useState(DEF.bgDark);

  // Fullscreen
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const resetAll = () => {
    setMode(DEF.mode);
    setStickRadius(DEF.stickRadius);
    setSphereScale(DEF.sphereScale);
    setColorScheme(DEF.colorScheme);
    setMonoColor(DEF.monoColor);
    setNx(DEF.nx); setNy(DEF.ny); setNz(DEF.nz);
    setBgDark(DEF.bgDark);
  };

  // Fetch CIF when structure changes
  useEffect(() => {
    let alive = true;
    if (!name) { setCif(""); return; }
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(api(`/api/crystals/${dsid}/${name}/cif`), { cache: "no-store" });
        const txt = r.ok ? await r.text() : "";
        if (alive) setCif(txt);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [dsid, name]);

  const background = bgDark ? "black" : "white";
  const supercell = useMemo(() => [nx, ny, nz] as [number, number, number], [nx, ny, nz]);

  if (!name || !meta) {
    return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Empty description="Not Selected" /></div>;
  }

  const downloadCIF = () => {
    const blob = new Blob([cif], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.cif`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", minWidth: 320 }}>
      {/* Metadata */}
      <div style={{ padding: 10, borderBottom: "1px solid #f0f0f0" }}>
        {/* Top row: title + SG tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 6,
            gap: 8,
          }}
        >
          
        </div>

        {/* SMILES / SELFIES (wrapped, copyable) */}
        {meta.smiles && (
          <div style={{ marginBottom: 6 }}>
            <Text type="secondary" style={{ marginRight: 8 }}>SMILES</Text>
            <Paragraph
              copyable
              style={{ margin: 0, wordBreak: "break-all", whiteSpace: "pre-wrap" }}
              code
            >
              {meta.smiles}
            </Paragraph>
          </div>
        )}
        {meta.selfies && (
          <div style={{ marginBottom: 6 }}>
            <Text type="secondary" style={{ marginRight: 8 }}>SELFIES</Text>
            <Paragraph
              copyable
              style={{ margin: 0, wordBreak: "break-all", whiteSpace: "pre-wrap" }}
              code
            >
              {meta.selfies}
            </Paragraph>
          </div>
        )}

        {/* Energy & Density on one line */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 24,
            flexWrap: "wrap",
            marginTop: 6,
            marginBottom: 6,
          }}
        >
          {typeof meta.energy === "number" && (
            <div>
              <Text type="secondary" style={{ marginRight: 6 }}>Energy</Text>
              <Text code>{meta.energy}</Text>
            </div>
          )}
          {typeof meta.density === "number" && (
            <div>
              <Text type="secondary" style={{ marginRight: 6 }}>Density</Text>
              <Text code>{meta.density.toFixed(3)} g/cm³</Text>
            </div>
          )}
          {typeof meta.sg === "number" && (
            <div>
              <Text type="secondary" style={{ marginRight: 6 }}>Space group</Text>
              <Text code>#{meta.sg}</Text>
            </div>
          )}
        </div>
        {/* Cell + Buttons in one row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
            flexWrap: "wrap", // small screens will wrap
          }}
        >
          {/* Left: Cell info */}
          {meta.cell && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <Text type="secondary">Cell</Text>
              <Text code>
                a={meta.cell.a}, b={meta.cell.b}, c={meta.cell.c}, α={meta.cell.alpha}, β={meta.cell.beta}, γ={meta.cell.gamma}
              </Text>
            </div>
          )}

          {/* Right: Buttons */}
          <div style={{ marginLeft: "auto" }}>
            <Space size="small" wrap>
              <Button icon={<DownloadOutlined />} size="small" onClick={downloadCIF}>
                Download CIF
              </Button>
              <Button
                size="small"
                onClick={() =>
                  window.open(api(`/api/crystals/${dsid}/${name}/cif`), "_blank", "noopener")
                }
              >
                Open
              </Button>
            </Space>
          </div>
        </div>
      </div>

      {/* Compact toolbar (English only) */}
      <div style={{ padding: "6px 10px", borderBottom: "1px solid #f0f0f0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap", overflow: "hidden" }}>
          <Select<VizMode>
            size="small" value={mode} onChange={setMode} style={{ width: 140 }}
            options={[
              { value: "stick", label: "Stick" },
              { value: "ballstick", label: "Ball-&-Stick" },
              { value: "spacefill", label: "Spacefill" },
              { value: "line", label: "Line" },
            ]}
          />
          <Tooltip title="Background">
            <Switch size="small" checkedChildren="Dark" unCheckedChildren="Light" checked={bgDark} onChange={setBgDark} />
          </Tooltip>

          {/* Supercell (compact) */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            <Text type="secondary">Cell</Text>
            <InputNumber size="small" min={1} max={5} value={nx} onChange={(v)=>setNx(Number(v)||1)} style={{ width: 56 }} />
            <InputNumber size="small" min={1} max={5} value={ny} onChange={(v)=>setNy(Number(v)||1)} style={{ width: 56 }} />
            <InputNumber size="small" min={1} max={5} value={nz} onChange={(v)=>setNz(Number(v)||1)} style={{ width: 56 }} />
          </div>

          <Button size="small" icon={<ReloadOutlined />} onClick={resetAll}>Reset</Button>
          <Button size="small" icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />} onClick={toggleFullscreen} />
        </div>

        {/* Advanced settings */}
        <Collapse ghost style={{ marginTop: 6 }}>
          <Panel header="Advanced Settings" key="adv">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {(mode === "stick" || mode === "ballstick") && (
                <div>
                  <Text type="secondary">Stick Radius</Text>
                  <Slider min={0.05} max={0.3} step={0.01} value={stickRadius} onChange={setStickRadius} />
                </div>
              )}
              {(mode === "spacefill" || mode === "ballstick") && (
                <div>
                  <Text type="secondary">Sphere Scale</Text>
                  <Slider min={0.2} max={1.0} step={0.05} value={sphereScale} onChange={setSphereScale} />
                </div>
              )}
              <div style={{ gridColumn: "1 / span 2" }}>
                <Text strong style={{ marginRight: 8 }}>Color Scheme</Text>
                <Select<ColorScheme> size="small" value={colorScheme} onChange={setColorScheme} style={{ width: 180 }}
                  options={[
                    { value: "Jmol", label: "Element Colors (Jmol)" },
                    { value: "Rasmol", label: "Element Colors (Rasmol)" },
                    { value: "default", label: "Default" },
                    { value: "mono", label: "Monochrome" },
                  ]}
                />
                {colorScheme === "mono" && (
                  <input type="color" value={monoColor} onChange={(e)=>setMonoColor(e.target.value)} style={{ marginLeft: 8, verticalAlign: "middle" }} />
                )}
              </div>
            </div>
          </Panel>
        </Collapse>
      </div>

      {/* 3D viewer (fullscreen capable) */}
      <div ref={wrapperRef} style={{ flex: 1, minHeight: 260, padding: 6 }}>
        {loading ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><Spin /></div>
        ) : cif ? (
          <CrystalViewer
            cifOrPoscar={cif}
            mode={mode}
            stickRadius={stickRadius}
            sphereScale={sphereScale}
            colorScheme={colorScheme}
            monoColor={monoColor}
            supercell={supercell}
            background={background}
            containerRef={wrapperRef}
          />
        ) : (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#8c8c8c" }}>
            No valid CIF (check backend response)
          </div>
        )}
      </div>
    </div>
  );
}
