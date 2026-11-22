import fs from "node:fs";
import { NextResponse } from "next/server";
import { deleteReceipt, getReceipt, receiptFile } from "@/server/db/queries/receipts";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

/** Streams the stored receipt inline. The path comes from the row, never from the request. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ws = getWorkspaceIdFromRequest(request);
  const r = getReceipt(ws, Number((await params).id));
  const file = r && receiptFile(ws, r);
  if (!r || !file) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: { "content-type": r.mime, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(r.originalName)}`, "cache-control": "private, no-store" },
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return deleteReceipt(getWorkspaceIdFromRequest(request), Number((await params).id))
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
