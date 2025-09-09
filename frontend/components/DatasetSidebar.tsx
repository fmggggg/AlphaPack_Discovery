"use client";

import React, { useMemo, useState } from "react";
import { Input, List, Tag, Empty, Tooltip } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";

type DatasetMeta = { dsid: string; title: string; count: number; created_at?: string };

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
    if (!s) return items;
    return items.filter(x =>
      x.title?.toLowerCase().includes(s) || x.dsid?.toLowerCase().includes(s)
    );
  }, [items, q]);

  if (collapsed) {
    // 折叠时仅显示图标列表
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {/* 保持占位，避免布局跳动 */}
        <div style={{ height: 0 }} />
        <div style={{ overflow: "auto" }}>
          {filtered.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {filtered.map(d => {
                const active = d.dsid === selected;
                return (
                  <Tooltip key={d.dsid} title={`${d.title || d.dsid}（${d.count}）`}>
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
                        color: active ? "#1677ff" : "#555",
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
                    title={<span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.title || d.dsid}</span>}
                    description={
                      <span style={{ color: "#8c8c8c", fontSize: 12 }}>
                        {d.created_at ? new Date(d.created_at).toLocaleString() : ""}
                      </span>
                    }
                  />
                  <Tag color="blue">{d.count}</Tag>
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
