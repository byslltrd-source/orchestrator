"use client";

// Copyright (c) 2026 Edward Marin. All rights reserved.

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Header } from "@/components/Header";
import { ProvisoWorkspace } from "@/components/proviso/ProvisoWorkspace";
import { ArrowLeft } from "lucide-react";

export default function ProvisoPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-amber-300 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Orchestrator
        </Link>
        <ProvisoWorkspace />
      </div>
    </div>
  );
}