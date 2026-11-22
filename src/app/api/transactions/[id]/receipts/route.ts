import { NextResponse } from "next/server";
import { addReceipt, listReceipts, MAX_RECEIPT_FILE, RECEIPT_MIME } from "@/server/db/queries/receipts";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

const idOf = async (params: Promise<{ id: string }>) => { const n = Number((await params).id); return Number.isSafeInteger(n) && n > 0 ? n : null; };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  return NextResponse.json({ receipts: listReceipts(getWorkspaceIdFromRequest(request), id) });
}

/** Multipart form with one `file`: a PDF or an image. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = await idOf(params);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "a file is required" }, { status: 400 });
  if (!RECEIPT_MIME.includes(file.type)) return NextResponse.json({ error: "only PDF or image files" }, { status: 415 });
  if (file.size === 0) return NextResponse.json({ error: "empty file" }, { status: 400 });
  if (file.size > MAX_RECEIPT_FILE) return NextResponse.json({ error: "file is too large" }, { status: 413 });
  const receipt = addReceipt(getWorkspaceIdFromRequest(request), id, { name: file.name || "receipt", mime: file.type, data: Buffer.from(await file.arrayBuffer()) });
  return receipt ? NextResponse.json(receipt) : NextResponse.json({ error: "transaction not found" }, { status: 404 });
}
