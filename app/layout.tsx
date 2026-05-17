import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { PlayerBar } from "@/components/player-bar";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulsebox",
  description: "Spotify-to-YouTube playlist matcher built as a Next.js PWA.",
  applicationName: "Pulsebox",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pulsebox",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col pb-24">
        {children}
        <PlayerBar />
        <Toaster />
      </body>
    </html>
  );
}
