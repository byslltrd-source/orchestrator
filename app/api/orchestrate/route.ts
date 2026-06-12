// Copyright (c) 2026 [Your Name or Company]. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { runAutonomousAgent } from '@/lib/agent/executor';
import type { AgentStep } from '@/lib/agent/types';
import { isProUser, type UserProfile, validateEnv } from '@/lib/utils';
import {
  FREE_LIMIT,
  MAX_TASK_LENGTH,
  MAX_AUTONOMOUS_STEPS,
  MAX_STEPS_DEFAULT,
  MAX_IMAGES_FREE,
  MAX_IMAGE_UPLOAD_BYTES,
} from '@/lib/constants';
import { OrchestrateInputSchema } from '@/lib/schemas';
import type { Database } from '@/lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadUserFile, type StoredAsset, STORAGE_BUCKET } from '@/lib/supabase/storage';
import { OrchestratorError, ValidationError, QuotaError } from '@/lib/errors';
import { resolveOrchestratorLLM } from '@/lib/ai/client';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user via Supabase session (populated by middleware)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please sign in to use Orchestrator" }, { status: 401 });
    }

    // Basic rate limit (next layer polish) - 10 calls per minute per user (in-memory, resets on deploy)
    const rateLimitMap = (globalThis as any).__orchestratorRateLimit || new Map();
    (globalThis as any).__orchestratorRateLimit = rateLimitMap;
    const now = Date.now();
    const last = rateLimitMap.get(user.id) || 0;
    if (now - last < 6000) { // ~10/min
      return NextResponse.json({ error: "Rate limited. Please wait a moment." }, { status: 429 });
    }
    rateLimitMap.set(user.id, now);

    // 2. Parse form (support multiple images now)
    const formData = await request.formData();
    const task = (formData.get('task') as string) || '';
    const imageFiles = formData.getAll('images') as File[];
    const autonomous = formData.get('autonomous') === 'true' || formData.get('mode') === 'autonomous';

    // Basic image size guard (defense in depth)
    const totalImageBytes = imageFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    if (totalImageBytes > MAX_IMAGE_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `Images too large (max ${(MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024).toFixed(0)}MB total)` },
        { status: 413 }
      );
    }

    if (!task.trim()) {
      return NextResponse.json({ error: "Please enter a task" }, { status: 400 });
    }
    if (task.length > MAX_TASK_LENGTH) {
      return NextResponse.json({ error: `Task is too long (max ${MAX_TASK_LENGTH} characters)` }, { status: 400 });
    }

    // Zod validation layer (next layer type safety)
    const parseResult = OrchestrateInputSchema.safeParse({
      task: task.trim(),
      autonomous,
    });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid input", issues: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const requestedModel = ((formData.get('model') as string) || '').trim() || null;
    const realtimeVision = formData.get('realtime_vision') === 'true';
    const physicalWorld = realtimeVision && formData.get('physical_world') === 'true'; // Physical requires real-time vision opt-in

    // We no longer hard-require OPENAI_API_KEY at the top — multiple providers are supported.
    // The resolver below will surface a clear error if no usable key is configured for the chosen model.
    const envCheck = validateEnv();
    if (!envCheck.ok) {
      return NextResponse.json({ error: envCheck.message }, { status: 500 });
    }

    // 3. Load profile (use service client for reliable privileged read + later write)
    // Supabase service client (any because we don't have generated types from the DB schema)
    // Privileged service client. Full Database types live in lib/supabase/database.types.ts
    const service = createServiceClient() as any;
    let { data: profileData } = await service
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    // Auto-create a minimal free profile if missing (new user)
    if (!profileData) {
      // Use loose cast for privileged admin insert (common pattern until full typegen)
      await (service.from('profiles') as any).insert({
        id: user.id,
        email: user.email,
        subscription_plan: 'free',
        subscription_status: 'free',
        orchestrations_used: 0,
        orchestrations_limit: FREE_LIMIT,
      });
      profileData = {
        id: user.id,
        subscription_plan: 'free',
        subscription_status: 'free',
        orchestrations_used: 0,
        orchestrations_limit: FREE_LIMIT,
      } as any; // shape matches ProfileRow
    }

    const p = (profileData || {}) as UserProfile;
    const isPro = isProUser(p);

    // 4. Enforce subscription / quota
    const used = p.orchestrations_used ?? 0;
    const limit = p.orchestrations_limit ?? FREE_LIMIT;

    if (!isPro && used >= limit) {
      return NextResponse.json(
        {
          error: "Monthly limit reached",
          code: "QUOTA_EXCEEDED",
          used,
          limit,
        },
        { status: 402 }
      );
    }

    // 5. Vision gating: free users get 1 image max
    if (!isPro && imageFiles.length > MAX_IMAGES_FREE) {
      return NextResponse.json(
        { error: "Multi-image vision is a Pro feature. Please upgrade." },
        { status: 402 }
      );
    }

    // === Enhanced storage layer (more storage): use dedicated helper for uploads + rich metadata
    // Bucket name from env or default 'orchestrator-images'. Create it in Supabase Storage (recommend private + signed for prod).
    // Files are uploaded under user-scoped paths for isolation.
    const storedAssets: StoredAsset[] = [];
    if (imageFiles.length > 0) {
      for (const file of imageFiles) {
        try {
          const asset = await uploadUserFile(user.id, file);
          storedAssets.push(asset);
        } catch (err: any) {
          console.error('Image upload error:', err);
          return NextResponse.json({ error: `Failed to store image: ${err.message}` }, { status: 500 });
        }
      }
    }
    const imageUrls = storedAssets.map(a => a.url);

    // =====================================================
    // AUTONOMOUS MODE - "Run itself" with tools + memory
    // Pro users get full multi-step agent loops.
    // Runs are persisted so you (the owner) and the user can watch later.
    // STREAMING: we emit NDJSON events immediately so the client can render steps LIVE
    // as the agent thinks, calls tools, and progresses. run_id is sent in the first event.
    // =====================================================
    if (autonomous) {
      if (!isPro) {
        return NextResponse.json(
          { error: "Autonomous multi-step agents are a Pro feature. Upgrade to let it run itself." },
          { status: 402 }
        );
      }

      const encoder = new TextEncoder();

      return new Response(
        new ReadableStream({
          async start(controller) {
            const enqueue = (obj: any) => {
              controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
            };

            try {
              // Create a persistent Task for this goal
              const realtimeVision = formData.get('realtime_vision') === 'true';

              const { data: newTask } = await (service.from('tasks') as any)
                .insert({
                  user_id: user.id,
                  title: task.slice(0, 80),
                  goal: task,
                  status: 'active',
                  max_steps: MAX_AUTONOMOUS_STEPS,
                  images: storedAssets.length > 0 ? storedAssets : [],
                  metadata: {
                    ...(realtimeVision ? { realtime_vision: true } : {}),
                    ...(physicalWorld ? { physical_world: true } : {}),
                  },
                })
                .select('id')
                .single();

              const taskId = newTask?.id;

              // Create the Agent Run immediately so realtime / history can see it as running
              const { data: newRun } = await (service.from('agent_runs') as any)
                .insert({
                  task_id: taskId,
                  user_id: user.id,
                  status: 'running',
                  metadata: {
                    ...(realtimeVision ? { realtime_vision: true } : {}),
                    ...(physicalWorld ? { physical_world: true } : {}),
                  },
                })
                .select('id')
                .single();

              const runId = newRun?.id;

              // Emit early so client can subscribe to realtime or just know the id and start rendering
              enqueue({ type: 'run_started', run_id: runId, task_id: taskId, goal: task });

              const persistedSteps: Array<{ type: string; content?: string; toolName?: string; toolArgs?: unknown; toolResult?: string }> = [];

              // Run the agent - onStep fires live for both DB + stream to client
              const { finalResult, usedSteps } = await runAutonomousAgent({
                goal: task,
                userId: user.id,
                images: storedAssets.length > 0 ? storedAssets : undefined,
                maxSteps: MAX_AUTONOMOUS_STEPS,
                taskId,
                model: requestedModel,
                realtimeVisionEnabled: realtimeVision,
                physicalWorldEnabled: physicalWorld,
                onStep: async (step: AgentStep) => {
                  persistedSteps.push(step);
                  if (runId) {
                    try {
                      await (service.from('agent_steps') as any).insert({
                        run_id: runId,
                        step_number: persistedSteps.length,
                        type: step.type,
                        content: step.content,
                        tool_name: step.toolName,
                        tool_args: step.toolArgs,
                        tool_result: step.toolResult,
                      });
                    } catch {
                      // best effort persistence
                    }
                  }
                  // Stream the step to the connected client RIGHT NOW for live UI
                  enqueue({ type: 'step', step, step_number: persistedSteps.length });
                },
              });

              // Finalize the run in DB
              if (runId) {
                await (service.from('agent_runs') as any)
                  .update({
                    status: finalResult ? 'completed' : 'failed',
                    final_result: finalResult,
                    current_step: usedSteps,
                    completed_at: new Date().toISOString(),
                  })
                  .eq('id', runId);
              }

              // Count usage (re-fetch latest for robustness)
              try {
                const { data: fresh } = await (service.from('profiles') as any)
                  .select('orchestrations_used')
                  .eq('id', user.id)
                  .single();
                const latestUsed = fresh?.orchestrations_used ?? (p.orchestrations_used ?? 0);
                await (service.from('profiles') as any)
                  .update({ orchestrations_used: latestUsed + 1 })
                  .eq('id', user.id);
              } catch {}

              // Signal completion with final info (client can also use the last step of type final)
              enqueue({
                type: 'done',
                final_result: finalResult,
                used_steps: usedSteps,
                run_id: runId,
                task_id: taskId,
              });

              // Record usage event
              try {
                await (service.from('usage_events') as any).insert({
                  user_id: user.id,
                  type: 'autonomous',
                  task: task.slice(0, 500),
                  result_preview: (finalResult || '').slice(0, 200),
                  images_count: storedAssets.length,
                });
              } catch (e) {
                console.error('Failed to log usage event (non-fatal):', e);
              }
            } catch (err: any) {
              enqueue({ type: 'error', error: err?.message || 'Agent run failed' });
            } finally {
              controller.close();
            }
          },
        }),
        {
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      );
    }

    // =====================================================
    // LEGACY ONE-SHOT MODE (vision + direct answer)
    // Still useful for quick questions. Free users are limited here.
    // =====================================================

    // Resolve chosen model for the one-shot (non-autonomous) path.
    // This enables the same "multiple AIs" experience for quick orchestrations.
    const { client: oneShotLlm, model: oneShotModel, label: oneShotModelLabel } = resolveOrchestratorLLM(requestedModel);

    // Build content array: task text first, then 0-N images (now using stored public URLs from Supabase Storage)
    type VisionContentPart =
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } };

    const content: VisionContentPart[] = [{ type: "text", text: task }];

    const visionAssets = storedAssets.length > 0 ? storedAssets : [];
    for (const asset of visionAssets) {
      content.push({
        type: "image_url",
        image_url: {
          url: asset.url,
          detail: "high",
        },
      });
    }

    const isVision = imageFiles.length > 0;

    const messages = [
      {
        role: "system",
        content:
          "You are Orchestrator, a powerful AI command center with full vision capabilities. " +
          "When image(s) are provided, analyze them carefully and directly in the context of the user's task. " +
          "Ground every answer in what you actually see in the image(s). Be specific and actionable.",
      },
      {
        role: "user",
        content,
      },
    ];

    const completion = await oneShotLlm.chat.completions.create({
      model: oneShotModel,
      // The messages array mixes system + user (with possible image parts) + tool responses.
      // Using any here is acceptable until we add stricter OpenAI message typing.
      messages: messages as any,
      max_tokens: isVision ? 1600 : 900,
      temperature: 0.7,
    });
    const result = completion.choices?.[0]?.message?.content || "No response.";

    // 7. Increment usage (only after successful response). Handle monthly reset for free users.
    // Re-fetch latest to reduce staleness from concurrent requests / long autonomous runs.
    try {
      const { data: fresh } = await (service.from('profiles') as any)
        .select('orchestrations_used, usage_reset_date')
        .eq('id', user.id)
        .single();

      const latestUsed = fresh?.orchestrations_used ?? (p.orchestrations_used ?? 0);
      const now = new Date();
      const resetDate = fresh?.usage_reset_date ? new Date(fresh.usage_reset_date) : (p.usage_reset_date ? new Date(p.usage_reset_date) : null);

      let newUsed = latestUsed + 1;
      let updates: any = { orchestrations_used: newUsed };

      // Simple calendar month reset for free tier
      if (!isPro && resetDate && now > resetDate) {
        newUsed = 1;
        updates = {
          orchestrations_used: 1,
          usage_reset_date: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
        };
      }

      await (service.from('profiles') as any)
        .update(updates)
        .eq('id', user.id);
    } catch (e) {
      console.error("Failed to increment usage (non-fatal):", e);
    }

    // Return fresh usage for the UI (best effort)
    let reportedUsed: number | string = isPro ? 'unlimited' : (p.orchestrations_used ?? 0) + 1;
    try {
      const { data: fresh } = await (service.from('profiles') as any)
        .select('orchestrations_used')
        .eq('id', user.id)
        .single();
      if (fresh?.orchestrations_used != null) {
        reportedUsed = isPro ? 'unlimited' : fresh.orchestrations_used;
      }
    } catch {}

    // Record usage event (next layer audit history)
    try {
      await (service.from('usage_events') as any).insert({
        user_id: user.id,
        type: 'one-shot',
        task: task.slice(0, 500),
        result_preview: (result || '').slice(0, 200),
        images_count: storedAssets.length,
      });
    } catch (e) {
      console.error('Failed to log usage event (non-fatal):', e);
    }

    return NextResponse.json({
      result,
      meta: {
        used: reportedUsed,
        isPro,
        model: oneShotModel,
        modelLabel: oneShotModelLabel,
      },
    });
  } catch (error: any) {
    console.error("Orchestrator error:", error);
    return NextResponse.json({ error: "Server error processing request" }, { status: 500 });
  }
}
