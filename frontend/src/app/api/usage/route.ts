import { forward } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  return forward("/api/v1/usage");
}
