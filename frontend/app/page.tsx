"use client";

import { useEffect, useState } from "react";
import { Layout, Button, message, Grid, Space } from "antd";
import {
  UploadOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/api";
import DatasetSidebar from "@/components/DatasetSidebar";
import dynamic from "next/dynamic";
const UploadDialog = dynamic(() => import("@/components/UploadDialog"), { ssr: false });
import DatasetLandscape from "@/components/DatasetLandscape";
import LeaderboardTable from "@/components/LeaderboardTable";

type DatasetMeta = { dsid: string; title: string; count: number; created_at?: string };
const { Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export default function Home() {
  const screens = useBreakpoint();
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<"landscape" | "leaderboard">("landscape");

  const loadDatasets = async () => {
    try {
      const r = await fetch(api("/api/datasets"));
      if (!r.ok) throw new Error("Failed to fetch dataset list");
      const d = await r.json();
      setDatasets(d);
      if (!selected && d.length) setSelected(d[0].dsid);
    } catch (e: any) {
      message.error(e.message || "Load failed");
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  return (
    <Layout style={{ height: "100vh" }}>
      <Sider
        breakpoint="lg"
        collapsible
        collapsed={collapsed}
        onCollapse={(v) => setCollapsed(v)}
        width={320}
        collapsedWidth={screens.md ? 56 : 0}
        style={{
          background: "#fff",
          borderRight: "1px solid #f0f0f0",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        theme="light"
      >
      {/* Brand bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 12px",
          height: 60,
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        {/* left: logo */}
        <img
          src="/alphapack.png"
          alt="AlphaPack logo"
          width={40}
          height={40}
          style={{ borderRadius: 8, flexShrink: 0, objectFit: "contain" }}
        />

        {/* center: title */}
        {!collapsed && (
          <div
            style={{
              flex: 1,
              textAlign: "center",
              fontWeight: 600,
              fontSize: 20,
              lineHeight: "40px", // 与 logo 视觉对齐
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title="AlphaPack Discovery"
          >
            AlphaPack Discovery
          </div>
        )}

        {/* right: spacer with same width as logo */}
        {!collapsed && <div style={{ width: 30, flexShrink: 0 }} />}
      </div>

        {/* Controls bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 8,
            borderBottom: "1px solid #f0f0f0",
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          {!collapsed ? (
            <Space>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={() => setUploadOpen(true)}
              >
                Upload
              </Button>
              <Button
                icon={<TrophyOutlined />}
                type={view === "leaderboard" ? "primary" : "default"}
                onClick={() =>
                  setView((v) => (v === "leaderboard" ? "landscape" : "leaderboard"))
                }
              >
                {view === "leaderboard" ? "Back to Landscape" : "Leaderboard"}
              </Button>
            </Space>
          ) : (
            <Space>
              <Button type="text" icon={<UploadOutlined />} onClick={() => setUploadOpen(true)} />
              <Button
                type="text"
                icon={<TrophyOutlined />}
                onClick={() =>
                  setView((v) => (v === "leaderboard" ? "landscape" : "leaderboard"))
                }
              />
            </Space>
          )}
        </div>

        {/* Dataset list */}
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 8 }}>
          <DatasetSidebar
            items={datasets}
            selected={selected}
            onSelect={(id) => {
              setSelected(id);
              setView("landscape"); // 点击列表时切回 Landscape
              setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
            }}
            onReload={loadDatasets}
            collapsed={collapsed}
          />
        </div>
      </Sider>

      <Content style={{ background: "#f6f7f9", padding: 0, height: "100%" }}>
        <div style={{ height: "100%", padding: 16 }}>
          {view === "landscape" ? (
            selected ? (
              <DatasetLandscape dsid={selected} />
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#8c8c8c",
                }}
              >
                Please select a landscape.
              </div>
            )
          ) : (
            <LeaderboardTable />
          )}
        </div>
      </Content>

      <UploadDialog
        open={uploadOpen}
        onClose={(ok, newId) => {
          setUploadOpen(false);
          if (ok) loadDatasets().then(() => newId && setSelected(newId));
        }}
      />
    </Layout>
  );
}
