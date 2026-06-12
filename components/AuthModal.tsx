"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: () => void;
}

export function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const supabase = createClient();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        setMessage("Check your email to confirm your account, then sign in.");
        // For dev convenience many people disable email confirm.
        // If you want instant access, you can also immediately try to sign in below.
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        onAuthSuccess?.();
        onClose();
        setEmail("");
        setPassword("");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === "signup" ? "login" : "signup");
    setError(null);
    setMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-2xl font-semibold tracking-tighter">Orchestrator</div>
            <div className="text-sm text-zinc-400">
              {mode === "signup" ? "Create your free account" : "Welcome back"}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-400">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-white/30"
              placeholder="you@company.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm outline-none focus:border-white/30"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}
          {message && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
              {message}
            </div>
          )}

          <Button type="submit" disabled={loading || !email || !password} className="w-full h-11">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {mode === "signup" ? "Creating account..." : "Signing in..."}
              </>
            ) : mode === "signup" ? (
              "Create free account"
            ) : (
              "Sign in"
            )}
          </Button>
        </form>

        <div className="mt-5 text-center text-sm">
          <button
            onClick={switchMode}
            className="text-zinc-400 hover:text-white underline-offset-4 hover:underline"
          >
            {mode === "signup"
              ? "Already have an account? Sign in"
              : "Don't have an account? Sign up for free"}
          </button>
        </div>

        <p className="mt-6 text-center text-[11px] text-zinc-500">
          Free plan includes 20 orchestrations per month. Upgrade anytime for unlimited + multi-image vision.
        </p>
      </div>
    </div>
  );
}
