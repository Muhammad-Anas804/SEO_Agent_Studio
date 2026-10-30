import { forward } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  return forward("/api/v1/kb/pages");
}

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 250_000) return Response.json({ detail: "Request too large" }, { status: 413 });
  return forward("/api/v1/kb/pages", { method: "POST", body });
}

export async function DELETE(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path.startsWith("/") || path.length > 200) return Response.json({ detail: "Invalid path" }, { status: 400 });
  return forward(`/api/v1/kb/pages?path=${encodeURIComponent(path)}`, { method: "DELETE" });
}
