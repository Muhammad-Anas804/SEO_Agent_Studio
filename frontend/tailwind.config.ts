import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/**
 * Light theme tokens. The existing components use the dark "slate" scale, so the
 * scale is remapped to the light design system instead of rewriting every class:
 *   slate-950 -> page background   slate-900 -> card surface   slate-800 -> border
 *   slate-400/500 -> secondary text   slate-100 -> primary text
 *   cyan -> indigo (primary)   emerald/red/amber -> success/error/warning
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          100: "#111827",
          200: "#1E293B",
          300: "#334155",
          400: "#64748B",
          500: "#64748B",
          600: "#94A3B8",
          700: "#CBD5E1",
          800: "#E2E8F0",
          900: "#FFFFFF",
          950: "#F6F8FC",
        },
        cyan: { 400: "#4338CA", 500: "#4F46E5", 950: "#EEF2FF" },
        emerald: { 400: "#15803D" },
        red: { 300: "#B91C1C", 400: "#DC2626", 900: "#FECACA", 950: "#FEF2F2" },
        amber: { 200: "#92400E", 300: "#B45309", 400: "#D97706", 900: "#FDE68A", 950: "#FFFBEB" },
        accent: "#7C3AED",
      },
      boxShadow: { card: "0 1px 2px rgba(15, 23, 42, 0.06)" },
    },
  },
  plugins: [typography],
};

export default config;
