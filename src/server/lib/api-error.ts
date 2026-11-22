import "server-only";

import { NextResponse } from "next/server";

/**
 * A failure the caller can fix: bad input, a missing id, a conflict. Its message is
 * written for the UI, and `code` lets the client pick its own wording.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Turns a thrown value into a response. Expected failures keep their status and copy;
 * anything else is a bug: it is logged with its stack and answered with a plain 500, so
 * an internal error never looks like the user's typing and internals never reach the UI.
 */
export function errorResponse(scope: string, error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      error.code ? { error: error.message, code: error.code } : { error: error.message },
      { status: error.status }
    );
  }
  console.error(`[${scope}]`, error instanceof Error ? (error.stack ?? error.message) : error);
  return NextResponse.json({ error: "Unable to complete the request" }, { status: 500 });
}
