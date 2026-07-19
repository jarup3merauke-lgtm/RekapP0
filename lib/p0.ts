import * as XLSX from "xlsx";
import { ULP_ORDER, normRegu, normPosko, shiftFromMinutes, SHIFT_ORDER, type PoskoKey } from "./roster";
import { formatIndonesianDate, compareDdMmYyyyDesc } from "./dateId";

const HEADER_SCAN_ROWS = 12;

function normHeader(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function normText(v: unknown): string {
  return String(v ?? "").trim();
}

function normNoTugas(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function sheetToGrid(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}

// ---------- CICO (No Tugas / Nama Regu / Shift / Posko / Tgl Catat) ----------

function findCicoHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(HEADER_SCAN_ROWS, rows.length); i++) {
    const normed = rows[i].map(normHeader);
    if (normed.includes("no tugas") && normed.includes("nama regu")) return i;
  }
  throw new Error(
    'Tidak menemukan baris header (kolom "No Tugas" & "Nama Regu") dalam 12 baris pertama. Pastikan ini file Laporan Detail Check In Check Out (CICO) untuk P0.'
  );
}

interface CicoCols {
  posko: number;
  noTugas: number;
  namaRegu: number;
  tglCatat: number;
  tglPengerjaan: number;
}

function resolveCicoCols(header: unknown[]): CicoCols {
  const idx = (name: string) => header.findIndex((h) => normHeader(h) === name);
  const cols: CicoCols = {
    posko: idx("posko"),
    noTugas: idx("no tugas"),
    namaRegu: idx("nama regu"),
    tglCatat: idx("tgl catat"),
    tglPengerjaan: idx("tgl pengerjaan"),
  };
  for (const [k, v] of Object.entries(cols)) {
    if (v === -1) throw new Error(`Kolom "${k}" tidak ditemukan di file CICO.`);
  }
  return cols;
}

interface CicoRow {
  posko: string;
  noTugas: string;
  namaRegu: string;
  tglCatatDate: string; // dd/mm/yyyy
  tglPengerjaanMinutes: number | null; // menit sejak 00:00 dari Tgl Pengerjaan, sudah dikonversi ke WIT
}

// Timestamp di file CICO (APKT EIS) tercatat dalam WIB (UTC+7), sedangkan UP3 Merauke
// beroperasi di WIT (UTC+9) — tambahkan 2 jam supaya cocok dengan batas shift waktu WIT.
const WIB_TO_WIT_OFFSET_MINUTES = 2 * 60;
const MINUTES_PER_DAY = 24 * 60;

function extractMinutesOfDay(datetimeStr: string): number | null {
  const m = datetimeStr.match(/\d{1,2}\/\d{1,2}\/\d{4}\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const wibMinutes = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return (wibMinutes + WIB_TO_WIT_OFFSET_MINUTES) % MINUTES_PER_DAY;
}

function extractCicoRows(buffer: ArrayBuffer): CicoRow[] {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const rows = sheetToGrid(wb.Sheets[wb.SheetNames[0]]);
  const headerIdx = findCicoHeaderRow(rows);
  const cols = resolveCicoCols(rows[headerIdx]);
  const out: CicoRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const noTugas = normText(row[cols.noTugas]);
    if (!noTugas) continue;
    const tglCatatRaw = normText(row[cols.tglCatat]);
    const datePart = tglCatatRaw.split(" ")[0];
    if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(datePart)) continue;
    out.push({
      posko: normText(row[cols.posko]),
      noTugas,
      namaRegu: normText(row[cols.namaRegu]),
      tglCatatDate: datePart,
      tglPengerjaanMinutes: extractMinutesOfDay(normText(row[cols.tglPengerjaan])),
    });
  }
  return out;
}

export function listAvailableDates(cicoBuffer: ArrayBuffer): string[] {
  const rows = extractCicoRows(cicoBuffer);
  const dates = new Set(rows.map((r) => r.tglCatatDate));
  return Array.from(dates).sort(compareDdMmYyyyDesc);
}

// ---------- P0 Merauke (NO P0 / FOTO SESUDAH), across all sheets ----------

function buildP0Lookup(buffer: ArrayBuffer): Map<string, boolean> {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const map = new Map<string, boolean>();
  for (const sheetName of wb.SheetNames) {
    const rows = sheetToGrid(wb.Sheets[sheetName]);
    if (rows.length === 0) continue;
    const header = rows[0].map(normHeader);
    const noIdx = header.indexOf("no p0");
    const fotoIdx = header.indexOf("foto sesudah");
    if (noIdx === -1 || fotoIdx === -1) continue;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const noP0 = row[noIdx];
      if (!noP0) continue;
      const key = normNoTugas(noP0);
      const foto = row[fotoIdx];
      const filled = foto !== null && foto !== undefined && String(foto).trim() !== "";
      map.set(key, (map.get(key) ?? false) || filled);
    }
  }
  return map;
}

