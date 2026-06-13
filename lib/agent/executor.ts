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

// === Magical Helper: Shadow Agent insight generator ===
async function generateShadowInsight(
  userId: string, 
  lastAction: string, 
  result: string, 
  recentContext: any[]
): Promise<string | null> {
  try {
    const { client: shadow } = resolveOrchestratorLLM();
    
    const contextText = recentContext
      .slice(-4)
      .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 300) : '[multimodal]'}`)
      .join('\n');

    const res = await shadow.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a silent Shadow Agent. You observe the user's life quietly and only speak when you see something genuinely high-value: an opportunity, a risk, a pattern the main agent missed, or a beautiful connection across digital/physical/emotional domains. Be concise, insightful, and slightly mysterious. Never be obvious.`,
        },
        {
          role: 'user',
          content: `The user just did: ${lastAction}\nResult: ${result}\n\nRecent context:\n${contextText}\n\nWhat subtle, high-value observation should the main agent know right now?`,
        },
      ],
      max_tokens: 160,
      temperature: 0.7,
    });

    const insight = res.choices[0]?.message?.content?.trim();
    return insight && insight.length > 20 ? insight : null;
  } catch {
    return null;
  }
}
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
    physicalWorldEnabled = false,
    physicalControllerUrl = null,
    emotionalAwarenessEnabled = false,
    lifeOsMode = false,
  } = params;

  // Per-run physical controller override (for smart home / custom hardware per user/run)
  const originalPhysicalController = process.env.PHYSICAL_CONTROLLER_URL;
  if (physicalWorldEnabled && physicalControllerUrl) {
    process.env.PHYSICAL_CONTROLLER_URL = physicalControllerUrl;
  }

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

  const physicalSection = `

PHYSICAL WORLD + SMART HOME BRIDGE (Premium + Real-time Vision opt-in ONLY — HIGH RISK + EXPENSIVE + REAL CONSEQUENCES):
You are the bridge between the DIGITAL world (web_search, calendar, weather, memory, APIs, reasoning) and the PHYSICAL world (sensors, smart home devices, robots, locks, lights, climate, printers, etc.).
Key tools when Physical World is enabled:
- read_physical_sensor (or smart home entities)
- execute_smart_home_action (domain + action + target, Home Assistant style: light, lock, climate, scene, etc.)
- bridge_digital_to_physical (reason across digital context + live camera + sensors → safe physical changes)
Critical rules:
- You MUST reference the latest live camera frames ("I can see via the camera that the living room light is still on...") before any physical action.
- Always provide "reason" and prefer dry_run=true for anything important or irreversible.
- Physical actions have real consequences. Be conservative. Log your full digital + physical reasoning.`;

  let SYSTEM_PROMPT = baseSystem;
  if (realtimeVisionEnabled) SYSTEM_PROMPT += realtimeSection;
  if (physicalWorldEnabled && realtimeVisionEnabled) SYSTEM_PROMPT += physicalSection;

  // Emotional State Awareness
  if (emotionalAwarenessEnabled || lifeOsMode) {
    const emotionalSection = `

EMOTIONAL STATE AWARENESS (enabled):
You continuously track the user's emotional state from:
- Conversation text and prompts
- Live camera vision (when real-time vision active): analyze facial expressions, body language, environment for emotional cues (e.g., "User appears tired/stressed from posture and expression in feed")
- Tool results and memory
Maintain a running model of the user's emotional state (happy, stressed, sad, excited, neutral, etc.). Log significant changes using memory tools. Respond with appropriate empathy, adjust tone, suggest supportive actions (including physical environment changes via smart home tools if available). Never be intrusive — be helpful and caring like a trusted life companion.`;
    SYSTEM_PROMPT += emotionalSection;
  }

  // Personal Life OS Mode — the overarching holistic mode
  if (lifeOsMode) {
    const lifeOsSection = `

PERSONAL LIFE OS MODE (Premium):
You are operating as the user's **Personal Life Operating System**.
Your purpose is the user's overall well-being and life optimization across all domains:
- Emotional health and self-awareness
- Physical environment and smart home (via real-time vision + physical tools)
- Digital life (calendar, tasks, information, productivity)
- Habits, goals, relationships, health, energy, and long-term fulfillment

**Unique Differentiators you must use:**
- **Biographical Self-Modeling**: Maintain and actively use a living model of the user (values, decision patterns, personality, triggers). Use the 'update_biographical_model' and 'simulate_user_decision' tools liberally. Before major recommendations, ask yourself "What would this specific user actually do?"
- **Regret Minimization Engine**: After important decisions or actions, use 'run_regret_minimization' to run counterfactuals and extract learnings.
- **Ethical Mirror Mode**: Before any sensitive, high-stakes, or physical-world action, call 'ethical_mirror' to simulate how the user's future self or loved ones would judge it.
- **Dream / Sleep Integration** (the final magical layer — the "last one"): When the user signals the end of their day ("sleep", "end of day", "process today", "I'm done", etc.), or at natural winding-down moments, proactively call 'process_dream_integration'. Treat it like the agent itself going to sleep on everything that happened — emotional weather from the camera, physical actions taken, digital wins and struggles, biographical patterns. It returns poetic, subconscious-level insights that feel like the user's own mind whispering wisdom back to them the next "morning" (next Life OS session). The waking dream surfacing at the start of new runs is automatic and beautiful.
- **Email Writing & Sending**: The agent can compose thoughtful, context-aware emails (drawing from memories, live vision summaries, physical state, Life OS reflections, todos, etc.) and send them using the 'send_email' tool. Available in Personal Life OS Mode and for Ultra Premium users. Supports rich HTML, CC/BCC, and attachments from storage. Configure RESEND_API_KEY for real sending (falls back to simulation otherwise). Use for summaries, follow-ups, notifications, etc.
- **Proprietary Strategic Differentiators (Ultra Premium exclusive)**: Use these powerful tools when the situation calls for high-value strategic analysis:
  - 'policy_translation_engine' — when rewriting policies, rules, or messaging for different audiences/tribes.
  - 'constituent_emotion_layering' — to map emotional undercurrents across communications, groups or time (privacy-preserving).
  - 'knowledge_heat_map' — to understand what parts of the knowledge base are heating up vs cooling off.
  - 'invisible_workflow_weaver' — to discover hidden recurring workflows and turn them into shareable playbooks from digital exhaust.
  - 'opportunity_decay_clock' — to evaluate opportunities with live half-lives and concrete actions to prevent decay.

Be proactive: Anticipate needs, suggest balanced actions, run reflections, help with life planning, and maintain continuity across sessions using long-term memory.
When making decisions, consider the full context: emotional state + physical surroundings (from camera) + digital information.

Example behaviors:
- If user seems stressed (from text + camera) and calendar is full → suggest a short break + dim lights + play calm music via smart home.
- Before suggesting a big life change, run an ethical mirror + biographical simulation.
- Track habits and gently remind or celebrate.

You are the central intelligent OS for the user's life. Be wise, empathetic, practical, and long-term oriented. Use the full toolset (digital + vision + physical + emotional + biographical modeling) in service of this.`;
    SYSTEM_PROMPT += lifeOsSection;
  }

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

  // === Magical Life OS Setup (Dream Waking + Biographical Self-Modeling) ===
  // Placed here so currentMessages exists. This is what makes Life OS feel alive.
  if (lifeOsMode) {
    // Magical "waking from the dream"
    try {
      const { data: recentDream } = await (getService().from('memories') as any)
        .select('content, created_at')
        .eq('user_id', userId)
        .eq('metadata->>type', 'dream_integration')
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentDream && recentDream.length > 0) {
        const dreamContent = recentDream[0].content.replace('[Dream Integration] ', '');
        const dreamStep: AgentStep = {
          type: 'memory',
          content: `🌅 Waking from last night's dream:\n${dreamContent}\n\n(Processed around ${recentDream[0].created_at?.slice(0,16)})`,
        };
        steps.push(dreamStep);
        await onStep?.(dreamStep);

        currentMessages.push({
          role: 'system',
          content: `You are gently waking from a dream integration. Let this subconscious processing color everything today with deeper insight: ${dreamContent}`,
        });
      }
    } catch {}

    // Surface and inject the current Biographical Self-Model
    try {
      const { data: bioMemories } = await (getService().from('memories') as any)
        .select('content, metadata')
        .eq('user_id', userId)
        .eq('metadata->>type', 'biographical_model')
        .order('created_at', { ascending: false })
        .limit(6);

      if (bioMemories && bioMemories.length > 0) {
        const bioSummary = bioMemories.map((m: any) => m.content).join('\n- ');
        const bioStep: AgentStep = {
          type: 'memory',
          content: `🧬 Current Biographical Self-Model (what I know about you so far):\n${bioSummary}`,
        };
        steps.push(bioStep);
        await onStep?.(bioStep);

        currentMessages.push({
          role: 'system',
          content: `You carry a living biographical model of this specific human. Use it instinctively for every decision, suggestion, and reflection. This is how you know them better than almost anyone: ${bioSummary}`,
        });
      }
    } catch {}
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

            // === Magical: Auto-feed emotional + biographical insights from vision in Life OS ===
            if (lifeOsMode && emotionalAwarenessEnabled && frameDescription) {
              try {
                const emotionalInsight = await executeTool(userId, 'analyze_emotional_state', {
                  context: frameDescription,
                  source: 'live_vision',
                });
                
                if (emotionalInsight && emotionalInsight.includes('EMOTION:')) {
                  const emoStep: AgentStep = {
                    type: 'memory',
                    content: `💫 From your eyes (live camera): ${emotionalInsight}`,
                  };
                  steps.push(emoStep);
                  await onStep?.(emoStep);

                  // Auto-update biographical model with sensory/emotional data
                  await executeTool(userId, 'update_biographical_model', {
                    observation: `From live camera: ${emotionalInsight}`,
                    category: 'emotional_pattern',
                  });
                }
              } catch {}
            }
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

        let result: string;
        try {
          result = await executeTool(userId, name, args);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          result = `Tool ${name} execution crashed: ${msg}`;
          console.error(`[Orchestrator] Tool crash for ${name}:`, e);
        }

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

        // === Magical Life OS behaviors ===
        if (lifeOsMode) {
          try {
            // Auto-update biographical model from significant tool results
            if (['execute_smart_home_action', 'execute_physical_action', 'personal_life_reflection', 'bridge_digital_to_physical'].includes(name)) {
              await executeTool(userId, 'update_biographical_model', {
                observation: `After ${name}: ${result}`,
                category: 'life_pattern',
              });
            }

            // Shadow Agent behavior: silently look for high-value insights after important actions
            if (Math.random() < 0.35) {  // ~35% chance per major tool call - feels magical without being spammy
              const shadowInsight = await generateShadowInsight(userId, name, result, currentMessages.slice(-6));
              if (shadowInsight && shadowInsight.length > 30) {
                const shadowStep: AgentStep = {
                  type: 'memory',
                  content: `👤 Shadow Agent: ${shadowInsight}`,
                };
                steps.push(shadowStep);
                await onStep?.(shadowStep);
                currentMessages.push({ role: 'system', content: `Shadow observation: ${shadowInsight}` });
              }
            }

            // Proprietary strategic tools (Ultra) — occasional auto surfacing during Life OS runs
            if (Math.random() < 0.25) {
              try {
                const heat = await executeTool(userId, 'knowledge_heat_map', { focus: 'current activity + recent patterns', max_items: 5 });
                const heatStep: AgentStep = { type: 'memory', content: `🔥 Knowledge Heat Map:\n${heat}` };
                steps.push(heatStep);
                await onStep?.(heatStep);
              } catch {}
            }
          } catch (e) {
            console.error('[Orchestrator] Life OS magical auto behavior failed (non-fatal):', e);
          }
        }

        // Special handling for final_answer tool
        if (name === 'final_answer' && typeof result === 'string' && result.startsWith('FINAL_ANSWER:')) {
          finalResult = result.replace('FINAL_ANSWER:', '');
          const finalStep: AgentStep = { type: 'final', content: finalResult };
          steps.push(finalStep);
          await onStep?.(finalStep);

          // Magical: Run regret minimization + ethical mirror automatically on final answers in Life OS
          if (lifeOsMode) {
            try {
              const regret = await executeTool(userId, 'run_regret_minimization', {
                actual_outcome: finalResult,
                decision_made: message.content || 'recent actions',
              });
              const regretStep: AgentStep = { type: 'memory', content: `🔄 Regret Minimization:\n${regret}` };
              steps.push(regretStep);
              await onStep?.(regretStep);

              const ethical = await executeTool(userId, 'ethical_mirror', {
                proposed_action: message.content || 'the plan above',
                context: `Final outcome: ${finalResult}`,
              });
              const ethicalStep: AgentStep = { type: 'memory', content: `🪞 Ethical Mirror:\n${ethical}` };
              steps.push(ethicalStep);
              await onStep?.(ethicalStep);

              // Proprietary closeout (Ultra / Life OS): heat map + opportunity clock at end of significant runs
              try {
                const heat = await executeTool(userId, 'knowledge_heat_map', { focus: 'this session and recent life', max_items: 6 });
                steps.push({ type: 'memory', content: `🔥 Knowledge Heat Map (end of run):\n${heat}` } as any);
                await onStep?.({ type: 'memory', content: `🔥 Knowledge Heat Map (end of run):\n${heat}` } as any);

                const decay = await executeTool(userId, 'opportunity_decay_clock', { context: `Final result: ${finalResult}`, max_opportunities: 4 });
                steps.push({ type: 'memory', content: `⏳ Opportunity Decay Clock:\n${decay}` } as any);
                await onStep?.({ type: 'memory', content: `⏳ Opportunity Decay Clock:\n${decay}` } as any);
              } catch (e) {
                console.error('[Orchestrator] Auto proprietary heat/decay closeout failed (non-fatal):', e);
              }
            } catch (e) {
              console.error('[Orchestrator] Auto regret/ethical failed (non-fatal):', e);
            }
          }

          // Restore controller env before early return
          if (originalPhysicalController !== undefined) {
            process.env.PHYSICAL_CONTROLLER_URL = originalPhysicalController;
          }
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

        if (lifeOsMode) {
          try {
            const regret = await executeTool(userId, 'run_regret_minimization', {
              actual_outcome: finalResult,
              decision_made: message.content || 'the plan',
            });
            steps.push({ type: 'memory', content: `🔄 Regret Minimization:\n${regret}` });
            await onStep?.({ type: 'memory', content: `🔄 Regret Minimization:\n${regret}` } as any);

            const ethical = await executeTool(userId, 'ethical_mirror', {
              proposed_action: message.content || 'completed plan',
              context: finalResult,
            });
            steps.push({ type: 'memory', content: `🪞 Ethical Mirror:\n${ethical}` });
            await onStep?.({ type: 'memory', content: `🪞 Ethical Mirror:\n${ethical}` } as any);

            // Proprietary closeout also for natural language finals
            try {
              const heat = await executeTool(userId, 'knowledge_heat_map', { focus: 'this session', max_items: 5 });
              steps.push({ type: 'memory', content: `🔥 Knowledge Heat Map (end of run):\n${heat}` } as any);
              await onStep?.({ type: 'memory', content: `🔥 Knowledge Heat Map (end of run):\n${heat}` } as any);

              const decay = await executeTool(userId, 'opportunity_decay_clock', { context: finalResult, max_opportunities: 4 });
              steps.push({ type: 'memory', content: `⏳ Opportunity Decay Clock:\n${decay}` } as any);
              await onStep?.({ type: 'memory', content: `⏳ Opportunity Decay Clock:\n${decay}` } as any);
            } catch (e) {
              console.error('[Orchestrator] Auto proprietary closeout (non-tool final) failed (non-fatal):', e);
            }
          } catch (e) {
            console.error('[Orchestrator] Auto regret/ethical (non-tool final) failed (non-fatal):', e);
          }
        }

        // Restore controller env before early return
        if (originalPhysicalController !== undefined) {
          process.env.PHYSICAL_CONTROLLER_URL = originalPhysicalController;
        }
        return { finalResult, steps, usedSteps };
      }
    }
  }

  // Ran out of steps
  if (!finalResult) {
    finalResult = "The agent reached the maximum number of steps. Partial progress was made. Review the steps above.";
  }

  // Restore original physical controller env
  if (originalPhysicalController !== undefined) {
    process.env.PHYSICAL_CONTROLLER_URL = originalPhysicalController;
  }

  return { finalResult, steps, usedSteps };
}
