
import { forwardRaw } from "@/lib/backend";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID.test(id)) {
    return Response.json({ detail: "Invalid run id" }, { status: 400 });
  }

  const format = new URL(req.url).searchParams.get("format") ?? "html";

  if (!["md", "html", "json"].includes(format)) {
    return Response.json({ detail: "Invalid format" }, { status: 400 });
  }

  return forwardRaw(`/api/v1/runs/${id}/export?format=${format}`);
}
