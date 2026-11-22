import { NextResponse } from "next/server";
import { createBackup, listBackups, MIN_PASSPHRASE } from "@/server/lib/portable-backup";

/** The encrypted backups already on disk. */
export async function GET() {
  return NextResponse.json({ backups: listBackups() });
}

/**
 * Creates one passphrase-encrypted backup file: { passphrase }. The response is the file itself,
 * so the browser downloads it and no copy is left in a temp folder.
 */
export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as { passphrase?: unknown };
  const passphrase = typeof body.passphrase === "string" ? body.passphrase : "";
  if (passphrase.length < MIN_PASSPHRASE) return NextResponse.json({ error: "weakPassphrase" }, { status: 400 });
  try {
    const { bytes, fileName } = createBackup(passphrase);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : "backupFailed";
    return NextResponse.json({ error: code }, { status: 500 });
  }
}
