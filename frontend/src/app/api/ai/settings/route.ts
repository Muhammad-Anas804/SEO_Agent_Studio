import { forward } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  return forward("/api/v1/ai/settings");
}

export async function PUT(req: Request) {
  const body = await req.text();
  if (body.length > 10_000) return Response.json({ detail: "Request too large" }, { status: 413 });
  return forward("/api/v1/ai/settings", { method: "PUT", body });
}
