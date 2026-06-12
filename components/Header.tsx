"use client";

// Copyright (c) 2026 [Your Name or Company]. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Brain, LogOut, CreditCard, User as UserIcon } from "lucide-react";
import { isProUser, type UserProfile } from "@/lib/utils";
import { FREE_LIMIT } from "@/lib/constants";

type Profile = UserProfile;

interface HeaderProps {
  onAuthClick: () => void;
  onUserChange?: (user: User | null) => void;
}

export function Header({ onAuthClick, onUserChange }: HeaderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const supabase = createClient();

  const isPro = isProUser(profile);

  const loadProfile = useCallback(async (userId: string) => {
    setLoadingProfile(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_status, orchestrations_used, orchestrations_limit")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setProfile(data as Profile);
      } else {
        // Profile may not exist yet (new signup). Default free.
        setProfile({
          subscription_plan: "free",
          subscription_status: "free",
          orchestrations_used: 0,
          orchestrations_limit: FREE_LIMIT,
        });
      }
    } catch {
      // ignore – will show free defaults
    } finally {
      setLoadingProfile(false);
    }
  }, [supabase]);

  useEffect(() => {
    // Initial session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase.auth.getUser().then(({ data }: any) => {
      const u = data.user;
      setUser(u);
      onUserChange?.(u);
      if (u) loadProfile(u.id);
    });

    // Listen for auth changes (sign in/out from anywhere)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: listener } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      const u = session?.user ?? null;
      setUser(u);
      onUserChange?.(u);
      if (u) {
        loadProfile(u.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
   
  }, [loadProfile, onUserChange, supabase.auth]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    onUserChange?.(null);
    window.location.reload(); // simple way to reset all client state
  }

  async function handleManageBilling() {
    if (!user) return;
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Could not open billing portal");
      }
    } catch {
      alert("Failed to open billing portal");
    }
  }

  async function handleUpgrade() {
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || "Could not start checkout");
      }
    } catch {
      alert("Failed to start checkout");
    }
  }

  const usageText = profile
    ? isPro
      ? "Unlimited (Pro)"
      : `${profile.orchestrations_used} / ${profile.orchestrations_limit} this month`
    : "";

  return (
    <div className="border-b border-white/10 bg-zinc-950/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60 sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <div className="font-semibold tracking-tighter">Orchestrator</div>
            <div className="text-[10px] text-zinc-500 -mt-0.5">AI Command Center</div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              {/* Usage indicator */}
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 px-3 py-1 text-xs text-zinc-400">
                {loadingProfile ? "Loading usage..." : usageText}
              </div>

              {/* User info + actions */}
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900 pl-2 pr-1 py-1">
                <div className="flex items-center gap-2 px-2">
                  <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                    <UserIcon className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-xs text-zinc-300 max-w-[140px] truncate">{user.email}</div>
                </div>

                {isPro ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManageBilling}
                    className="h-7 text-xs"
                  >
                    <CreditCard className="mr-1.5 h-3 w-3" />
                    Manage
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleUpgrade}
                    className="h-7 text-xs bg-white text-black hover:bg-white/90"
                  >
                    Upgrade
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSignOut}
                  className="h-7 w-7 text-zinc-400 hover:text-white"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </div>
            </>
          ) : (
            <Button onClick={onAuthClick} size="sm" className="h-9 px-5">
              Sign up / Log in
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
