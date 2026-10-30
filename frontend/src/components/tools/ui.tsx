"use client";

import React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { Check } from "@/types/tools";

/** Shared class for text inputs, selects and textareas. */
export const inputClass =
  "w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-cyan-500 font-mono";

const submitClass =
  "py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm disabled:opacity-50";

/** Card with an intro sentence. Handles preventDefault so callers do not have to. */
export function ToolForm({ description, onSubmit, children }: {
  description: string;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4"
    >
      <p className="text-sm text-slate-400">{description}</p>
      {children}
    </form>
  );
}

export function Field({ id, label, className, children }: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-mono text-slate-400 mb-2">{label}</label>
      {children}
    </div>
  );
}

export function SubmitButton({ loading, disabled, label, busyLabel, className = "px-6" }: {
  loading: boolean;
  disabled: boolean;
  label: string;
  busyLabel: string;
  className?: string;
}) {
  return (
    <button type="submit" disabled={loading || disabled} className={`${submitClass} ${className}`}>
      {loading ? busyLabel : label}
    </button>
  );
}

/** The common "one input + one button" form. */
export function SingleInputForm(props: {
  description: string;
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  disabled: boolean;
  buttonLabel: string;
  busyLabel: string;
  maxLength?: number;
}) {
  return (
    <ToolForm description={props.description} onSubmit={props.onSubmit}>
      <div className="flex flex-col md:flex-row gap-3">
        <Field id={props.id} label={props.label} className="flex-1">
          <input
            id={props.id}
            type="text"
            value={props.value}
            maxLength={props.maxLength}
            placeholder={props.placeholder}
            onChange={(e) => props.onChange(e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="flex items-end">
          <SubmitButton
            loading={props.loading}
            disabled={props.disabled}
            label={props.buttonLabel}
            busyLabel={props.busyLabel}
            className="w-full md:w-44"
          />
        </div>
      </div>
    </ToolForm>
  );
}

export function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="p-4 rounded-xl bg-red-950/40 border border-red-900 text-red-300 text-sm">
      {message}
    </div>
  );
}

export function ResultCard({ children }: { children: React.ReactNode }) {
  return <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">{children}</div>;
}

export function ScoreHeader({ label, score, meta }: { label: string; score: number; meta?: string }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-2">
      <div>
        <p className="text-xs font-mono text-slate-400">{label}</p>
        <p className="text-4xl font-bold">{score} / 100</p>
      </div>
      {meta && <p className="text-xs font-mono text-slate-500 break-all">{meta}</p>}
    </div>
  );
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-2">
      {checks.map((c) => (
        <li key={c.name} className="flex gap-3 items-start p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm">
          {c.pass
            ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" aria-label="Passed" />
            : <XCircle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" aria-label="Failed" />}
          <div>
            <p className="font-semibold">
              {c.name}
              {c.emerging && (
                <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-400">
                  EMERGING
                </span>
              )}
            </p>
            <p className="text-xs font-mono text-slate-400 break-words">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}