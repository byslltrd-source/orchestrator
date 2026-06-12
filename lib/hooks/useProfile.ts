"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/utils";

export function useProfile(initialUserId?: string) {
  const supabase = createClient();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("subscription_plan, subscription_status, orchestrations_used, orchestrations_limit")
        .eq("id", userId)
        .single();

      if (!error && data) {
        setProfile(data as UserProfile);
      } else {
        setProfile({
          subscription_plan: "free",
          subscription_status: "free",
          orchestrations_used: 0,
          orchestrations_limit: 20,
        });
      }
    } catch {
      setProfile({
        subscription_plan: "free",
        subscription_status: "free",
        orchestrations_used: 0,
        orchestrations_limit: 20,
      });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  return { profile, loading, loadProfile, setProfile };
}
