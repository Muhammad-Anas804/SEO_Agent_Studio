
import { forward } from "@/lib/backend";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;

  if (!UUID.test(id)) {
    return Response.json({ detail: "Invalid run id" }, { status: 400 });
  }

  return forward(`/api/v1/runs/${id}`);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;

  if (!UUID.test(id)) {
    return Response.json({ detail: "Invalid run id" }, { status: 400 });
  }

  return forward(`/api/v1/runs/${id}`, { method: "DELETE" });
}
