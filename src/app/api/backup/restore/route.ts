import { NextResponse } from "next/server";
import { applyBackup, MIN_PASSPHRASE } from "@/server/lib/portable-backup";

/**
 * Restores a backup: multipart { file, passphrase }. The passphrase must open the file, and the
 * contents must be a Penny database, before anything is replaced. The current database is copied
 * to data/backups first, so this is undoable.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "badForm" }, { status: 400 });
  const file = form.get("file");
  const passphrase = typeof form.get("passphrase") === "string" ? String(form.get("passphrase")) : "";
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "fileRequired" }, { status: 400 });
  if (passphrase.length < MIN_PASSPHRASE) return NextResponse.json({ error: "weakPassphrase" }, { status: 400 });
  try {
    const result = applyBackup(Buffer.from(await file.arrayBuffer()), passphrase);
    return NextResponse.json(result);
  } catch (e) {
    const code = e instanceof Error ? e.message : "restoreFailed";
    const status = code === "badPassphrase" ? 401 : 400;
    return NextResponse.json({ error: code }, { status });
  }
}
