"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Send,
  Loader2,
  ImagePlus,
  X,
  Play,
} from "lucide-react";
import { isProUser, type UserProfile } from "@/lib/utils";
import { MAX_IMAGES_FREE } from "@/lib/constants";

interface OrchestratorComposerProps {
  user: any;
  profile: UserProfile | null;
  task: string;
  setTask: (t: string) => void;
  images: File[];
  setImages: (f: File[]) => void;
  previews: string[];
  setPreviews: (p: string[]) => void;
  autonomous: boolean;
  setAutonomous: (a: boolean) => void;
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  isPro: boolean;
  canSubmit: boolean;
}

export function OrchestratorComposer(props: OrchestratorComposerProps) {
  const {
    user,
    profile,
    task,
    setTask,
    images,
    setImages,
    previews,
    setPreviews,
    autonomous,
    setAutonomous,
    loading,
    error,
    setError,
    onSubmit,
    isPro,
    canSubmit,
  } = props;

  const maxCount = isPro ? 6 : MAX_IMAGES_FREE;

  function handleImagesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const combined = [...images, ...files];
    if (combined.length > maxCount) {
      setError(`Max ${maxCount} image(s) for your plan.`);
      return;
    }

    const newImages = combined.slice(0, maxCount);
    const newPreviews = [...previews];

    files.forEach((file) => {
      const url = URL.createObjectURL(file);
      newPreviews.push(url);
    });

    setImages(newImages);
    setPreviews(newPreviews.slice(0, newImages.length));
    setError(null);
  }

  function removeImage(index: number) {
    const p = previews[index];
    if (p) URL.revokeObjectURL(p);

    setImages(images.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  }

  function clearImages() {
    previews.forEach((p) => URL.revokeObjectURL(p));
    setImages([]);
    setPreviews([]);
  }

  const demoTasks = [
    "Research the best noise-cancelling headphones under $200 released in 2025. Compare top 3 models with current prices and real user feedback.",
    "Plan a 4-day solo trip to Tokyo in March. Include budget, must-see spots, and food recommendations.",
    "Summarize the latest research on AI agents for personal productivity. Include tools and case studies.",
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Orchestration</CardTitle>
        <CardDescription>
          Describe what you want. Add images for vision. Check autonomous for a Pro agent that uses tools and runs multi-step.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Research the best wireless headphones under $150 released in 2025 and summarize pros/cons + links..."
              className="min-h-[120px] resize-y text-base"
              disabled={!user || loading}
            />
          </div>

          {/* Images */}
          <div>
            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-zinc-500">
              <div>Images (vision)</div>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 hover:bg-white/5">
                  <ImagePlus className="h-3.5 w-3.5" />
                  Add images
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleImagesSelected}
                    disabled={!user || loading}
                  />
                </label>
              </div>
            </div>

            {previews.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-lg ring-1 ring-white/10">
                    <img src={src} alt={`preview ${i}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 opacity-70 hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={clearImages} className="self-end text-xs text-zinc-400 hover:text-white">
                  Clear
                </button>
              </div>
            )}
            <div className="text-[10px] text-zinc-500">Free: 1 image. Pro: multiple (detail: high).</div>
          </div>

          {/* Autonomous toggle */}
          <label className="flex items-start gap-3 rounded-lg border border-white/10 p-3 text-sm hover:bg-white/5">
            <input
              type="checkbox"
              checked={autonomous}
              onChange={(e) => setAutonomous(e.target.checked)}
              disabled={!user || loading}
              className="mt-1 h-4 w-4 accent-white"
            />
            <div className="leading-tight">
              <div className="font-medium">Run autonomously (Pro)</div>
              <div className="text-xs text-zinc-400">
                Agent plans, uses web search + browse + memory, loops until done. Full trace saved. You watch live.
              </div>
            </div>
          </label>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
          )}

          <Button type="submit" disabled={!canSubmit} className="w-full h-11 text-base">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {autonomous ? "Agent running..." : "Thinking..."}
              </>
            ) : autonomous ? (
              <>
                <Play className="mr-2 h-4 w-4" /> Run autonomously
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Orchestrate
              </>
            )}
          </Button>

          {/* Quick Demo Tasks */}
          <div className="pt-2">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">Quick demo tasks (click to prefill)</div>
            <div className="flex flex-wrap gap-2">
              {demoTasks.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setTask(sample);
                    setAutonomous(true);
                  }}
                  className="text-xs px-2.5 py-1 rounded-md border border-white/10 hover:bg-white/5 text-left max-w-[260px] truncate"
                >
                  Demo {idx + 1}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-zinc-500 mt-1">Click any to instantly load a strong autonomous demo task.</div>
          </div>

          {!user && <div className="text-center text-xs text-zinc-500">Sign in to orchestrate.</div>}
        </form>
      </CardContent>
    </Card>
  );
}
