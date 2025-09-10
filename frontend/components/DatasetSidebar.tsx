"use client";

import React, { useMemo, useState } from "react";
import { Input, List, Tag, Empty, Tooltip } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";

export type DatasetMeta = {
  dsid: string;
  title: string;
  count: number;
  created_at?: string;
  mode?: "tokens" | "cif";
};

// 映射：mode → 颜色 / 文案
const modeTagColor = (m?: "tokens" | "cif") =>
  m === "cif" ? "purple" : m === "tokens" ? "geekblue" : "default";
const modeLabel = (m?: "tokens" | "cif") => (m ? m.toUpperCase() : "N/A");
// 折叠态图标颜色（与 Tag 色系一致）
const modeIconColor = (m?: "tokens" | "cif") =>
  m === "cif" ? "#722ed1" : m === "tokens" ? "#2f54eb" : "#555";

function _DatasetSidebar({
  items, selected, onSelect, onReload, collapsed = false,
}: {
  items: DatasetMeta[];
  selected: string | null;
  onSelect: (dsid: string) => void;
  onReload?: () => void;
  collapsed?: boolean;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
  
    const arr = s
      ? items.filter(x =>
          x.title?.toLowerCase().includes(s) || x.dsid?.toLowerCase().includes(s)
        )
      : items.slice(); // 复制一份，避免原地排序
  
    // 按显示名（优先 title，其次 dsid）做自然排序（大小写不敏感，数字友好）
    arr.sort((a, b) => {
      const A = (a.title || a.dsid || "").toString();
      const B = (b.title || b.dsid || "").toString();
      const cmp = A.localeCompare(B, undefined, { numeric: true, sensitivity: "base" });
      // 同名时再用 dsid 稳定排序
      return cmp !== 0
        ? cmp
        : (a.dsid || "").localeCompare(b.dsid || "", undefined, { numeric: true, sensitivity: "base" });
    });
  
    return arr;
  }, [items, q]);
  

  if (collapsed) {
    // 折叠时仅显示图标按钮（用颜色区分模式，在 tooltip 展示详情）
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ height: 0 }} />
        <div style={{ overflow: "auto" }}>
          {filtered.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {filtered.map(d => {
                const active = d.dsid === selected;
                const tooltipText = `${d.title || d.dsid} · ${modeLabel(d.mode)} · ${d.count}`;
                return (
                  <Tooltip key={d.dsid} title={tooltipText}>
                    <button
                      onClick={() => onSelect(d.dsid)}
                      style={{
                        width: "100%",
                        height: 40,
                        borderRadius: 8,
                        border: active ? "1px solid #91caff" : "1px solid #f0f0f0",
                        background: active ? "#f0f7ff" : "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: active ? "#1677ff" : modeIconColor(d.mode),
                      }}
                    >
                      <DatabaseOutlined />
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} />
          )}
        </div>
      </div>
    );
  }

  // 展开状态：搜索 + 列表
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Input.Search
        placeholder="Search landscapes…"
        allowClear
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <div style={{ overflow: "auto" }}>
        {filtered.length ? (
          <List
            itemLayout="horizontal"
            dataSource={filtered}
            renderItem={(d) => {
              const active = d.dsid === selected;
              return (
                <List.Item
                  style={{
                    cursor: "pointer",
                    borderRadius: 10,
                    padding: "8px 10px",
                    background: active ? "#f0f7ff" : undefined,
                    border: active ? "1px solid #91caff" : "1px solid #f0f0f0",
                    marginBottom: 8,
                  }}
                  onClick={() => onSelect(d.dsid)}
                >
                  <List.Item.Meta
                    avatar={<DatabaseOutlined style={{ fontSize: 18, color: "#1677ff" }} />}
                    title={
                      <span
                        style={{
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {d.title || d.dsid}
                      </span>
                    }
                    description={
                      <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                        {d.created_at ? new Date(d.created_at).toLocaleString() : ""}
                      </span>
                    }
                  />
                  {/* 右侧：mode + count */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <Tag color={modeTagColor(d.mode)} style={{ marginRight: 0 }}>
                      {modeLabel(d.mode)}
                    </Tag>
                    <Tag color="blue" style={{ marginRight: 0 }}>{d.count}</Tag>
                  </div>
                </List.Item>
              );
            }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No matched landscape." />
        )}
      </div>
    </div>
  );
}

const DatasetSidebar = React.memo(_DatasetSidebar, (a, b) =>
  a.selected === b.selected && a.items === b.items && a.collapsed === b.collapsed
);
export default DatasetSidebar;
