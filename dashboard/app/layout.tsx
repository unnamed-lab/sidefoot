import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sidefoot — proven-score divergence",
  description:
    "Flags the moment betting odds lag behind a Merkle-proof-verified score event, anchored to a real on-chain validate_stat call.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-base text-ink antialiased">{children}</body>
    </html>
  );
}
