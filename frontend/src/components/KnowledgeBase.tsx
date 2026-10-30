"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { KBListing } from "@/types/seo";

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
    if (Array.isArray(body.detail)) return body.detail.map((d: { msg?: string }) => d.msg ?? "Invalid input").join("; ");
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status})`;
}

export default function KnowledgeBase({ onClose }: { onClose: () => void }) {
  const [listing, setListing] = useState<KBListing | null>(null);
  const [path, setPath] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kb/pages", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      setListing(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the knowledge base");
    }
  }, []);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load, onClose]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/kb/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, title, content }) });
      if (!res.ok) throw new Error(await readError(res));
      setMessage(`Indexed ${path}`);
      setPath("");
      setTitle("");
      setContent("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the page");
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: string) {
    if (!window.confirm(`Remove ${p} from the knowledge base?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/kb/pages?path=${encodeURIComponent(p)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await readError(res));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the page");
    }
  }

  const field = "w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono focus:outline-none focus:border-cyan-500";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="kb-title" className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="kb-title" className="text-lg font-bold">Knowledge base</h2>
            <p className="text-xs font-mono text-slate-400 mt-1">Your own pages. The linking agent finds the most relevant ones for each article (Pro).</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>

        {error && <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-900 text-red-300 text-sm">{error}</div>}
        {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}

        <div>
          <p className="text-xs font-mono text-slate-400 mb-2">INDEXED PAGES{listing ? ` (${listing.pages.length} of ${listing.limit})` : ""}</p>
          {listing && listing.pages.length === 0 && <p className="text-sm text-slate-400">No pages yet. Add one below, or import a folder with the command at the bottom.</p>}
          <ul className="divide-y divide-slate-800 max-h-56 overflow-y-auto">
            {listing?.pages.map((p) => (
              <li key={p.path} className="flex items-center gap-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{p.title || p.path}</p>
                  <p className="text-xs font-mono text-slate-500 truncate">{p.path} &middot; {p.chunks} chunk(s)</p>
                </div>
                <button type="button" onClick={() => remove(p.path)} aria-label={`Remove ${p.path}`} className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={add} className="space-y-3">
          <p className="text-xs font-mono text-slate-400">ADD OR UPDATE A PAGE</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input aria-label="Page path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/blog/my-post" maxLength={200} className={field} />
            <input aria-label="Page title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" maxLength={200} className={field} />
          </div>
          <textarea aria-label="Page content" value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="Paste the page text here" className={field} />
          <button type="submit" disabled={busy || !path.trim() || !content.trim()} className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50">{busy ? "Indexing..." : "Add to knowledge base"}</button>
        </form>

        <p className="text-xs text-slate-500">
          Import a whole folder of Markdown/MDX files from your computer:{" "}
          <code className="font-mono text-slate-300">python -m seo_agents.kb.cli --dir content\blog --prefix /blog</code>
        </p>
      </div>
    </div>
  );
}
