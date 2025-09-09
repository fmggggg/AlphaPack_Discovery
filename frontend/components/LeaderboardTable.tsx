"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Table, Typography, Tag, Space, Select, Input, Button, Tooltip, Spin, Empty } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, InfoCircleOutlined, LinkOutlined } from "@ant-design/icons";
import { api } from "@/lib/api";

const { Text } = Typography;

type LBRow = {
  id: string;
  model: string;
  team?: string;
  metrics: Record<string, number>;
  submitted_at?: string;
  paper_url?: string;
  code_url?: string;
  // optional fields for visualization only (no backend coupling)
  dataset?: string;         // e.g., benchmark/dataset label
  zenodo?: string;          // external link to Zenodo record
};

export default function LeaderboardTable() {
  const [data, setData] = useState<LBRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<string>("");
  const [q, setQ] = useState("");

  // fetch leaderboard; fallback to public sample if API 404/500
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        let arr: LBRow[] = [];
        // try backend first
        try {
          const r = await fetch(api("/api/leaderboard"), { cache: "no-store" });
          if (r.ok) {
            arr = await r.json();
          } else {
            throw new Error("api/leaderboard not available");
          }
        } catch {
          // fallback to static file
          const r2 = await fetch("/leaderboard.sample.json", { cache: "no-store" });
          arr = r2.ok ? await r2.json() : [];
        }
        if (!alive) return;
        setData(arr);
        // pick default metric
        const setKeys = new Set<string>();
        arr.forEach(e => Object.keys(e.metrics || {}).forEach(k => setKeys.add(k)));
        const keys = Array.from(setKeys);
        setMetric(keys.includes("energy_mae") ? "energy_mae" : (keys[0] || ""));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const metricOptions = useMemo(() => {
    const s = new Set<string>();
    data.forEach(d => Object.keys(d.metrics || {}).forEach(k => s.add(k)));
    return Array.from(s).map(k => ({ label: k, value: k }));
  }, [data]);

  const filtered = useMemo(() => {
    if (!q) return data;
    const s = q.toLowerCase();
    return data.filter(d =>
      d.model.toLowerCase().includes(s) || (d.team || "").toLowerCase().includes(s)
    );
  }, [data, q]);

  const sorted = useMemo(() => {
    if (!metric) return filtered;
    return [...filtered].sort((a, b) => {
      const va = a.metrics?.[metric]; const vb = b.metrics?.[metric];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va - vb; // lower is better
    });
  }, [filtered, metric]);

  const rows = useMemo(() => sorted.map((e, i) => ({
    key: e.id,
    rank: i + 1,
    model: e.model,
    team: e.team || "-",
    metric_value: e.metrics?.[metric],
    submitted_at: e.submitted_at ? new Date(e.submitted_at).toLocaleDateString() : "-",
    dataset: e.dataset,      // optional tag
    zenodo: e.zenodo,        // optional link
    links: { paper: e.paper_url, code: e.code_url },
  })), [sorted, metric]);

  const columns: ColumnsType<(typeof rows)[number]> = [
    { title: "Rank", dataIndex: "rank", width: 72, sorter: (a,b)=>a.rank-b.rank },
    {
      title: "Model",
      dataIndex: "model",
      render: (t, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{t}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{r.team}</Text>
        </Space>
      )
    },
    {
      title: (
        <Space>
          Metric
          <Tooltip title="Lower is better"><InfoCircleOutlined /></Tooltip>
        </Space>
      ),
      dataIndex: "metric_value",
      sorter: (a,b)=> (a.metric_value??Infinity)-(b.metric_value??Infinity),
      render: (v, r) =>
        v == null ? <Text type="secondary">-</Text> :
        <Text strong style={{ color: r.rank===1 ? "#fa541c" : r.rank<=3 ? "#fa8c16" : undefined }}>
          {typeof v === "number" ? v.toPrecision(4) : v}
        </Text>
    },
    {
      title: "Dataset",
      dataIndex: "dataset",
      width: 160,
      render: (t, r) => t ? (
        <Space size="small">
          <Tag>{t}</Tag>
          {r.zenodo && (
            <a href={r.zenodo} target="_blank" title="View on Zenodo" rel="noreferrer">
              <LinkOutlined />
            </a>
          )}
        </Space>
      ) : (r.zenodo ? <a href={r.zenodo} target="_blank" rel="noreferrer"><LinkOutlined /> Zenodo</a> : <Text type="secondary">-</Text>)
    },
    { title: "Submitted", dataIndex: "submitted_at", width: 120 },
    {
      title: "Links",
      dataIndex: "links",
      width: 160,
      render: (links) => (
        <Space size="small">
          {links?.paper && <a href={links.paper} target="_blank" rel="noreferrer">Paper</a>}
          {links?.code && <a href={links.code} target="_blank" rel="noreferrer">Code</a>}
        </Space>
      )
    },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:8 }}>
        <Text strong>Leaderboard</Text>
        <Select
          size="small"
          value={metric}
          onChange={setMetric}
          style={{ width: 220 }}
          options={metricOptions}
          placeholder="Select metric"
        />
        <Input.Search
          allowClear
          placeholder="Search model / team"
          style={{ width: 260, marginLeft: "auto" }}
          onChange={(e)=>setQ(e.target.value)}
        />
      </div>

      <div style={{ flex:1, minHeight: 300 }}>
        {loading ? (
          <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Spin/>
          </div>
        ) : rows.length ? (
          <Table
            size="small"
            columns={columns}
            dataSource={rows}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            scroll={{ y: "calc(100vh - 360px)" }}
          />
        ) : (
          <Empty description="No submissions yet" />
        )}
      </div>
    </div>
  );
}
