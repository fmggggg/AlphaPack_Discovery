"use client";
import { useEffect, useState } from "react";
import CrystalViewer from "@/components/CrystalViewer";
import { api } from "@/lib/api";
import Link from "next/link";

export default function Page({ params }: { params: { dsid: string; name: string } }){
  const [text, setText] = useState<string>("");
  const [err, setErr] = useState<string>("");

  useEffect(()=>{(async()=>{
    try{
      const r = await fetch(api(`/api/crystals/${params.dsid}/${params.name}/cif`));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setText(await r.text());
    }catch(e:any){
      setErr(e.message||"failed");
    }
  })()},[params.dsid, params.name]);

  if (err) return <main className="p-6 text-red-600">加载失败：{err}</main>;
  if (!text) return <main className="p-6">Loading...</main>;

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{params.name}</h1>
        <Link className="underline text-sm" href={`/datasets/${params.dsid}/landscape`}>← 返回 Landscape</Link>
      </div>
      <CrystalViewer cifOrPoscar={text} />
    </main>
  );
}
