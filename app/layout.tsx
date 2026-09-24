import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brainstorm — your problem-solving OS",
  description: "Turn LeetCode activity into a clear, personal learning system.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
