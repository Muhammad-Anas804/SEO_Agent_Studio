// Server-only helpers: forward requests to the FastAPI backend with the secret API key.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
const unreachable = () => Response.json({ detail: "Backend is unreachable" }, { status: 502 });

export async function forward(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.BACKEND_API_KEY ?? "",
      },
    });
    if (res.status === 204) return new Response(null, { status: 204 });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return unreachable();
  }
}

// For file downloads: passes the body, content type and filename through untouched.
export async function forwardRaw(path: string): Promise<Response> {
  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      cache: "no-store",
      headers: { "X-API-Key": process.env.BACKEND_API_KEY ?? "" },
    });
    const headers = new Headers({ "X-Content-Type-Options": "nosniff" });
    for (const name of ["content-type", "content-disposition"]) {
      const value = res.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(res.body, { status: res.status, headers });
  } catch {
    return unreachable();
  }
}
