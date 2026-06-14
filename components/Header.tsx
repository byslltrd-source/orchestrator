"use client";

// Copyright (c) 2026 Edward Marin. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

import { Brain } from "lucide-react";

/**
 * Simplified header for single-owner / commercial purchaser deployments.
 * No sign up, no login, no per-user billing or usage quotas in the base artifact.
 * The company that purchases Orchestrator implements auth, accounts, billing,
 * SSO, white-labeling, etc. exactly as they need inside their environment.
 */
interface HeaderProps {
  // onAuthClick / user props removed – no public auth layer
}

export function Header(_props: HeaderProps) {
  return (
    <div className="border-b border-white/10 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60 sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tighter">Orchestrator</div>
            <div className="text-[10px] text-zinc-500 -mt-0.5">AI Command Center — Owner / Purchaser Deployment</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm text-zinc-400">
          Full platform unlocked (all features + OMNIS)
        </div>
      </div>
    </div>
  );
}
