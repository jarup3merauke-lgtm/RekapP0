export type PoskoKey =
  | "MERAUKE KOTA"
  | "KUPRIK"
  | "KURIK"
  | "TANAH MERAH"
  | "KEPI";

export const ULP_ORDER: { key: PoskoKey; label: string; regu: string[] }[] = [
  {
    key: "MERAUKE KOTA",
    label: "ULP Merauke Kota",
    regu: [
      "MARO26",
      "MARO27",
      "MARO29",
      "MERAUKE11",
      "MERAUKE13",
      "MERAUKE21",
      "MERAUKE22",
      "MERAUKE23",
    ],
  },
  {
    key: "KUPRIK",
    label: "ULP Kuprik",
    regu: ["KUPRIK11", "KUPRIK12", "KUPRIK21", "KUPRIK22"],
  },
  {
    key: "KURIK",
    label: "ULP Kurik",
    regu: ["KURIK11", "KURIK21", "KURIK22"],
  },
  {
    key: "TANAH MERAH",
    label: "ULP Tanah Merah",
    regu: ["TANMER11", "TANMER21"],
  },
  {
    key: "KEPI",
    label: "ULP Kepi",
    regu: ["KEPI11"],
  },
];

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

// Shift ditentukan dari jam pengerjaan (waktu WIT), bukan dari kolom "Shif". Batas ini
// dilebarkan untuk mengakomodasi serah terima piket yang molor di lapangan:
// Pagi 05:30–11:59, Sore 12:00–18:00, Malam 18:01–05:29 (lintas tengah malam).
export function shiftFromMinutes(minutesOfDay: number): "Pagi" | "Sore" | "Malam" {
  const PAGI_START = 5 * 60 + 30; // 05:30
  const SORE_START = 12 * 60; // 12:00
  const SORE_END = 18 * 60; // 18:00 (inklusif)
  if (minutesOfDay >= PAGI_START && minutesOfDay < SORE_START) return "Pagi";
  if (minutesOfDay >= SORE_START && minutesOfDay <= SORE_END) return "Sore";
  return "Malam";
}
