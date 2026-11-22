import { NextResponse } from "next/server";
import { getMerchantRows } from "@/server/db/queries/transactions";
import { getWorkspaceIdFromRequest } from "@/server/lib/workspace-context";

/** Every merchant with how often and how much, for Settings > Payees. */
export async function GET(request: Request) {
  return NextResponse.json({ merchants: getMerchantRows(getWorkspaceIdFromRequest(request)) });
}
