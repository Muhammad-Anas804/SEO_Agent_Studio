"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus, Trash2, X, XCircle } from "lucide-react";
import type { AIConfig, AISettingsView, ConnectionTest, ModelRef, ProviderInfo } from "@/types/seo";

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

function ModelRow({ value, providers, onChange, onTest, testing, result, onRemove, label, disabled }: {
  value: ModelRef;
  providers: ProviderInfo[];
  onChange: (v: ModelRef) => void;
  onTest: () => void;
  testing: boolean;
  result?: ConnectionTest;
  onRemove?: () => void;
  label: string;
  disabled: boolean;
}) {
  const provider = providers.find((p) => p.name === value.provider);
  const listId = `models-${label.replace(/\W/g, "")}`;
  const field = "px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm font-mono focus:outline-none focus:border-cyan-500 disabled:opacity-60";
  return (
    <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
        <span>{label.toUpperCase()}</span>
        {onRemove && !disabled && (
          <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <select aria-label={`${label} provider`} disabled={disabled} value={value.provider} onChange={(e) => onChange({ provider: e.target.value, model: providers.find((p) => p.name === e.target.value)?.models[0] ?? "" })} className={`${field} sm:col-span-4`}>
          {providers.map((p) => <option key={p.name} value={p.name}>{p.label}{p.configured ? "" : " (no key)"}</option>)}
        </select>
        <input aria-label={`${label} model`} disabled={disabled} list={listId} value={value.model} onChange={(e) => onChange({ ...value, model: e.target.value })} placeholder="model id" className={`${field} sm:col-span-5`} />
        <datalist id={listId}>{provider?.models.map((m) => <option key={m} value={m} />)}</datalist>
        <button type="button" onClick={onTest} disabled={disabled || testing || !value.model} className="sm:col-span-3 px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 text-xs font-mono disabled:opacity-50">
          {testing ? "Testing..." : "Test connection"}
        </button>
      </div>
      {provider && !provider.configured && <p className="text-xs text-amber-300">No API key is set on the server for {provider.label}.</p>}
      {result && (
        <p role="status" className={`text-xs font-mono flex items-center gap-1 ${result.ok ? "text-emerald-400" : "text-red-300"}`}>
          {result.ok ? <><CheckCircle2 className="w-3.5 h-3.5" /> Works ({result.latency_ms} ms)</> : <><XCircle className="w-3.5 h-3.5" /> {result.kind}: {result.message}</>}
        </p>
      )}
    </div>
  );
}

export default function AISettings({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<AISettingsView | null>(null);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ConnectionTest>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ai/settings", { cache: "no-store" });
      if (!res.ok) throw new Error(await readError(res));
      const data: AISettingsView = await res.json();
      setView(data);
      setConfig(data.config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load AI settings");
    }
  }, []);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load, onClose]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/ai/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
      if (!res.ok) throw new Error(await readError(res));
      const data: AISettingsView = await res.json();
      setView(data);
      setConfig(data.config);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function test(id: string, ref: ModelRef) {
    setTesting(id);
    try {
      const res = await fetch("/api/ai/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ref) });
      const body = res.ok ? ((await res.json()) as ConnectionTest) : { ok: false, kind: "error", message: await readError(res) };
      setResults((r) => ({ ...r, [id]: body }));
    } catch {
      setResults((r) => ({ ...r, [id]: { ok: false, kind: "network", message: "Could not reach the server" } }));
    } finally {
      setTesting(null);
    }
  }

  const readOnly = !!view && !view.can_edit;
  const providers = view?.providers ?? [];
  const firstModel = (name: string) => providers.find((p) => p.name === name)?.models[0] ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="ai-title" className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 id="ai-title" className="text-lg font-bold">AI settings</h2>
            <p className="text-xs font-mono text-slate-400 mt-1">Choose the model that writes your content, and backups for when it fails.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-200"><X className="w-5 h-5" /></button>
        </div>

        {error && <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-900 text-red-300 text-sm">{error}</div>}
        {!view && !error && <p className="text-sm font-mono text-slate-400">Loading...</p>}
        {readOnly && <p className="text-xs text-amber-300">You can view these settings, but changing them needs an admin API key.</p>}

        {view && config && (
          <>
            <ModelRow label="Primary model" value={config.primary} providers={providers} disabled={readOnly}
              onChange={(v) => setConfig({ ...config, primary: v })} onTest={() => test("primary", config.primary)}
              testing={testing === "primary"} result={results["primary"]} />

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={readOnly} checked={config.fallback_enabled} onChange={(e) => setConfig({ ...config, fallback_enabled: e.target.checked })} />
              Automatically switch to a backup model when the primary fails
            </label>

            {config.fallback_enabled && (
              <div className="space-y-3">
                {config.fallbacks.map((f, i) => (
                  <ModelRow key={i} label={`Fallback ${i + 1}`} value={f} providers={providers} disabled={readOnly}
                    onChange={(v) => setConfig({ ...config, fallbacks: config.fallbacks.map((x, j) => (j === i ? v : x)) })}
                    onRemove={() => setConfig({ ...config, fallbacks: config.fallbacks.filter((_, j) => j !== i) })}
                    onTest={() => test(`fb${i}`, f)} testing={testing === `fb${i}`} result={results[`fb${i}`]} />
                ))}
                {!readOnly && config.fallbacks.length < 4 && (
                  <button type="button" onClick={() => { const p = providers.find((x) => x.name !== config.primary.provider) ?? providers[0]; setConfig({ ...config, fallbacks: [...config.fallbacks, { provider: p.name, model: firstModel(p.name) }] }); }} className="px-3 py-2 rounded-lg border border-slate-700 hover:border-cyan-500 text-xs font-mono flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Add fallback model
                  </button>
                )}
              </div>
            )}

            <div className="text-xs text-slate-500 space-y-1">
              <p>Settings source: {view.source === "database" ? "saved in the app" : "server environment defaults"}. Models run in order; the same model is never tried twice.</p>
              <p>Model names are suggestions. What you can use depends on your account, so use Test connection. API keys stay on the server and are never shown here.</p>
            </div>

            {!readOnly && (
              <div className="flex items-center gap-3">
                <button type="button" onClick={save} disabled={saving} className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50">{saving ? "Saving..." : "Save settings"}</button>
                {saved && <span role="status" className="text-sm text-emerald-400">Saved</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
