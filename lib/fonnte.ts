export interface FonnteSendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

export async function sendWhatsapp(message: string): Promise<FonnteSendResult> {
  const token = process.env.FONNTE_TOKEN;
  const target = process.env.FONNTE_TARGET;

  if (!token) throw new Error("Env var FONNTE_TOKEN belum diset.");
  if (!target) throw new Error("Env var FONNTE_TARGET belum diset.");

  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ target, message }),
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = await res.text();
  }

  return { ok: res.ok, status: res.status, body };
}
