// Premium Real-time Vision frame push endpoint.
// Top-tier ("premium") subscribers can push live camera frames during an active autonomous run.
// The running agent executor will pick up new vision_frame steps and inject them into the model's context.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isPremiumUser } from '@/lib/utils';
import { uploadUserFile } from '@/lib/supabase/storage';
import {
  REALTIME_VISION_MIN_INTERVAL_MS,
  REALTIME_VISION_MAX_FRAMES_PER_RUN,
} from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    }

    const service = createServiceClient() as any;

    // Load profile for premium gate
    const { data: profile } = await service
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!isPremiumUser(profile)) {
      return NextResponse.json(
        { error: "Real-time Vision is a Premium top-tier feature. Upgrade your plan." },
        { status: 402 }
      );
    }

    const formData = await request.formData();
    const runId = formData.get('runId') as string;
    const frameFile = formData.get('frame') as File | null;

    if (!runId || !frameFile) {
      return NextResponse.json({ error: "Missing runId or frame" }, { status: 400 });
    }

    // Validate ownership + run is still active
    const { data: run } = await service
      .from('agent_runs')
      .select('id, user_id, status, task_id')
      .eq('id', runId)
      .single();

    if (!run || run.user_id !== user.id) {
      return NextResponse.json({ error: "Run not found or not yours" }, { status: 404 });
    }
    if (run.status !== 'running') {
      return NextResponse.json({ error: "This run is no longer active" }, { status: 409 });
    }

    // Simple per-run rate limiting / spam protection (in-memory best effort; DB can be added later)
    const rateKey = `__rtv_${runId}`;
    const now = Date.now();
    const last = (globalThis as any)[rateKey] || 0;
    if (now - last < REALTIME_VISION_MIN_INTERVAL_MS) {
      return NextResponse.json({ error: "Too many frames. Please slow down." }, { status: 429 });
    }
    (globalThis as any)[rateKey] = now;

    // Count existing vision frames for this run to enforce max
    const { count: existingVisionCount } = await service
      .from('agent_steps')
      .select('id', { count: 'exact', head: true })
      .eq('run_id', runId)
      .eq('type', 'vision_frame');

    if ((existingVisionCount || 0) >= REALTIME_VISION_MAX_FRAMES_PER_RUN) {
      return NextResponse.json({ error: "Maximum live vision frames reached for this run." }, { status: 429 });
    }

    // Upload the frame (re-uses the existing storage + rich metadata layer)
    let asset;
    try {
      asset = await uploadUserFile(user.id, frameFile);
    } catch (e: any) {
      return NextResponse.json({ error: `Failed to store frame: ${e.message}` }, { status: 500 });
    }

    // Compute a reasonable step_number (best effort, races are harmless for vision frames)
    const { data: maxStep } = await service
      .from('agent_steps')
      .select('step_number')
      .eq('run_id', runId)
      .order('step_number', { ascending: false })
      .limit(1)
      .single();

    const nextStepNumber = (maxStep?.step_number ?? 0) + 1;

    // Persist as a vision_frame step so:
    // - The live UI (realtime + current stream) can display the thumbnail immediately
    // - The agent executor can discover it and inject the image into the LLM context
    const { data: insertedStep, error: insertErr } = await service
      .from('agent_steps')
      .insert({
        run_id: runId,
        step_number: nextStepNumber,
        type: 'vision_frame',
        content: asset.url,               // the accessible URL for the model + renderer
        // We could store more (asset metadata) in tool_args or a new json column if desired
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('vision frame step insert error', insertErr);
      return NextResponse.json({ error: "Failed to record live vision frame" }, { status: 500 });
    }

    // Track expensive realtime vision usage (for billing/auditing)
    try {
      await service.from('usage_events').insert({
        user_id: user.id,
        type: 'realtime_vision_frame',
        task: `live-frame for run ${runId.slice(0, 8)}`,
        result_preview: `Live camera frame pushed`,
        images_count: 1,
      });

      // Increment profile counter
      const currentFrames = (profile?.realtime_vision_frames_used ?? 0) + 1;
      await service.from('profiles').update({
        realtime_vision_frames_used: currentFrames
      }).eq('id', user.id);

      // Persist on the run metadata for history
      await service.from('agent_runs').update({
        metadata: { ...(run.metadata || {}), realtime_vision: true, last_vision_frame_at: new Date().toISOString() }
      }).eq('id', runId);
    } catch (e) {
      console.error('Failed to track realtime vision usage (non-fatal)', e);
    }

    return NextResponse.json({
      ok: true,
      step: insertedStep,
      url: asset.url,
    });
  } catch (err: any) {
    console.error("push-frame error", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