// ---------- Report building ----------

export interface UlpReport {
  key: PoskoKey;
  label: string;
  text: string;
  warnings: string[];
}

export function buildP0Reports(
  cicoBuffer: ArrayBuffer,
  p0Buffer: ArrayBuffer,
  targetDate: string
): UlpReport[] {
  const cicoRows = extractCicoRows(cicoBuffer);
  const p0Lookup = buildP0Lookup(p0Buffer);

  const seen = new Map<string, CicoRow>();
  for (const r of cicoRows) {
    if (r.tglCatatDate !== targetDate) continue;
    if (!seen.has(r.noTugas)) seen.set(r.noTugas, r);
  }

  type Bucket = Map<string, Map<"Pagi" | "Sore" | "Malam", { noTugas: string; mark: string }[]>>;
  const buckets = new Map<PoskoKey, Bucket>();
  for (const u of ULP_ORDER) {
    const m: Bucket = new Map();
    for (const regu of u.regu) {
      m.set(regu, new Map([["Pagi", []], ["Sore", []], ["Malam", []]]));
    }
    buckets.set(u.key, m);
  }

  const warningsByUlp = new Map<PoskoKey, string[]>();
  for (const u of ULP_ORDER) warningsByUlp.set(u.key, []);
  const globalUnmatched: string[] = [];

  for (const r of seen.values()) {
    const poskoKey = normPosko(r.posko);
    if (!poskoKey) {
      globalUnmatched.push(`${r.noTugas} (posko="${r.posko}")`);
      continue;
    }
    const ulp = ULP_ORDER.find((u) => u.key === poskoKey)!;
    const reguNorm = normRegu(r.namaRegu);
    const matchedRegu = ulp.regu.find((g) => normRegu(g) === reguNorm);
    if (!matchedRegu) {
      warningsByUlp
        .get(poskoKey)!
        .push(`Regu tidak dikenali: "${r.namaRegu}" (No Tugas ${r.noTugas}), diabaikan.`);
      continue;
    }
    if (r.tglPengerjaanMinutes === null) {
      warningsByUlp
        .get(poskoKey)!
        .push(`Jam "Tgl Pengerjaan" tidak terbaca (No Tugas ${r.noTugas}), diabaikan.`);
      continue;
    }
    const shiftLabel = shiftFromMinutes(r.tglPengerjaanMinutes);
    const key = normNoTugas(r.noTugas);
    let mark: string;
    if (!p0Lookup.has(key)) mark = "❌";
    else if (!p0Lookup.get(key)) mark = "⚠️";
    else mark = "✅";

    buckets.get(poskoKey)!.get(matchedRegu)!.get(shiftLabel)!.push({ noTugas: r.noTugas, mark });
  }

  if (globalUnmatched.length > 0) {
    warningsByUlp.get(ULP_ORDER[0].key)!.push(
      `${globalUnmatched.length} baris dengan posko tidak dikenali (diabaikan): ${globalUnmatched
        .slice(0, 5)
        .join("; ")}${globalUnmatched.length > 5 ? ", ..." : ""}`
    );
  }

  const reports: UlpReport[] = [];
  for (const u of ULP_ORDER) {
    const lines: string[] = [];
    lines.push(`REKAP HARIAN P0 ULP ${u.label.replace(/^ULP /, "")}`);
    lines.push(formatIndonesianDate(targetDate));
    lines.push("");
    lines.push("✅ : Sudah input Appsheets");
    lines.push("❌ : Belum input Appsheets");
    lines.push("⚠️ : Belum ada eviden");
    lines.push("");

    const bucket = buckets.get(u.key)!;
    u.regu.forEach((regu, idx) => {
      lines.push(regu);
      const shiftMap = bucket.get(regu)!;
      for (const shift of SHIFT_ORDER) {
        lines.push(shift === "Malam" ? "Shift Malam" : `Shift ${shift}:`);
        const items = shiftMap.get(shift)!.sort((a, b) => a.noTugas.localeCompare(b.noTugas));
        if (items.length === 0) {
          lines.push("- nihil");
        } else {
          for (const item of items) lines.push(`- ${item.noTugas} ${item.mark}`);
        }
      }
      if (idx < u.regu.length - 1) lines.push("");
    });

    reports.push({
      key: u.key,
      label: u.label,
      text: lines.join("\n"),
      warnings: warningsByUlp.get(u.key)!,
    });
  }

  return reports;
}
