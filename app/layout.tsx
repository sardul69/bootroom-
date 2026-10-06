import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: 'BOOTROOM — The pitch is waiting.',
  description: 'Find and book football turfs in Kolkata. Find your game. Enter the game.',
  openGraph: {
    title: 'BOOTROOM — The pitch is waiting.',
    description: 'Football turf booking and football community platform.',
    type: 'website'
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
