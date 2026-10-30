import { forward } from "@/lib/backend";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  if (!UUID.test(params.id)) return Response.json({ detail: "Invalid run id" }, { status: 400 });
  return forward(`/api/v1/runs/${params.id}`);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!UUID.test(params.id)) return Response.json({ detail: "Invalid run id" }, { status: 400 });
  return forward(`/api/v1/runs/${params.id}`, { method: "DELETE" });
}
