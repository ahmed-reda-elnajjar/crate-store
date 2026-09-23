import type { Metadata, Viewport } from "next";
import { Overlays } from "@/components/Overlays";
import "./modernist.css";
import "./crate.css";

export const metadata: Metadata = {
  title: { default: "CRATE", template: "%s · CRATE" },
  description: "Streetwear in limited runs. No restocks.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f3f2f2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Overlays />
      </body>
    </html>
  );
}
