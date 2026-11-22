import { NextResponse } from "next/server";
import { addInsuranceDocument, INSURANCE_MIME, MAX_INSURANCE_FILE, setInsuranceDocumentKind } from "@/server/db/queries/insurance";
import { parseDocumentKind } from "@/server/lib/insurance-input";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

export const dynamic = "force-dynamic";

/** Multipart form: file, and an optional kind (policy | appendix | renewal | claim | other). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspaceId = getWorkspaceIdFromRequest(request);
  const { id } = await params;
  const policyId = Number(id);
  if (!Number.isInteger(policyId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "a file is required" }, { status: 400 });
  if (!INSURANCE_MIME.includes(file.type)) return NextResponse.json({ error: "only PDF or image files" }, { status: 415 });
  if (file.size === 0) return NextResponse.json({ error: "empty file" }, { status: 400 });
  if (file.size > MAX_INSURANCE_FILE) return NextResponse.json({ error: "file is too large" }, { status: 413 });

  const doc = addInsuranceDocument(workspaceId, policyId, {
    name: file.name || "document",
    mime: file.type,
    data: Buffer.from(await file.arrayBuffer()),
  });
  if (!doc) return NextResponse.json({ error: "policy not found" }, { status: 404 });
  const kind = parseDocumentKind(form.get("kind"));
  if (kind) {
    setInsuranceDocumentKind(workspaceId, doc.id, kind);
    doc.kind = kind;
  }
  return NextResponse.json(doc);
}
