import { NextRequest, NextResponse } from "next/server";
import { buildP0Reports } from "@/lib/p0";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Gagal membaca form data." }, { status: 400 });
  }

  const cico = formData.get("cico");
  const p0 = formData.get("p0");
  const date = formData.get("date");

  if (!(cico instanceof File)) {
    return NextResponse.json({ error: "File CICO tidak ditemukan." }, { status: 400 });
  }
  if (!(p0 instanceof File)) {
    return NextResponse.json({ error: "File P0 Merauke tidak ditemukan." }, { status: 400 });
  }
  if (typeof date !== "string" || !date) {
    return NextResponse.json({ error: "Tanggal belum dipilih." }, { status: 400 });
  }

  try {
    const cicoBuffer = await cico.arrayBuffer();
    const p0Buffer = await p0.arrayBuffer();
    const reports = buildP0Reports(cicoBuffer, p0Buffer, date);
    return NextResponse.json({ reports });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
