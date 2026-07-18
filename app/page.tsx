"use client";

import { useCallback, useState } from "react";

type Stage = "idle" | "reading-dates" | "ready" | "previewing" | "previewed" | "sending" | "sent";

interface UlpReport {
  key: string;
  label: string;
  text: string;
  warnings: string[];
}

interface SendResult {
  key: string;
  label: string;
  ok: boolean;
  error?: string;
}

function FileDrop({
  label,
  file,
  onFile,
}: {
  label: string;
  file: File | null;
  onFile: (f: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-black dark:text-zinc-100">
        {label}
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        onClick={() => document.getElementById(`input-${label}`)?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <input
          id={`input-${label}`}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {file ? file.name : "Klik atau drag & drop file ke sini"}
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  const [cicoFile, setCicoFile] = useState<File | null>(null);
  const [p0File, setP0File] = useState<File | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<UlpReport[]>([]);
  const [sendResults, setSendResults] = useState<SendResult[]>([]);

  const handleCicoFile = useCallback(async (f: File) => {
    setCicoFile(f);
    setError(null);
    setStage("reading-dates");
    setDates([]);
    setReports([]);
    try {
      const fd = new FormData();
      fd.append("cico", f);
      const res = await fetch("/api/dates", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setStage("idle");
        return;
      }
      setDates(data.dates);
      setSelectedDate(data.dates[0]);
      setStage("ready");
    } catch (e) {
      setError((e as Error).message);
      setStage("idle");
    }
  }, []);

  const handlePreview = async () => {
    if (!cicoFile || !p0File || !selectedDate) return;
    setStage("previewing");
    setError(null);
    setSendResults([]);
    try {
      const fd = new FormData();
      fd.append("cico", cicoFile);
      fd.append("p0", p0File);
      fd.append("date", selectedDate);
      const res = await fetch("/api/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        setStage("ready");
        return;
      }
      setReports(data.reports);
      setStage("previewed");
    } catch (e) {
      setError((e as Error).message);
      setStage("ready");
    }
  };

  const handleSend = async () => {
    if (reports.length === 0) return;
    setStage("sending");
    setError(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: reports.map((r) => ({ key: r.key, label: r.label, text: r.text })),
        }),
      });
      const data = await res.json();
      setSendResults(data.results ?? []);
      if (!res.ok && !data.results) {
        setError(data.error);
        setStage("previewed");
        return;
      }
      setStage("sent");
    } catch (e) {
      setError((e as Error).message);
      setStage("previewed");
    }
  };

  const reset = () => {
    setCicoFile(null);
    setP0File(null);
    setDates([]);
    setSelectedDate("");
    setStage("idle");
    setError(null);
    setReports([]);
    setSendResults([]);
  };

  const canPreview = cicoFile && p0File && selectedDate && stage !== "previewing" && stage !== "sending";
  const canSend = stage === "previewed" && reports.length > 0;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black min-h-screen">
      <main className="flex w-full max-w-2xl flex-col gap-6 py-16 px-6">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Rekap Harian P0 per ULP
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Drop file CICO (No Tugas) &amp; file P0 Merauke (Appsheets), pilih tanggal, preview,
            lalu kirim ke WhatsApp. Laporan dikirim terpisah per ULP (5 pesan).
          </p>
        </div>

        <FileDrop label="File CICO (No Tugas)" file={cicoFile} onFile={handleCicoFile} />
        <FileDrop label="File P0 Merauke (Appsheets)" file={p0File} onFile={setP0File} />

        {stage === "reading-dates" && (
          <p className="text-sm text-zinc-500">Membaca tanggal yang tersedia...</p>
        )}

        {dates.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-black dark:text-zinc-100">
              Pilih tanggal laporan
            </label>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              disabled={stage === "previewing" || stage === "sending"}
              className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black px-3 py-2 text-sm text-black dark:text-zinc-100"
            >
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            disabled={!canPreview}
            onClick={handlePreview}
            className="flex-1 rounded-full bg-foreground px-5 py-3 text-background font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors"
          >
            {stage === "previewing" ? "Memuat preview..." : "Preview"}
          </button>
          <button
            disabled={!canSend}
            onClick={handleSend}
            className="flex-1 rounded-full bg-green-600 px-5 py-3 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-green-700 transition-colors"
          >
            {stage === "sending" ? "Mengirim..." : "Kirim WhatsApp"}
          </button>
          {(cicoFile || p0File) && (
            <button
              onClick={reset}
              disabled={stage === "previewing" || stage === "sending"}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-5 py-3 text-sm font-medium text-black dark:text-zinc-100"
            >
              Reset
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4">
            <p className="font-medium text-red-800 dark:text-red-300">❌ {error}</p>
          </div>
        )}

        {sendResults.length > 0 && (
          <div className="rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800 p-4">
            <p className="font-medium text-green-800 dark:text-green-300 mb-2">
              Hasil pengiriman WhatsApp:
            </p>
            <ul className="text-sm flex flex-col gap-1">
              {sendResults.map((r) => (
                <li key={r.key} className={r.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
                  {r.ok ? "✅" : "❌"} {r.label} {r.error ? `— ${r.error}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {reports.length > 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-black dark:text-zinc-100">
              Preview ({reports.length} pesan, 1 per ULP):
            </p>
            {reports.map((r) => (
              <div
                key={r.key}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4"
              >
                <p className="mb-2 text-sm font-semibold text-black dark:text-zinc-100">
                  {r.label}
                </p>
                {r.warnings.length > 0 && (
                  <ul className="mb-2 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                    {r.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                )}
                <pre className="whitespace-pre-wrap rounded-lg bg-white dark:bg-black p-3 text-xs text-black dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800">
                  {r.text}
                </pre>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
