import fs from "node:fs";
import { NextResponse } from "next/server";
import {
  deleteInsuranceDocument,
  getInsuranceDocument,
  insuranceDocumentFile,
  setInsuranceDocumentKind,
} from "@/server/db/queries/insurance";
import { parseDocumentKind } from "@/server/lib/insurance-input";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

/** Streams the stored file inline. The path comes from the row, never from the request. */
export async function GET(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { docId } = await params;
  const doc = getInsuranceDocument(workspaceId, Number(docId));
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  const file = insuranceDocumentFile(workspaceId, doc);
  if (!file) return NextResponse.json({ error: "file is missing" }, { status: 404 });
  return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
    headers: {
      "content-type": doc.mime,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
      "cache-control": "private, no-store",
    },
  });
}

/** Body: { kind } — policy | appendix | renewal | claim | other. */
export async function PATCH(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { docId } = await params;
  const body = await request.json().catch(() => null);
  const kind = parseDocumentKind((body as { kind?: unknown } | null)?.kind);
  if (!kind) return NextResponse.json({ error: "bad kind" }, { status: 400 });
  return setInsuranceDocumentKind(workspaceId, Number(docId), kind)
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ docId: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { docId } = await params;
  return deleteInsuranceDocument(workspaceId, Number(docId))
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
