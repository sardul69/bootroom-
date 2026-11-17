
import type { Metadata } from "next";
import "./globals.css";
import PlayerNavigation from "@/components/PlayerNavigation";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://www.turfzy.world"
  ),
  title: "BOOTROOM — The pitch is waiting.",
  description:
    "Find football games in Kolkata. Join the squad and pay only your individual player fee.",
  openGraph: {
    title: "BOOTROOM — The pitch is waiting.",
    description: "Football games and community in Kolkata.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>
        {children}
        <PlayerNavigation />
      </body>
    </html>
  );
}
