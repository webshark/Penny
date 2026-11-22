import { NextResponse } from "next/server";
import { getAutoBackupConfig, runAutoBackup, updateAutoBackupConfig } from "@/server/lib/auto-backup";
import { spawn } from "node:child_process";
import fs from "node:fs";

export const dynamic = "force-dynamic";
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "invalid" }, { status: 400 });

/** Settings and last result; never the passphrase. */
export async function GET() {
  return NextResponse.json(getAutoBackupConfig());
}

/** { enabled?, frequency?, dir?, passphrase? } */
export async function PATCH(request: Request) {
  try {
    return NextResponse.json(updateAutoBackupConfig(await request.json()));
  } catch (e) {
    return fail(e);
  }
}

/** { action: "run" } backs up now; { action: "open" } opens the folder. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action === "run") return NextResponse.json(runAutoBackup());
  if (body.action === "open") {
    const dir = getAutoBackupConfig().dir;
    fs.mkdirSync(dir, { recursive: true });
    const cmd = process.platform === "win32" ? "explorer" : process.platform === "darwin" ? "open" : "xdg-open";
    spawn(cmd, [dir], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
    return NextResponse.json(getAutoBackupConfig());
  }
  return fail(new Error("unknown action"));
}
