"use client";
import { useEffect, useState } from "react";
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Pt = { id: string; name: string; x: number; y: number; label?: string };

export default function Page({ params }: { params: { dsid: string } }){
  const [pts, setPts] = useState<Pt[]>([]);
  const router = useRouter();

  useEffect(()=>{(async()=>{
    const r = await fetch(api(`/api/datasets/${params.dsid}/landscape`));
    if (r.ok) setPts(await r.json());
  })()},[params.dsid]);

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Landscape — {params.dsid}</h1>
      <div className="bg-white p-4 rounded-2xl shadow border overflow-auto">
        <ScatterChart width={900} height={540}>
          <CartesianGrid />
          <XAxis type="number" dataKey="x" name="Density" unit=" g/cm³" />
          <YAxis type="number" dataKey="y" name="Energy" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(v, n, p)=>[v, (p && (p.payload as any).name) || ""]}
            labelFormatter={(label)=>`Point`}
          />
          <Scatter data={pts} onClick={(p:any)=> router.push(`/datasets/${params.dsid}/structures/${p.name}`)} />
        </ScatterChart>
      </div>
    </main>
  );
}
