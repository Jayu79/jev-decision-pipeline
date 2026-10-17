import type { Metadata, Viewport } from "next";
import "@fontsource/schibsted-grotesk/400.css";
import "@fontsource/schibsted-grotesk/500.css";
import "@fontsource/schibsted-grotesk/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Can you trust Jev's confidence? Jev decision pipeline results",
  authors: [{ name: "Jayanth Veeramachaneni", url: "https://github.com/Jayu79" }],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDF0F3" },
    { media: "(prefers-color-scheme: dark)", color: "#12171F" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
