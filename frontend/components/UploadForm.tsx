"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export default function UploadForm(){
  const [molecule, setMolecule] = useState<File|null>(null);
  const [structures, setStructures] = useState<File|null>(null);
  const [dataset, setDataset] = useState<string>("");

  const [energyKey, setEnergyKey] = useState<string>("energy");   // 必填
  const [densityKey, setDensityKey] = useState<string>("");       // 可留空
  const [status, setStatus] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!molecule || !structures) { setStatus("请选择 molecule.xyz 和 structures.json"); return; }
    if (!energyKey) { setStatus("请填写 energy_key（如 energy）"); return; }
    setStatus("Uploading...");

    const fd = new FormData();
    fd.append("molecule", molecule);
    fd.append("structures", structures);
    fd.append("energy_key", energyKey);
    if (densityKey) fd.append("density_key", densityKey);
    if (dataset) fd.append("dataset", dataset);

    const r = await fetch(api("/api/datasets/upload"), { method: "POST", body: fd });
    if (!r.ok) { setStatus("上传失败"); return; }
    const d = await r.json();
    setStatus(`OK: ${d.dsid} (${d.count} entries)`);
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex gap-3 items-center">
        <label className="w-36">Dataset 名称</label>
        <input className="border p-2 rounded w-64" value={dataset} onChange={e=>setDataset(e.target.value)} placeholder="可留空自动生成" />
      </div>
      <div className="flex gap-3 items-center">
        <label className="w-36">molecule.xyz</label>
        <input type="file" accept=".xyz" onChange={e=>setMolecule(e.target.files?.[0]||null)} />
      </div>
      <div className="flex gap-3 items-center">
        <label className="w-36">structures.json</label>
        <input type="file" accept=".json" onChange={e=>setStructures(e.target.files?.[0]||null)} />
      </div>

      <div className="flex gap-3 items-center">
        <label className="w-36">energy_key（必填）</label>
        <input className="border p-2 rounded w-64" value={energyKey} onChange={e=>setEnergyKey(e.target.value)} placeholder="energy" />
      </div>
      <div className="flex gap-3 items-center">
        <label className="w-36">density_key（可选）</label>
        <input className="border p-2 rounded w-64" value={densityKey} onChange={e=>setDensityKey(e.target.value)} placeholder="如 density；留空则后台计算" />
      </div>

      <button className="px-4 py-2 rounded bg-black text-white">上传</button>
      <div className="text-sm text-neutral-600">{status}</div>
    </form>
  );
}
