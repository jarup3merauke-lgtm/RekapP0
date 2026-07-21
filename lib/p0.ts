import * as XLSX from "xlsx";
import { ULP_ORDER, normRegu, normPosko, shiftFromMinutes, SHIFT_ORDER, REGU_ALIAS, type PoskoKey } from "./roster";
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

// ---------- CICO (No Tugas / Nama Regu / Posko / Check In Petugas) ----------

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
  checkIn: number;
}

function resolveCicoCols(header: unknown[]): CicoCols {
  const idx = (name: string) => header.findIndex((h) => normHeader(h) === name);
  const cols: CicoCols = {
    posko: idx("posko"),
    noTugas: idx("no tugas"),
    namaRegu: idx("nama regu"),
    checkIn: idx("check in petugas"),
  };
  for (const [k, v] of Object.entries(cols)) {
    if (v === -1) throw new Error(`Kolom "${k}" tidak ditemukan di file CICO.`);
  }
  return cols;
}

// Timestamp di file CICO (APKT EIS) tercatat dalam WIB (UTC+7), sedangkan UP3 Merauke
// beroperasi di WIT (UTC+9) — tambahkan 2 jam supaya cocok dengan batas shift waktu WIT.
const WIB_TO_WIT_OFFSET_MS = 2 * 60 * 60 * 1000;
const MALAM_TAIL_MAX_MINUTES = 5 * 60 + 29; // 05:29 WIT: ekor shift malam setelah tengah malam

// Parse "dd/mm/yyyy HH:MM(:SS)" jadi Date UTC (dipakai sebagai jam "naif", tanpa
// interferensi timezone environment). Return null kalau tidak bisa diparse.
function parseWibDateTime(s: string): Date | null {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, d, mo, y, h, mi, sec] = m;
  return new Date(
    Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), parseInt(h, 10), parseInt(mi, 10), sec ? parseInt(sec, 10) : 0)
  );
}

function fmtDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

// Dari jam Check In Petugas (WIB), tentukan shift + tanggal operasional (WIT).
function resolveShiftAndDate(checkInWib: Date): {
  shift: "Pagi" | "Sore" | "Malam";
  operationalDate: string;
} {
  const wit = new Date(checkInWib.getTime() + WIB_TO_WIT_OFFSET_MS);
  const witMinutes = wit.getUTCHours() * 60 + wit.getUTCMinutes();
  const shift = shiftFromMinutes(witMinutes);
  const opDate = new Date(wit.getTime());
  // Check-in di 00:00–05:29 WIT = ekor shift malam yang mulai malam sebelumnya →
  // tanggal operasionalnya hari sebelumnya.
  if (witMinutes <= MALAM_TAIL_MAX_MINUTES) {
    opDate.setUTCDate(opDate.getUTCDate() - 1);
  }
  return { shift, operationalDate: fmtDate(opDate) };
}

interface TaskRecord {
  noTugas: string;
  posko: string;
  namaRegu: string;
  shift: "Pagi" | "Sore" | "Malam";
  operationalDate: string; // dd/mm/yyyy
}

// Kumpulkan per No Tugas: pakai Check In Petugas PALING AWAL di antara semua barisnya
// sebagai anchor penentu shift & tanggal operasional. posko/regu diambil dari baris
// dengan check-in paling awal itu.
function buildTaskRecords(buffer: ArrayBuffer): {
  records: TaskRecord[];
  noCheckIn: string[];
} {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const rows = sheetToGrid(wb.Sheets[wb.SheetNames[0]]);
  const headerIdx = findCicoHeaderRow(rows);
  const cols = resolveCicoCols(rows[headerIdx]);

  const earliest = new Map<
    string,
    { checkIn: Date | null; posko: string; namaRegu: string; anyPosko: string }
  >();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const noTugas = normText(row[cols.noTugas]);
    if (!noTugas) continue;
    const posko = normText(row[cols.posko]);
    const namaRegu = normText(row[cols.namaRegu]);
    const checkIn = parseWibDateTime(normText(row[cols.checkIn]));

    const cur = earliest.get(noTugas);
    if (!cur) {
      earliest.set(noTugas, { checkIn, posko, namaRegu, anyPosko: posko });
      continue;
    }
    if (checkIn && (!cur.checkIn || checkIn.getTime() < cur.checkIn.getTime())) {
      cur.checkIn = checkIn;
      cur.posko = posko;
      cur.namaRegu = namaRegu;
    }
    if (!cur.anyPosko && posko) cur.anyPosko = posko;
  }

  const records: TaskRecord[] = [];
  const noCheckIn: string[] = [];
  for (const [noTugas, info] of earliest) {
    if (!info.checkIn) {
      noCheckIn.push(noTugas);
      continue;
    }
    const { shift, operationalDate } = resolveShiftAndDate(info.checkIn);
    records.push({
      noTugas,
      posko: info.posko || info.anyPosko,
      namaRegu: info.namaRegu,
      shift,
      operationalDate,
    });
  }
  return { records, noCheckIn };
}

export function listAvailableDates(cicoBuffer: ArrayBuffer): string[] {
  const { records } = buildTaskRecords(cicoBuffer);
  const dates = new Set(records.map((r) => r.operationalDate));
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
  const { records, noCheckIn } = buildTaskRecords(cicoBuffer);
  const p0Lookup = buildP0Lookup(p0Buffer);

  const forDate = records.filter((r) => r.operationalDate === targetDate);

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

  for (const r of forDate) {
    const poskoKey = normPosko(r.posko);
    if (!poskoKey) {
      globalUnmatched.push(`${r.noTugas} (posko="${r.posko}")`);
      continue;
    }
    const ulp = ULP_ORDER.find((u) => u.key === poskoKey)!;
    const reguNormRaw = normRegu(r.namaRegu);
    const reguNorm = REGU_ALIAS[reguNormRaw] ?? reguNormRaw;
    const matchedRegu = ulp.regu.find((g) => normRegu(g) === reguNorm);
    if (!matchedRegu) {
      warningsByUlp
        .get(poskoKey)!
        .push(`Regu tidak dikenali: "${r.namaRegu}" (No Tugas ${r.noTugas}), diabaikan.`);
      continue;
    }
    const key = normNoTugas(r.noTugas);
    let mark: string;
    if (!p0Lookup.has(key)) mark = "❌";
    else if (!p0Lookup.get(key)) mark = "⚠️";
    else mark = "✅";

    buckets.get(poskoKey)!.get(matchedRegu)!.get(r.shift)!.push({ noTugas: r.noTugas, mark });
  }

  if (globalUnmatched.length > 0) {
    warningsByUlp.get(ULP_ORDER[0].key)!.push(
      `${globalUnmatched.length} No Tugas dengan posko tidak dikenali (diabaikan): ${globalUnmatched
        .slice(0, 5)
        .join("; ")}${globalUnmatched.length > 5 ? ", ..." : ""}`
    );
  }
  if (noCheckIn.length > 0) {
    warningsByUlp.get(ULP_ORDER[0].key)!.push(
      `${noCheckIn.length} No Tugas tidak punya "Check In Petugas" yang bisa dibaca sehingga tidak bisa ditentukan shift/tanggalnya (diabaikan): ${noCheckIn
        .slice(0, 5)
        .join("; ")}${noCheckIn.length > 5 ? ", ..." : ""}`
    );
  }

  const reports: UlpReport[] = [];
  for (const u of ULP_ORDER) {
    const lines: string[] = [];
    lines.push("*REKAP HARIAN P0*");
    lines.push(`${u.emoji} ULP ${u.key}`);
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
