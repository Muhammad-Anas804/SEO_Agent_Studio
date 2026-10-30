"use client";

import { useCallback, useState } from "react";

interface ToolState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** POSTs a JSON body. Pair it with useTool().run. */
export const postJson = (url: string, payload: unknown): Promise<Response> =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/**
 * Holds the loading / error / data state for one tool request.
 *
 *   const { data, error, loading, run } = useTool<AuditResult>();
 *   run(() => postJson("/api/audit", { url }));
 */
export function useTool<T>() {
  const [state, setState] = useState<ToolState<T>>({ data: null, error: null, loading: false });

  const run = useCallback(async (send: () => Promise<Response>) => {
    setState({ data: null, error: null, loading: true });
    try {
      const res = await send();
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
      }
      setState({ data: body as T, error: null, loading: false });
    } catch (err) {
      setState({ data: null, error: err instanceof Error ? err.message : "Something went wrong", loading: false });
    }
  }, []);

  return { ...state, run };
}