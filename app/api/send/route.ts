import { NextRequest, NextResponse } from "next/server";
import { sendWhatsapp } from "@/lib/fonnte";

export const runtime = "nodejs";
export const maxDuration = 60;

interface SendItem {
  key: string;
  label: string;
  text: string;
}

export async function POST(req: NextRequest) {
  let body: { items?: SendItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Gagal membaca body request." }, { status: 400 });
  }

  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Tidak ada pesan yang dikirim." }, { status: 400 });
  }

  const results: { key: string; label: string; ok: boolean; error?: string }[] = [];

  for (const item of items) {
    try {
      const res = await sendWhatsapp(item.text);
      results.push({ key: item.key, label: item.label, ok: res.ok, error: res.ok ? undefined : JSON.stringify(res.body) });
    } catch (e) {
      results.push({ key: item.key, label: item.label, ok: false, error: (e as Error).message });
    }
  }

  const allOk = results.every((r) => r.ok);
  return NextResponse.json({ success: allOk, results }, { status: allOk ? 200 : 502 });
}
