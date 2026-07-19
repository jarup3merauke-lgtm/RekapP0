# Rekap P0

Website untuk otomatisasi rekap harian P0 (lookup No Tugas APKT EIS vs Appsheets) per ULP, UP3 Merauke.

Alur pakai:
1. Drop file **CICO** (Laporan Detail Check In Check Out, hasil tarikan APKT EIS — kolom "No Tugas").
2. Drop file **P0 Merauke** (hasil tarikan Appsheets — kolom "NO P0" & "FOTO SESUDAH").
3. Pilih tanggal laporan (otomatis terisi dari tanggal yang tersedia di file CICO).
4. Klik **Preview** untuk melihat 5 pesan (1 per ULP) sebelum dikirim.
5. Klik **Kirim WhatsApp** untuk mengirim ke-5 pesan tersebut secara berurutan via [Fonnte](https://fonnte.com).

## Aturan pengecekan

Untuk setiap "No Tugas" pada tanggal terpilih (posko & regu diambil dari file CICO):

- ✅ **Sudah input Appsheets**: No Tugas ditemukan di file P0 Merauke DAN kolom "FOTO SESUDAH" terisi.
- ⚠️ **Belum ada eviden**: No Tugas ditemukan di file P0 Merauke TAPI kolom "FOTO SESUDAH" kosong.
- ❌ **Belum input Appsheets**: No Tugas TIDAK ditemukan sama sekali di file P0 Merauke.

Lookup No Tugas dicek gabungan di kedua sheet file P0 Merauke ("P0 Harian" dan "P0 Terencana"), dan case-insensitive (No Tugas/NO P0 disamakan ke huruf besar sebelum dibandingkan).

Shift (Pagi/Sore/Malam) dihitung dari **jam pada kolom "Tgl Pengerjaan"** di file CICO — bukan dari kolom "Shif", karena kolom itu tidak selalu akurat. Timestamp di file CICO (APKT EIS) tercatat dalam WIB, sedangkan UP3 Merauke beroperasi di WIT (WIB + 2 jam), jadi jamnya dikonversi dulu ke WIT (`lib/p0.ts` → `WIB_TO_WIT_OFFSET_HOURS`) sebelum dicocokkan ke batas shift berikut:
- Pagi: 08:00–14:59
- Sore: 15:00–21:59
- Malam: 22:00–07:59 (lintas tengah malam)

Regu yang tidak punya tugas pada tanggal & shift tertentu tetap ditampilkan dengan "nihil". Daftar regu tetap per ULP ada di `lib/roster.ts`.

Jika ada baris dengan posko/regu/shift yang tidak dikenali, sistem menampilkan warning di preview tapi tetap memproses baris lain.

## Setup lokal

```bash
npm install
cp .env.example .env.local   # isi FONNTE_TOKEN & FONNTE_TARGET
npm run dev
```

## Deploy ke Vercel

1. Import project ini di Vercel (repo terpisah, tidak berhubungan dengan project rating/rekap regu).
2. Di Project Settings > Environment Variables, tambahkan:
   - `FONNTE_TOKEN` — token device Fonnte kamu.
   - `FONNTE_TARGET` — nomor/ID grup WhatsApp tujuan.
3. Deploy.

## Struktur

- `app/page.tsx` — UI upload 2 file, pilih tanggal, preview, kirim, reset.
- `app/api/dates/route.ts` — baca daftar tanggal yang tersedia di file CICO.
- `app/api/preview/route.ts` — proses kedua file + tanggal, hasilkan 5 teks (belum dikirim).
- `app/api/send/route.ts` — kirim daftar teks yang sudah di-preview ke WhatsApp secara berurutan.
- `lib/p0.ts` — parsing Excel & logic lookup/pengelompokan regu+shift.
- `lib/roster.ts` — daftar tetap ULP, regu, dan fungsi penentu shift dari jam.
- `lib/dateId.ts` — helper format tanggal Indonesia.
- `lib/fonnte.ts` — pemanggilan API Fonnte.
