import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Copyright (c) 2026 Edward Marin. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Orchestrator",
  description: "Your Personal AI Command Center",
  icons: {
    icon: "/favicon.ico",
  },
};

// Copyright notice for the application
const COPYRIGHT = "© 2026 Edward Marin. All rights reserved.";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-zinc-950 text-white`}
      >
        {children}
        <footer className="border-t border-white/10 py-4 text-center text-[10px] text-zinc-500">
          {COPYRIGHT} · Orchestrator — Source available under commercial license
        </footer>
      </body>
    </html>
  );
}