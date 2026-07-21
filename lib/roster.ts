export type PoskoKey =
  | "MERAUKE KOTA"
  | "KUPRIK"
  | "KURIK"
  | "TANAH MERAH"
  | "KEPI";

export const ULP_ORDER: { key: PoskoKey; label: string; emoji: string; regu: string[] }[] = [
  {
    key: "MERAUKE KOTA",
    label: "ULP Merauke Kota",
    emoji: "1️⃣",
    regu: ["MARO26", "MARO27", "MARO29", "MERAUKE13", "MERAUKE21", "MERAUKE23"],
  },
  {
    key: "KUPRIK",
    label: "ULP Kuprik",
    emoji: "2️⃣",
    regu: ["KUPRIK11", "KUPRIK12", "KUPRIK21", "KUPRIK22"],
  },
  {
    key: "KURIK",
    label: "ULP Kurik",
    emoji: "3️⃣",
    regu: ["KURIK11", "KURIK21", "KURIK22"],
  },
  {
    key: "TANAH MERAH",
    label: "ULP Tanah Merah",
    emoji: "4️⃣",
    regu: ["TANMER11", "TANMER21"],
  },
  {
    key: "KEPI",
    label: "ULP Kepi",
    emoji: "5️⃣",
    regu: ["KEPI11"],
  },
];

// MERAUKE11 dan MERAUKE22 tidak lagi direkap sebagai regu tersendiri — gabungkan
// perhitungannya ke MARO26 dan MARO29 (setelah dinormalisasi lewat normRegu).
export const REGU_ALIAS: Record<string, string> = {
  MERAUKE11: "MARO26",
  MERAUKE22: "MARO29",
};

export function normRegu(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, "").trim().toUpperCase();
}

// Posko column values seen: "POSKO ULP KEPI", "ULP KEPI", "POSKO ULP MERAUKE KOTA", "ULP MERAUKE KOTA", etc.
export function normPosko(s: string | null | undefined): PoskoKey | null {
  const p = (s ?? "")
    .trim()
    .toUpperCase()
    .replace(/^POSKO\s+/, "")
    .replace(/^ULP\s+/, "")
    .trim();
  const found = ULP_ORDER.find((u) => u.key === p);
  return found ? found.key : null;
}

export const SHIFT_ORDER: ("Pagi" | "Sore" | "Malam")[] = ["Pagi", "Sore", "Malam"];

// Shift ditentukan dari jam Check In Petugas (waktu WIT), bukan dari kolom "Shif"
// maupun jam pengerjaan/selesai — keduanya tidak reliable. Batas ini dilebarkan
// (safety-margin) untuk mengakomodasi petugas yang datang lebih awal / serah terima
// piket yang molor: Pagi 05:30–11:59, Sore 12:00–18:00, Malam 18:01–05:29 (lintas
// tengah malam).
export function shiftFromMinutes(minutesOfDay: number): "Pagi" | "Sore" | "Malam" {
  const PAGI_START = 5 * 60 + 30; // 05:30
  const SORE_START = 12 * 60; // 12:00
  const SORE_END = 18 * 60; // 18:00 (inklusif)
  if (minutesOfDay >= PAGI_START && minutesOfDay < SORE_START) return "Pagi";
  if (minutesOfDay >= SORE_START && minutesOfDay <= SORE_END) return "Sore";
  return "Malam";
}
