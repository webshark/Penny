import { NextResponse } from "next/server";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";
import { deletePensionConnection, listPensionConnections, savePensionConnection, startPensionSync } from "@/server/pension/sync";
import { deliverOtp } from "@/server/sync/otp-bridge";
import { otpKey } from "@/server/pension/sync";
import { isPensionFund, LOGIN_FIELDS } from "@/lib/pension";
import { demoBlockedResponse } from "@/server/demo/guard";

export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function GET(request: Request) {
  return NextResponse.json({ connections: listPensionConnections(getWorkspaceIdFromRequest(request)) });
}

/**
 * Body: { fundId, id, phone? } connects (and starts the first sync);
 * { sync: connectionId } re-syncs; { otp: connectionId, code } hands over the SMS code.
 */
export async function POST(request: Request) {
  // Sign-in and sync are off in the demo; the connections there are already seeded.
  const blocked = demoBlockedResponse();
  if (blocked) return blocked;

  const ws = getWorkspaceIdFromRequest(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad("invalid JSON");

  if (body.otp != null) {
    const id = Number(body.otp);
    const code = String(body.code ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !/^\d{4,8}$/.test(code)) return bad("needs a connection id and a 4-8 digit code");
    const r = deliverOtp(otpKey(id), ws, code);
    return r.ok ? NextResponse.json({ success: true }) : bad(r.reason ?? "no pending code request");
  }

  if (body.sync != null) {
    const id = Number(body.sync);
    if (!Number.isInteger(id) || id <= 0) return bad("invalid connection id");
    return NextResponse.json({ started: startPensionSync(ws, id) });
  }

  const fundId = String(body.fundId ?? "");
  if (!isPensionFund(fundId)) return bad("unsupported fund");
  const id = String(body.id ?? "").replace(/\D/g, "");
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (!/^\d{5,9}$/.test(id)) return bad("ID number must be 5-9 digits");
  if (LOGIN_FIELDS[fundId].includes("phone") && !/^0\d{8,9}$/.test(phone)) return bad("phone must be an Israeli number like 0501234567");
  const { id: connectionId } = savePensionConnection(ws, fundId, { id: id.padStart(9, "0"), ...(phone ? { phone } : {}) });
  startPensionSync(ws, connectionId);
  return NextResponse.json({ id: connectionId });
}

export async function DELETE(request: Request) {
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return bad("invalid connection id");
  deletePensionConnection(getWorkspaceIdFromRequest(request), id);
  return NextResponse.json({ success: true });
}
