import { forward } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 20_000) return Response.json({ detail: "Request too large" }, { status: 413 });
  return forward("/api/v1/generate-seo-campaign", { method: "POST", body });
}

export async function GET() {
  return forward("/api/v1/runs");
}
