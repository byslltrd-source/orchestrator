// Copyright (c) 2026 [Your Name or Company]. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

/* eslint-disable @typescript-eslint/no-explicit-any -- LLM message parts, tool args, Supabase responses without generated types, and OpenAI SDK shapes are intentionally loose here */

import { createServiceClient } from '@/lib/supabase/service';
import { executeTool, getOpenAITools } from './tools';
import type { AgentStep, RunAgentParams, RunAgentResult } from './types';
import { MAX_STEPS_DEFAULT } from '@/lib/constants';
import { validateEnv } from '@/lib/utils';
import type { TypedServiceClient } from '@/lib/supabase/service';
import { getVisionUrl } from '@/lib/supabase/storage';
import { resolveOrchestratorLLM, getEmbedder, summarizeVisionFrame } from '@/lib/ai/client';
// Supabase service client (typed via our manual database.types)
const getService = (): TypedServiceClient => createServiceClient() as TypedServiceClient;



export async function runAutonomousAgent(params: RunAgentParams): Promise<RunAgentResult> {
  const {
    goal,
    userId,
    images = [],
    maxSteps = MAX_STEPS_DEFAULT,
    taskId,
    onStep,
    model: requestedModel,
    realtimeVisionEnabled = false,
  } = params;

  // Best-effort env validation
  validateEnv();

  // Resolve the chosen AI (or default). This is the key "multiple AIs for orchestrator" point.
  const { client: llm, model: activeModel, label: modelLabel } = resolveOrchestratorLLM(requestedModel);
  const { client: embedder, model: embedModel } = getEmbedder();

  const steps: AgentStep[] = [];

  // Build system prompt. Include the expensive real-time vision instructions ONLY if customer opted in.
  const baseSystem = `You are Orchestrator, a highly autonomous AI agent that runs itself to achieve user goals with minimal supervision.

Core principles:
- You have long-term memory. Always search your memories first when starting or when relevant context might exist.
- Break big goals into smaller steps using add_todo.
- Use tools proactively (web_search, browse_page) to gather fresh information instead of guessing.
- Save important new facts to memory using save_memory so you (and future runs) remember them.
- **When you have fully achieved the goal, you MUST call the final_answer tool with the complete result.** Do not just describe it in a thought.
- Be efficient but thorough. You are allowed (and expected) to take multiple steps.
- If you get stuck or need user input for something sensitive, include that clearly in your final answer and stop.

You can use multiple tools in parallel by calling them together in one response. Always think step by step before calling tools. Prefer the final_answer tool to terminate.`;

  const realtimeSection = `

REAL-TIME VISION (Premium opt-in feature — this is expensive for the customer):
The customer has explicitly opted in to real-time vision for this run. You will receive "[Real-time camera update]" messages containing live camera frames (high-detail images) from their device. Use them to observe the physical world, a screen, an object, a process, or environment in real time. New frames can arrive between your turns. When relevant, reference what you see ("I can see in the live feed that...").`;

  const SYSTEM_PROMPT = realtimeVisionEnabled ? baseSystem + realtimeSection : baseSystem;

  // Surface the chosen AI at the top of every autonomous trace (multiple AIs feature)
  const modelInfoStep: AgentStep = {
    type: 'memory',
    content: `Orchestrator model: ${modelLabel} (${activeModel})`,
  };
  steps.push(modelInfoStep);
  await onStep?.(modelInfoStep);
  let usedSteps = 0;

  // Prepare initial user content supporting vision (text + 0-N images).
  // Supports:
  // - string (http / data: urls)
  // - File / Blob (base64 conversion fallback)
  // - StoredAsset (from lib/supabase/storage.ts - rich metadata, uses .url)
  let initialUserContent: any = `Goal: ${goal}`;
  if (images.length > 0) {
    const parts: any[] = [{ type: 'text', text: `Goal: ${goal}` }];
    for (const img of images) {
      if (typeof img === 'string') {
        parts.push({ type: 'image_url', image_url: { url: img, detail: 'high' as const } });
      } else if (img && typeof (img as any).url === 'string') {
        // StoredAsset - get fresh URL for vision (supports private buckets + long-running agents)
        try {
          const freshUrl = await getVisionUrl(img as any);
          parts.push({ type: 'image_url', image_url: { url: freshUrl, detail: 'high' as const } });
        } catch {
          parts.push({ type: 'image_url', image_url: { url: (img as any).url, detail: 'high' as const } });
        }
      } else if (img && (typeof (img as any).arrayBuffer === 'function')) {
        try {
          const bytes = await (img as any).arrayBuffer();
          const base64 = Buffer.from(bytes).toString('base64');
          const mimeType = (img as File).type || 'image/jpeg';
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' as const },
          });
        } catch {
          // skip unreadable image; non-fatal
        }
      }
    }
    if (parts.length > 1) initialUserContent = parts;
  }

   
  const currentMessages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: initialUserContent },
  ];

  // Inject relevant long-term memories at the start (this is key for "run itself" over time)
  try {
    const embeddingRes = await embedder.embeddings.create({
      model: embedModel,
      input: goal,
    });
    const embedding = embeddingRes.data[0].embedding;

    const { data: memories } = await (getService().rpc as any)('match_memories', {
      query_embedding: embedding,
      match_user_id: userId,
      match_count: 6,
      filter_task_id: taskId ?? null,
    });

    if (memories && memories.length > 0) {
      const memoryContext = memories
        .map((m: any) => `- ${m.content}`)
        .join('\n');
      currentMessages.push({
        role: 'system',
        content: `Relevant memories from previous work:\n${memoryContext}`,
      });
      const memStep: AgentStep = { type: 'memory', content: `Recalled ${memories.length} relevant memories` };
      steps.push(memStep);
      await onStep?.(memStep);
    }
  } catch {
    // memory recall is best-effort
  }

  // === Agent resume support (next layer): if runId provided, load previous steps and reconstruct conversation
  if (params.runId) {
    try {
      const { data: prevSteps } = await (getService().from('agent_steps') as any)
        .select('*')
        .eq('run_id', params.runId)
        .order('step_number', { ascending: true });

      if (prevSteps && prevSteps.length > 0) {
        for (const s of prevSteps) {
          if (s.type === 'thought' && s.content) {
            currentMessages.push({ role: 'assistant', content: s.content });
          } else if (s.type === 'tool_call' && s.tool_name) {
            // Reconstruct tool call message (simplified; real would need tool_call_id)
            currentMessages.push({
              role: 'assistant',
              tool_calls: [{ id: `replay-${s.step_number}`, type: 'function', function: { name: s.tool_name, arguments: JSON.stringify(s.tool_args || {}) } }],
            });
          } else if (s.type === 'tool_result' && s.tool_name) {
            currentMessages.push({
              role: 'tool',
              tool_call_id: `replay-${s.step_number}`,
              content: s.tool_result || '',
            });
          }
          steps.push({
            type: s.type as any,
            content: s.content,
            toolName: s.tool_name,
            toolArgs: s.tool_args,
            toolResult: s.tool_result,
          });
        }
        usedSteps = prevSteps.length;
      }
    } catch {
      // resume best effort
    }
  }

  let finalResult = '';

  const startTime = Date.now();
  const MAX_AGENT_MS = 4 * 60 * 1000; // safety timeout so a runaway agent doesn't run forever

  // For Premium Real-time Vision: track which vision_frame steps we've already injected into context
  const injectedVisionStepIds = new Set<string>();

  for (let step = 0; step < maxSteps; step++) {
    if (Date.now() - startTime > MAX_AGENT_MS) {
      finalResult = 'The agent timed out after several minutes. Review the trace for partial progress.';
      break;
    }

    usedSteps = step + 1;

    // === Premium Real-time Vision injection (only when customer explicitly opted in + runId present) ===
    // Expensive feature. We poll for newly pushed 'vision_frame' steps (from the /api/vision/push-frame endpoint).
    // New frames are appended as fresh user messages containing the image so the model
    // "sees" the live camera update on the next thinking turn.
    if (params.runId && params.realtimeVisionEnabled) {
      try {
        const { data: visionFrames } = await (getService().from('agent_steps') as any)
          .select('id, content, created_at')
          .eq('run_id', params.runId)
          .eq('type', 'vision_frame')
          .order('created_at', { ascending: true });

        if (visionFrames && visionFrames.length > 0) {
          for (const vf of visionFrames) {
            if (injectedVisionStepIds.has(vf.id)) continue;
            injectedVisionStepIds.add(vf.id);

            // Inject as a user message with image so the *next* model call can reason over the live view.
            // We also surface it visibly in the trace.
            const imageUrl = vf.content as string;

            // Use cheap summarizer for the expensive real-time vision feature
            // This gives the main model good text context immediately + the raw image so it can truly "see".
            let frameDescription = '';
            try {
              frameDescription = await summarizeVisionFrame(imageUrl);
            } catch {}

            currentMessages.push({
              role: 'user',
              content: [
                { 
                  type: 'text', 
                  text: `[Real-time camera update]${frameDescription ? ` Summary: ${frameDescription}` : ''}` 
                },
                { type: 'image_url', image_url: { url: imageUrl, detail: 'high' as const } },
              ],
            });

            const visStep: AgentStep = {
              type: 'vision_frame',
              content: imageUrl,
            };
            steps.push(visStep);
            await onStep?.(visStep);
          }
        }
      } catch (e) {
        // best effort — don't break the agent if vision polling fails
      }
    }

    const completion = await llm.chat.completions.create({
      model: activeModel,
      messages: currentMessages,
      tools: getOpenAITools(),
      tool_choice: 'auto',
      temperature: 0.6,
      max_tokens: 1200,
    });

    const message = completion.choices[0].message;
    currentMessages.push(message);

    // Record the model's reasoning
    if (message.content) {
      const thoughtStep: AgentStep = { type: 'thought', content: message.content };
      steps.push(thoughtStep);
      await onStep?.(thoughtStep);
    }

    // Handle tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        // Support both regular function tool calls and future custom ones
        if (toolCall.type !== 'function') continue;
        const name = toolCall.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
        } catch {}

        const callStep: AgentStep = {
          type: 'tool_call',
          toolName: name,
          toolArgs: args,
          content: `Calling ${name}`,
        };
        steps.push(callStep);
        await onStep?.(callStep);

        const result = await executeTool(userId, name, args);

        const resultStep: AgentStep = {
          type: 'tool_result',
          toolName: name,
          toolResult: result,
        };
        steps.push(resultStep);
        await onStep?.(resultStep);

        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });

        // Special handling for final_answer tool
        if (name === 'final_answer' && typeof result === 'string' && result.startsWith('FINAL_ANSWER:')) {
          finalResult = result.replace('FINAL_ANSWER:', '');
          const finalStep: AgentStep = { type: 'final', content: finalResult };
          steps.push(finalStep);
          await onStep?.(finalStep);
          return { finalResult, steps, usedSteps };
        }
      }
    } else {
      // No tool calls — the model might be done or thinking
      if (message.content?.toLowerCase().includes('i have completed') ||
          message.content?.toLowerCase().includes('here is the final')) {
        finalResult = message.content;
        const finalStep: AgentStep = { type: 'final', content: finalResult };
        steps.push(finalStep);
        await onStep?.(finalStep);
        return { finalResult, steps, usedSteps };
      }
    }
  }

  // Ran out of steps
  if (!finalResult) {
    finalResult = "The agent reached the maximum number of steps. Partial progress was made. Review the steps above.";
  }

  return { finalResult, steps, usedSteps };
}
