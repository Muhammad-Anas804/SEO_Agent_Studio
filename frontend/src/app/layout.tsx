import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Agent Studio",
  description: "Multi-agent SEO content pipeline: intent, outline, article, schema and internal links.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
