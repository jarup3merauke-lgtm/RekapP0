const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// dateStr format: dd/mm/yyyy
export function formatIndonesianDate(dateStr: string): string {
  const [d, m, y] = dateStr.split("/").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = DAY_NAMES[dt.getUTCDay()];
  const monthName = MONTH_NAMES[m - 1];
  return `${dayName}, ${d} ${monthName}  ${y}`;
}

export function compareDdMmYyyyDesc(a: string, b: string): number {
  const [da, ma, ya] = a.split("/").map((n) => parseInt(n, 10));
  const [db, mb, yb] = b.split("/").map((n) => parseInt(n, 10));
  return (
    new Date(Date.UTC(yb, mb - 1, db)).getTime() - new Date(Date.UTC(ya, ma - 1, da)).getTime()
  );
}
