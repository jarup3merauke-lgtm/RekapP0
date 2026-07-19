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

// Shift ditentukan dari jam pengerjaan (waktu WIT), bukan dari kolom "Shif":
// Pagi 08:00–14:59, Sore 15:00–21:59, Malam 22:00–07:59 (lintas tengah malam).
export function shiftFromHour(hour: number): "Pagi" | "Sore" | "Malam" {
  if (hour >= 8 && hour < 15) return "Pagi";
  if (hour >= 15 && hour < 22) return "Sore";
  return "Malam";
}
