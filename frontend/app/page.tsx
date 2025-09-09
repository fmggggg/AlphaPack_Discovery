"use client";

import { useEffect, useState } from "react";
import { Layout, Button, message, Grid } from "antd";
import { UploadOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";
import DatasetSidebar from "@/components/DatasetSidebar";
import LandscapeViewer from "@/components/LandscapeViewer";

import dynamic from "next/dynamic";
const UploadDialog = dynamic(() => import("@/components/UploadDialog"), { ssr: false });


type DatasetMeta = { dsid: string; title: string; count: number; created_at?: string };
const { Sider, Content } = Layout;
const { useBreakpoint } = Grid;

export default function Home() {
  const screens = useBreakpoint();
  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const loadDatasets = async () => {
    try {
      const r = await fetch(api("/api/datasets"));
      if (!r.ok) throw new Error("无法获取数据集列表");
      const d = await r.json();
      setDatasets(d);
      if (!selected && d.length) setSelected(d[0].dsid);
    } catch (e: any) {
      message.error(e.message || "加载失败");
    }
  };

  useEffect(() => { loadDatasets(); }, []);

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
        }}
        theme="light"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, borderBottom: "1px solid #f0f0f0" }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
          {!collapsed && (
            <Button
              type="primary"
              icon={<UploadOutlined />}
              onClick={() => setUploadOpen(true)}
            >
              上传数据集
            </Button>
          )}
        </div>

        <div style={{ height: "calc(100% - 49px)", overflow: "auto", padding: 8 }}>
          <DatasetSidebar
            items={datasets}
            selected={selected}
            onSelect={setSelected}
            onReload={loadDatasets}
            collapsed={collapsed}
          />
        </div>
      </Sider>

      <Content
        style={{
          background: "#f6f7f9",
          padding: 0,
          height: "100%",
        }}
      >
        <div style={{ height: "100%", padding: 16 }}>
          {selected ? (
            <div
              style={{
                background: "#fff",
                border: "1px solid #f0f0f0",
                borderRadius: 12,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #f0f0f0",
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ fontWeight: 600 }}>Landscape — {selected}</div>
                <div style={{ color: "#8c8c8c", fontSize: 12 }}>X: Density (g/cm³) · Y: Energy</div>
              </div>
              <div style={{ flex: 1, minHeight: 300, padding: 8 }}>
                <LandscapeViewer dsid={selected} />
              </div>
            </div>
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
              请选择左侧的数据集
            </div>
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
