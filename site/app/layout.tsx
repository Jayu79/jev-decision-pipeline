import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://jayu79.github.io"),
  title: "Jev, calibrated: a calibration study by Jayanth Veeramachaneni",
  authors: [{ name: "Jayanth Veeramachaneni", url: "https://github.com/Jayu79" }],
};

export const viewport: Viewport = {
  themeColor: "#F5F6F4",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
