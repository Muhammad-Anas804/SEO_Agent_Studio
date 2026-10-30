/**
 * Shared plumbing for the tool API routes.
 *
 *   export const POST = withGuards({ name: "audit" }, async (req) => { ... return result; });
 *
 * withGuards adds rate limiting, JSON output and error handling.
 */
import type { Check } from "@/types/tools";
import { ToolError } from "./errors";
import { isRateLimited } from "./rate-limit";

export function errorResponse(detail: string, status = 400): Response {
  return Response.json({ detail }, { status });
}

interface GuardOptions {
  /** Used to give each tool its own rate-limit bucket. */
  name: string;
  /** Max requests per minute per IP. Default 20. */
  limit?: number;
}

export function withGuards(options: GuardOptions, handler: (req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    if (isRateLimited(req, options.name, options.limit ?? 20)) {
      return errorResponse("Too many requests, try again in a minute", 429);
    }
    try {
      return Response.json(await handler(req));
    } catch (err) {
      if (err instanceof ToolError) return errorResponse(err.message, err.status);
      console.error(`[tool:${options.name}]`, err);
      return errorResponse("Something went wrong. Please try again.", 500);
    }
  };
}

/** Parses the request body as a JSON object, or throws a ToolError. */
export async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* fall through to the error below */
  }
  throw new ToolError("Invalid request");
}

export function requireString(body: Record<string, unknown>, key: string, message: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new ToolError(message);
  return value;
}

export function makeCheck(name: string, pass: boolean, detail: string, emerging = false): Check {
  return { name, pass, detail, emerging };
}

/** Percentage of checks that passed, rounded to a whole number. */
export function scoreChecks(checks: Check[]): number {
  if (checks.length === 0) return 0;
  return Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);
}