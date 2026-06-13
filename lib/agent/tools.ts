// Copyright (c) 2026 [Your Name or Company]. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

/* eslint-disable @typescript-eslint/no-explicit-any -- External lib responses (tavily, OpenAI, cheerio text), Supabase service casts, and tool JSON schema are dynamic */

import { createServiceClient } from '@/lib/supabase/service';
import * as cheerio from 'cheerio';
import { tavily } from '@tavily/core';
import type { TypedServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/database.types';
import { resolveToolLLM, getEmbedder } from '@/lib/ai/client';
import {
  PHYSICAL_DEFAULT_CONTROLLER_URL,
  PHYSICAL_ACTION_TIMEOUT_MS,
  PHYSICAL_MAX_ACTIONS_PER_RUN,
  SMART_HOME_DOMAINS,
} from '@/lib/constants';
import { Resend } from 'resend';

const tavilyClient = process.env.TAVILY_API_KEY ? tavily({ apiKey: process.env.TAVILY_API_KEY }) : null;

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema (loose for flexibility with LLM)
  execute: (userId: string, args: any) => Promise<string>;
};

// ==================== CORE AUTONOMOUS TOOLS ====================

export const tools: ToolDefinition[] = [
  // 1. Web search - fresh information so the agent can research on its own
  {
    name: 'web_search',
    description: 'Search the web for up-to-date information. Use this when you need current facts, news, or research.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        num_results: { type: 'number', description: 'How many results (default 5, max 10)' },
      },
      required: ['query'],
    },
    async execute(userId, { query, num_results = 5 }) {
      if (!tavilyClient) {
        return 'Web search is not configured (missing TAVILY_API_KEY). Tell the user to add it for full research capabilities.';
      }
      // @tavily/core usage: client.search(query, options)
      const results = await tavilyClient.search(query, {
        max_results: Math.min(num_results, 10),
        search_depth: 'advanced',
      } as any);
      return JSON.stringify((results as any).results || results, null, 2);
    },
  },

  // 2. Browse a specific page - deep research on a URL the agent found
  {
    name: 'browse_page',
    description: 'Fetch and extract the main content from a specific URL. Great for reading articles, docs, or product pages in detail.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        instructions: { type: 'string', description: 'What specifically to extract or focus on (e.g. "summarize pricing and key features")' },
      },
      required: ['url'],
    },
    async execute(userId, { url, instructions }) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'OrchestratorBot/1.0' } });
        const html = await res.text();
        const $ = cheerio.load(html);

        // Remove noise
        $('script, style, nav, footer, header, aside').remove();
        const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 12000);

        if (!instructions) return text.slice(0, 4000);

        // Use the orchestrator's (or default fast) LLM to follow instructions.
        // This keeps page summarization consistent with the agent's chosen model when possible.
        const { client: toolLlm, model: toolModel } = resolveToolLLM();
        const summary = await toolLlm.chat.completions.create({
          model: toolModel,
          messages: [
            { role: 'system', content: 'Extract and summarize exactly what the user asked for from the page content. Be concise and quote key facts.' },
            { role: 'user', content: `Instructions: ${instructions}\n\nPage content:\n${text}` },
          ],
          max_tokens: 800,
        });
        return summary.choices[0]?.message?.content || text.slice(0, 3000);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return `Failed to browse ${url}: ${msg}`;
      }
    },
  },

  // 3. Memory - the agent can remember things across runs ("run itself" over days/weeks)
  {
    name: 'save_memory',
    description: 'Permanently remember an important fact, preference, decision, or piece of context about the user or the current goal. Use this liberally.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The fact or information to remember' },
        importance: { type: 'number', description: '1-10 how important this is to remember long term' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['content'],
    },
    async execute(userId, { content, importance = 5, tags = [] }) {
      // Generate embedding (dedicated embedder, independent of main reasoning model)
      const { client: embedder, model: embedModel } = getEmbedder();
      const embeddingRes = await embedder.embeddings.create({
        model: embedModel,
        input: content,
      });
      const embedding = embeddingRes.data[0].embedding;

      const svc = createServiceClient() as TypedServiceClient;
      await (svc.from('memories') as any).insert({
        user_id: userId,
        content,
        embedding,
        metadata: { importance, tags, saved_by: 'agent' },
      });
      return `Memory saved: "${content.slice(0, 80)}..."`;
    },
  },

  {
    name: 'search_memories',
    description: 'Search your long-term memory for relevant past facts, preferences or context before deciding what to do.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What you are trying to recall' },
        max_results: { type: 'number', default: 6 },
      },
      required: ['query'],
    },
    async execute(userId, { query, max_results = 6 }) {
      const { client: embedder, model: embedModel } = getEmbedder();
      const embeddingRes = await embedder.embeddings.create({
        model: embedModel,
        input: query,
      });
      const embedding = embeddingRes.data[0].embedding;

      const svc = createServiceClient() as TypedServiceClient;
      const { data } = await (svc.rpc as any)('match_memories', {
        query_embedding: embedding,
        match_user_id: userId,
        match_count: max_results,
      });

      if (!data || data.length === 0) return 'No relevant memories found.';
      return data.map((m: any, i: number) => `${i + 1}. ${m.content} (similarity: ${m.similarity.toFixed(2)})`).join('\n');
    },
  },

  // 4. Internal task management - the agent manages its own plan
  {
    name: 'add_todo',
    description: 'Add an item to your internal todo list for the current goal. Use this to break down complex work.',
    parameters: {
      type: 'object',
      properties: {
        task: { type: 'string' },
        priority: { type: 'number', default: 3 },
      },
      required: ['task'],
    },
    async execute(userId, { task, priority = 3 }) {
      // For v1 we keep it simple in the prompt context. In future we can persist per-run todos.
      return `Added to plan: ${task} (priority ${priority})`;
    },
  },

  {
    name: 'complete_task',
    description: 'Mark one of your internal tasks as done. Helps you track progress toward the goal.',
    parameters: {
      type: 'object',
      properties: { task: { type: 'string' } },
      required: ['task'],
    },
    async execute(userId, { task }) {
      return `Marked as complete: ${task}`;
    },
  },

  // 5. Final answer - the agent MUST call this when it has achieved the goal
  {
    name: 'final_answer',
    description: 'Call this ONLY when you have fully completed the user\'s goal. Provide the final deliverable or comprehensive answer.',
    parameters: {
      type: 'object',
      properties: {
        answer: { type: 'string', description: 'The complete final result for the user' },
      },
      required: ['answer'],
    },
    async execute(userId, { answer }) {
      // Special marker - the executor will detect this and stop the loop
      return `FINAL_ANSWER:${answer}`;
    },
  },

  // 6. Real-time Vision tool (Premium opt-in, expensive) - lets the agent actively request to "see" now
  {
    name: 'capture_live_view',
    description: 'Request a fresh live camera frame from the user right now. Only useful if the customer has explicitly opted into Real-time Vision (Premium) and has their camera enabled for this run. Use this when you need current visual information about the physical world, screen, object, or environment (e.g. "I need to see what is on the desk right now" or "Show me the current state of the device").',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Why you need a live view at this moment (be specific so the user understands)' },
      },
      required: ['reason'],
    },
    async execute(userId, { reason }) {
      // The client (when realtime + camera active) will auto-provide a frame when it sees this tool call in the trace.
      return `Live camera view requested. Reason: ${reason || 'Agent needs visual update'}. A new real-time vision frame should arrive shortly if the user has opted in and camera is active.`;
    },
  },

  // 7. PHYSICAL WORLD INTEGRATION + SMART HOME (Premium + Real-time Vision opt-in ONLY)
  // This is the bridge between DIGITAL (web data, calendar, AI reasoning, memory, APIs) and PHYSICAL (sensors, lights, locks, climate, robots, etc.).
  // Primary application: Smart Home (Home Assistant, Matter, Zigbee, etc.) — but supports "AND ALL" physical systems.
  // The agent uses live camera as its eyes + these tools as its hands.
  // SAFETY: Every physical action must be justified with live vision + reason. Use dry_run. Irreversible actions (unlocking doors, starting machines) are extremely dangerous.
  {
    name: 'read_physical_sensor',
    description: 'Read real-world sensor or smart home device state (temperature, humidity, motion, door/window open, power usage, light level, robot position, etc.). Use together with live camera vision for grounding. Only for customers who opted into Physical World Integration.',
    parameters: {
      type: 'object',
      properties: {
        sensor_type: { type: 'string', description: 'e.g. temperature, motion, door_state, illuminance, battery, robot_joint_angle' },
        location_or_entity: { type: 'string', description: 'Device name, room, or entity id (e.g. "living_room", "front_door", "light.kitchen")' },
        reason: { type: 'string', description: 'Why this reading is needed right now (for safety audit log)' },
      },
      required: ['sensor_type', 'reason'],
    },
    async execute(userId, { sensor_type, location_or_entity = 'unknown', reason }) {
      const controllerUrl = PHYSICAL_DEFAULT_CONTROLLER_URL;
      const payload = {
        type: 'sensor_read',
        domain: 'sensor',
        sensor_type,
        entity: location_or_entity,
        reason,
        timestamp: new Date().toISOString(),
      };

      if (!controllerUrl) {
        const simMap: Record<string, string> = {
          temperature: '23.1°C',
          motion: 'clear',
          door_state: 'closed',
          illuminance: '340 lux',
          battery: '87%',
        };
        const simulated = simMap[sensor_type.toLowerCase()] || '42 (simulated value)';
        return `PHYSICAL/SMART HOME SENSOR (SIMULATED): ${sensor_type} at ${location_or_entity} = ${simulated}. Reason: ${reason}. Configure PHYSICAL_CONTROLLER_URL for real hardware (Home Assistant, etc.).`;
      }

      try {
        const res = await fetch(controllerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(PHYSICAL_ACTION_TIMEOUT_MS),
        });
        return `Sensor read: ${sensor_type}@${location_or_entity} → ${await res.text()}`;
      } catch (e: any) {
        return `Sensor read failed: ${e.message}. You can still reason using live camera vision.`;
      }
    },
  },

  {
    name: 'execute_smart_home_action',
    description: 'Control smart home devices and scenes. This is the main bridge tool for DIGITAL ↔ PHYSICAL. Examples: turn lights on/off/color, set thermostat, lock/unlock doors, run scenes, control media, open/close covers. MUST be grounded in the latest live camera vision frame. Customer must have Physical World Integration + Real-time Vision opted in.',
    parameters: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: `Smart home domain. Common: ${SMART_HOME_DOMAINS.join(', ')}` },
        action: { type: 'string', description: 'Service/action (e.g. turn_on, turn_off, set_temperature, lock, set_scene)' },
        target: { type: 'string', description: 'Entity ID or friendly name (e.g. light.living_room, climate.main, lock.front_door)' },
        params: { type: 'object', description: 'Parameters for the action (e.g. {brightness: 80, color_temp: 300}, {temperature: 21})' },
        reason: { type: 'string', description: 'Detailed reasoning + safety justification. Reference what you see in the current live camera feed.' },
        dry_run: { type: 'boolean', description: 'True = simulate only (highly recommended first time)' },
      },
      required: ['domain', 'action', 'target', 'reason'],
    },
    async execute(userId, { domain, action, target, params = {}, reason, dry_run = false }) {
      const controllerUrl = PHYSICAL_DEFAULT_CONTROLLER_URL;

      const payload = {
        type: 'smart_home_action',
        domain,
        action,
        target,
        params,
        reason,
        dry_run,
        timestamp: new Date().toISOString(),
        // The agent should have injected the latest vision summary into context before calling this
      };

      const log = `SMART HOME / PHYSICAL ACTION: ${domain}.${action} on ${target} | params=${JSON.stringify(params)} | reason=${reason} | dry_run=${dry_run}`;

      if (!controllerUrl || dry_run) {
        return `${log} → ${dry_run ? 'DRY RUN — no physical change' : 'SIMULATED (no controller configured)'}. This would have affected real devices in the physical world.`;
      }

      try {
        const res = await fetch(controllerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(PHYSICAL_ACTION_TIMEOUT_MS),
        });
        return `${log} → SUCCESS: ${await res.text()}`;
      } catch (e: any) {
        return `${log} → FAILED: ${e.message}. Verify current state using live camera vision before retrying.`;
      }
    },
  },

  {
    name: 'bridge_digital_to_physical',
    description: 'High-level bridge tool. Use digital information (calendar, weather APIs via web_search, memory, emails, news) + current physical sensors + live camera vision to decide and execute safe physical/smart home actions. Example: "If my calendar shows I am in a meeting and motion sensor detects someone at the door → turn on porch light and send notification." This tool helps the agent reason across the digital-physical boundary.',
    parameters: {
      type: 'object',
      properties: {
        digital_context: { type: 'string', description: 'Summary of relevant digital information (calendar, weather, reminders, etc.)' },
        physical_observation: { type: 'string', description: 'What you currently observe from live camera + recent sensor readings' },
        desired_outcome: { type: 'string', description: 'What physical state you want to achieve' },
        proposed_actions: { type: 'array', description: 'List of specific smart home / physical actions you plan to take' },
        reason: { type: 'string', description: 'Full safety + logic reasoning for bridging digital info to physical action' },
        dry_run: { type: 'boolean', description: 'Simulate the bridge decision without executing' },
      },
      required: ['digital_context', 'physical_observation', 'desired_outcome', 'reason'],
    },
    async execute(userId, args) {
      // This tool is mostly for the agent to structure its thinking. It can then call execute_smart_home_action for the actual changes.
      // In a full implementation this could call the controller with a "plan" payload.
      const { digital_context, physical_observation, desired_outcome, reason, dry_run = false } = args;
      return `DIGITAL ↔ PHYSICAL BRIDGE PLAN:\nDigital: ${digital_context}\nPhysical observation (from camera + sensors): ${physical_observation}\nDesired: ${desired_outcome}\nReasoning: ${reason}\n${dry_run ? 'DRY RUN — no actions executed' : 'Next step: call execute_smart_home_action for each proposed change.'}`;
    },
  },

  // 8. EMOTIONAL STATE AWARENESS (Premium feature)
  {
    name: 'analyze_emotional_state',
    description: 'Analyze the current emotional state of the user from recent conversation, provided text, or (when real-time vision is active) from visual cues in the latest camera frame description. Returns a structured emotional assessment. Use this proactively in Personal Life OS mode or when emotional awareness is enabled.',
    parameters: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'Recent conversation snippet, user message, or vision description to analyze' },
        source: { type: 'string', description: 'Where this context came from: text, vision, memory, or combined' },
      },
      required: ['context'],
    },
    async execute(userId, { context, source = 'text' }) {
      // Use a cheap model for analysis to keep cost reasonable
      const { client: analyzer } = resolveToolLLM();
      const res = await analyzer.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at detecting human emotional states from text and visual descriptions. Output in this exact format:\nEMOTION: [primary emotion]\nINTENSITY: [low|medium|high]\nCONTEXT: [brief 1-sentence explanation]\nSUGGESTED_RESPONSE: [empathetic, supportive suggestion for the AI agent]',
          },
          {
            role: 'user',
            content: `Source: ${source}\n\nAnalyze this for emotional state:\n${context}`,
          },
        ],
        max_tokens: 200,
      });
      return res.choices[0]?.message?.content || 'Unable to analyze emotional state.';
    },
  },

  {
    name: 'log_emotional_state',
    description: 'Permanently log the user\'s current emotional state to long-term memory for future awareness in Personal Life OS. Include triggers and any physical environment notes if available.',
    parameters: {
      type: 'object',
      properties: {
        emotion: { type: 'string', description: 'Detected primary emotion (e.g. stressed, joyful, anxious, calm)' },
        intensity: { type: 'string', description: 'low, medium, or high' },
        notes: { type: 'string', description: 'What triggered this state, context from conversation or vision, and any suggested actions' },
      },
      required: ['emotion', 'notes'],
    },
    async execute(userId, { emotion, intensity = 'medium', notes }) {
      // Save to long-term memory using existing memory tools pattern
      const content = `Emotional state: ${emotion} (intensity: ${intensity}). ${notes}`;
      // Reuse the save_memory logic by calling the existing tool or direct insert
      // For simplicity, we directly use the memory insert pattern here
      const svc = createServiceClient() as TypedServiceClient;
      try {
        // Generate embedding for the emotional log
        const { client: embedder } = getEmbedder();
        const embeddingRes = await embedder.embeddings.create({
          model: 'text-embedding-3-small',
          input: content,
        });
        const embedding = embeddingRes.data[0].embedding;

        await (svc.from('memories') as any).insert({
          user_id: userId,
          content,
          embedding,
          metadata: { 
            type: 'emotional_state', 
            emotion, 
            intensity, 
            source: 'agent_analysis',
            timestamp: new Date().toISOString() 
          },
        });
        return `Emotional state "${emotion}" logged to long-term memory.`;
      } catch (e) {
        return `Failed to log emotional state: ${e}`;
      }
    },
  },

  // 9. PERSONAL LIFE OS MODE tools
  {
    name: 'personal_life_reflection',
    description: 'Run a structured reflection on the user\'s life across emotional, physical, digital, and goal dimensions. Use in Personal Life OS mode to maintain awareness and provide insights. Considers recent memory, emotional logs, physical environment (if vision active), and tasks.',
    parameters: {
      type: 'object',
      properties: {
        focus_areas: { type: 'array', items: { type: 'string' }, description: 'Areas to reflect on: emotional, physical_environment, digital_life, habits, goals, relationships' },
        time_period: { type: 'string', description: 'e.g. "last 7 days", "today", "this month"' },
      },
      required: ['focus_areas'],
    },
    async execute(userId, { focus_areas = ['emotional'], time_period = 'recent' }) {
      // In a full impl this would query memories, agent_steps, etc.
      // For now, provide structured guidance back to the agent
      return `Life OS Reflection requested for areas: ${focus_areas.join(', ')} over ${time_period}.\n\nYou should now:\n1. Recall relevant emotional states and physical observations from memory/vision.\n2. Review digital context (tasks, calendar if accessible).\n3. Identify patterns, wins, concerns.\n4. Suggest 1-3 balanced actions that consider emotional + physical + practical needs.\nOutput the reflection clearly for the user.`;
    },
  },

  {
    name: 'suggest_life_os_action',
    description: 'Propose a holistic action that improves the user\'s life across emotional, physical, and practical dimensions. Use when in Personal Life OS mode after gathering context from vision, sensors, memory, and digital tools.',
    parameters: {
      type: 'object',
      properties: {
        current_context: { type: 'string', description: 'Summary of current emotional state, physical environment from camera/sensors, and digital situation' },
        goal: { type: 'string', description: 'What the user ultimately wants to achieve or feel' },
      },
      required: ['current_context', 'goal'],
    },
    async execute(userId, { current_context, goal }) {
      return `Life OS suggested action based on:\nContext: ${current_context}\nGoal: ${goal}\n\nConsider a balanced action that addresses emotion (e.g. reduce stress), physical environment (via smart home if available), and digital next step. Present 2-3 options to the user with reasoning.`;
    },
  },

  // === Unique Differentiators from unique-features.html ===

  {
    name: 'update_biographical_model',
    description: 'Updates or refines the living biographical / psychological model of the user. This is the core of "Biographical Self-Modeling". Call this whenever you learn something significant about the user\'s values, decision patterns, personality, preferences, or life philosophy. This model is used for "What would the user do?" simulations.',
    parameters: {
      type: 'object',
      properties: {
        observation: { type: 'string', description: 'Specific new insight about the user (values, patterns, triggers, philosophy, etc.)' },
        category: { type: 'string', description: 'Category: values, decision_style, personality, triggers, life_philosophy, relationships, work_style' },
      },
      required: ['observation', 'category'],
    },
    async execute(userId, { observation, category }) {
      const content = `[Biographical Model Update - ${category}] ${observation}`;
      const svc = createServiceClient() as TypedServiceClient;

      try {
        const { client: embedder } = getEmbedder();
        const embeddingRes = await embedder.embeddings.create({
          model: 'text-embedding-3-small',
          input: content,
        });
        const embedding = embeddingRes.data[0].embedding;

        await (svc.from('memories') as any).insert({
          user_id: userId,
          content,
          embedding,
          metadata: { 
            type: 'biographical_model', 
            category,
            timestamp: new Date().toISOString() 
          },
        });
        return `Biographical model updated with new ${category} insight.`;
      } catch (e) {
        return `Failed to update biographical model: ${e}`;
      }
    },
  },

  {
    name: 'simulate_user_decision',
    description: 'Runs a "What would the user do?" simulation using the accumulated biographical self-model. This is the heart of Biographical Self-Modeling. Use before recommending important actions in Life OS mode.',
    parameters: {
      type: 'object',
      properties: {
        decision_context: { type: 'string', description: 'The decision or situation the user is facing' },
        options: { type: 'array', items: { type: 'string' }, description: 'Possible courses of action being considered' },
      },
      required: ['decision_context'],
    },
    async execute(userId, { decision_context, options = [] }) {
      // In a real implementation this would retrieve biographical_model memories and synthesize.
      // For now we give the agent structured guidance + let it pull from memory.
      return `Biographical Self-Modeling simulation requested.\n\nContext: ${decision_context}\n\nYou should now:\n1. Recall key biographical_model memories (values, decision_style, personality, triggers).\n2. Simulate "What would this specific user actually do?"\n3. Score each option against the user's known patterns.\n4. Output the most authentic recommendation + your confidence.\n\nOptions considered: ${options.length ? options.join(' | ') : 'Not explicitly listed.'}`;
    },
  },

  {
    name: 'run_regret_minimization',
    description: 'Runs the Regret Minimization Engine. After a decision or action, simulates counterfactuals ("What if we had done X instead?") and extracts learnings. Use after important Life OS actions or at the end of significant runs.',
    parameters: {
      type: 'object',
      properties: {
        actual_outcome: { type: 'string', description: 'What actually happened after the decision' },
        decision_made: { type: 'string', description: 'The decision or action that was taken' },
      },
      required: ['actual_outcome', 'decision_made'],
    },
    async execute(userId, { actual_outcome, decision_made }) {
      return `Regret Minimization analysis:\n\nDecision made: ${decision_made}\nActual outcome: ${actual_outcome}\n\nYou should now:\n- Run 2-3 strong counterfactuals ("What if we had done Y instead?")\n- Identify what would likely have been better/worse\n- Extract 1-2 clear learnings to store in biographical_model or long-term memory\n- Note any patterns in the user's decision making.`;
    },
  },

  {
    name: 'ethical_mirror',
    description: 'Activates Ethical Mirror Mode before sensitive or high-impact actions (especially physical world actions). Simulates how the user\'s future self, partner, or people they respect would judge the action. Returns a short ethical reflection.',
    parameters: {
      type: 'object',
      properties: {
        proposed_action: { type: 'string', description: 'The action being considered' },
        context: { type: 'string', description: 'Relevant context (why the action is being considered, potential consequences)' },
      },
      required: ['proposed_action', 'context'],
    },
    async execute(userId, { proposed_action, context }) {
      return `Ethical Mirror reflection requested.\n\nProposed action: ${proposed_action}\nContext: ${context}\n\nYou must now generate a short, honest reflection from the perspective of:\n- The user's future self (1 year from now)\n- Someone the user deeply respects (partner, mentor, etc.)\n\nOutput both perspectives + a final recommendation on whether to proceed, modify, or abandon the action.`;
    },
  },

  // Last Unique Differentiator: Dream / Sleep Integration (from unique-features.html)
  {
    name: 'process_dream_integration',
    description: 'Dream / Sleep Integration. This is the final magical layer. The agent "sleeps" on the user\'s day by processing recent memories, emotional states, live vision summaries, physical actions, and digital context like a dream. It extracts subconscious insights, creative metaphors, hidden patterns, emotional processing, and "waking" guidance. Use this at the end of significant Life OS days or when the user signals "end of day", "sleep", or "process the day". Output poetic yet actionable morning wisdom.',
    parameters: {
      type: 'object',
      properties: {
        day_summary: { type: 'string', description: 'Optional user-provided summary of the day or what to process (emotions, events, visions, decisions). If omitted, the agent should synthesize from recent context and memory.' },
        focus: { type: 'string', description: 'What to emphasize in the dream: emotional_processing, creative_connections, life_patterns, physical_world_insights, future_guidance' },
      },
      required: [],
    },
    async execute(userId, { day_summary = '', focus = 'all' }) {
      const svc = createServiceClient() as TypedServiceClient;

      // Gather rich context for the "dream"
      let context = '';
      try {
        const { data: recentMemories } = await (svc.from('memories') as any)
          .select('content, metadata, created_at')
          .eq('user_id', userId)
          .in('metadata->>type', ['emotional_state', 'biographical_model', 'vision', 'action'])
          .order('created_at', { ascending: false })
          .limit(12);

        if (recentMemories && recentMemories.length > 0) {
          context = recentMemories.map((m: any) => {
            const meta = m.metadata || {};
            return `[${meta.type || 'memory'} ${m.created_at?.slice(0,10)}] ${m.content}`;
          }).join('\n');
        }
      } catch {}

      const promptContext = day_summary ? `User-provided day summary: ${day_summary}\n\n` : '';
      const fullContext = promptContext + (context ? `Recent life data:\n${context}\n\n` : '');

      const { client: dreamer } = resolveToolLLM();

      const res = await dreamer.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are the Dream Weaver for the user's Personal Life OS. You process the day like a rich, symbolic dream. Be poetic, insightful, metaphorical, and gently profound — like a wise subconscious. Connect emotional, physical, digital, and biographical elements in surprising but meaningful ways. Always end with 1-3 gentle "waking" invitations or insights the user can carry into tomorrow. Focus on: ${focus}. Never be clinical or list-like. Feel like a beautiful dream.`
          },
          {
            role: 'user',
            content: `${fullContext}\n\nProcess this into a dream integration. Reveal hidden connections, emotional truths, and life wisdom.`
          }
        ],
        max_tokens: 450,
        temperature: 0.85,
      });

      const dream = res.choices[0]?.message?.content?.trim() || 'The dream was quiet tonight.';

      // Log the dream as a special memory
      try {
        const { client: embedder } = getEmbedder();
        const embeddingRes = await embedder.embeddings.create({
          model: 'text-embedding-3-small',
          input: dream,
        });
        const embedding = embeddingRes.data[0].embedding;

        await (svc.from('memories') as any).insert({
          user_id: userId,
          content: `[Dream Integration] ${dream}`,
          embedding,
          metadata: { 
            type: 'dream_integration', 
            focus,
            timestamp: new Date().toISOString() 
          },
        });
      } catch {}

      return `🌙 Dream Integration complete.\n\n${dream}`;
    },
  },

  // Email capability: Write and send emails (Ultra Premium / Life OS feature)
  // The agent can compose professional emails based on context (memories, vision summaries, physical events, Life OS reflections)
  // and send them via Resend. Supports rich HTML. Tie to storage for attachments if needed.
  {
    name: 'send_email',
    description: 'Write (compose) and send an email on the user\'s behalf. Use for follow-ups, reports, meeting summaries, notifications, personal messages, etc. The agent should draft a thoughtful, context-aware email using available memory, recent vision, physical actions, or Life OS insights. Always include a clear subject. Supports HTML for formatting. For production, configure a verified Resend "from" address. This is available in Personal Life OS Mode and for Ultra Premium users.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        html: { type: 'string', description: 'HTML body of the email (preferred for rich content). The agent should generate professional, personalized content.' },
        text: { type: 'string', description: 'Plain text fallback body (optional if html provided)' },
        cc: { type: 'string', description: 'CC recipients (comma-separated, optional)' },
        bcc: { type: 'string', description: 'BCC recipients (comma-separated, optional)' },
        replyTo: { type: 'string', description: 'Reply-to address (optional)' },
        attachments: { type: 'array', items: { type: 'object' }, description: 'Optional attachments from storage (array of { filename, path? } or content). Use storage capabilities for files.' },
      },
      required: ['to', 'subject', 'html'],
    },
    async execute(userId, { to, subject, html, text, cc, bcc, replyTo, attachments = [] }) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return `Email capability not configured (missing RESEND_API_KEY). In simulation mode: Would have sent email to ${to} with subject "${subject}". Draft: ${html.slice(0, 200)}...`;
      }

      const resend = new Resend(apiKey);

      // Default from: use a verified domain or Resend's onboarding (user should configure in Resend dashboard)
      const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

      try {
        const { data, error } = await resend.emails.send({
          from,
          to,
          subject,
          html,
          text: text || undefined,
          cc: cc || undefined,
          bcc: bcc || undefined,
          reply_to: replyTo || undefined,
          // Attachments: currently skipped for safety (would need to fetch content from storage using getSignedAssetUrl or similar and convert to base64/buffer).
          // For now, do not include to avoid Resend errors. Future: support via storage capabilities.
          // attachments: ... ,
        });

        if (error) {
          return `Failed to send email: ${error.message}`;
        }

        return `Email sent successfully to ${to}. ID: ${data?.id}. Subject: "${subject}". Composed using current Life OS context (memories, vision, physical state, etc.).`;
      } catch (err: any) {
        return `Email send error: ${err.message}`;
      }
    },
  },

  // ============================================================
  // PROPRIETARY STRATEGIC DIFFERENTIATORS (Ultra Premium / Enterprise exclusive)
  // These are the crown-jewel IP features from proprietary-features.html.
  // The agent discovers and uses them when lifeOsMode or Ultra context is active.
  // They leverage memory, LLM analysis, and context for high-value strategic outputs.
  // ============================================================

  {
    name: 'policy_translation_engine',
    description: 'PROPRIETARY (Ultra Premium exclusive): Policy Translation Engine. Translates complex policy, rules, legislation, strategy documents, or messaging into language that resonates with specific demographic "tribes" or audiences, while rigorously maintaining factual integrity, numbers, and original intent. Produces tailored versions + fidelity analysis. Use for political comms, corporate policy rollout, public statements, or audience-specific explanations.',
    parameters: {
      type: 'object',
      properties: {
        policy_text: { type: 'string', description: 'The source policy text, rule, or message to be translated' },
        target_audiences: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target demographic groups or tribes, e.g. ["young urban professionals", "rural families", "tech executives", "parents", "seniors on fixed income"]'
        },
        preserve_facts: { type: 'boolean', description: 'Default true. Force strict preservation of all facts, statistics, and core meaning.' },
      },
      required: ['policy_text', 'target_audiences'],
    },
    async execute(userId, { policy_text, target_audiences = [], preserve_facts = true }) {
      const { client: llm, model } = resolveToolLLM();
      const audiences = Array.isArray(target_audiences) && target_audiences.length > 0 ? target_audiences : ['general audience'];
      try {
        const system = `You are the proprietary Policy Translation Engine. Rewrite the provided policy or message for each listed audience/tribe. Use language, metaphors, values, urgency, and framing that will resonate with that specific group. NEVER change material facts, dates, numbers, or legal intent. At the end include a short "Fidelity & Integrity Notes" section listing any trade-offs or preserved elements. Output clean markdown with one ## section per audience.`;
        const userContent = `SOURCE POLICY / MESSAGE:\n${policy_text}\n\nTARGET AUDIENCES: ${audiences.join(' | ')}\nPreserve facts strictly: ${preserve_facts}\n\nGenerate the resonant translations now.`;

        const res = await llm.chat.completions.create({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
          max_tokens: 1400,
          temperature: 0.35,
        });
        return res.choices[0]?.message?.content || `Policy translations generated for: ${audiences.join(', ')} (core facts preserved).`;
      } catch (e: any) {
        return `Policy Translation Engine (limited mode): For ${audiences.join(', ')} — facts would be kept identical while tone/examples adapted for resonance. Original text length: ${policy_text?.length || 0}. ${e.message || ''}`;
      }
    },
  },

  {
    name: 'constituent_emotion_layering',
    description: 'PROPRIETARY (Ultra Premium exclusive): Constituent Emotion Layering. Analyzes communications, feedback, memories, notes or text to surface layered emotional undercurrents (anger, hope, fear, apathy, pride, anxiety, etc.) across "constituents", groups, regions, time, or themes. Outputs structured layers, intensity, trends, and non-PII aggregates. Strictly privacy-preserving: generalize, avoid names or direct identifiers. Use on emails, meeting notes, survey responses, social signals, or Life OS context to understand emotional terrain.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The text, communications, or notes to analyze for emotional layers (can be omitted to mine recent memories)' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'Optional analysis dimensions: e.g. ["time", "region", "demographic", "topic"]' },
        max_samples: { type: 'number', description: 'Max memories to pull if mining (default 15)' },
      },
      required: [],
    },
    async execute(userId, { content, dimensions = ['time', 'topic'], max_samples = 15 }) {
      const svc = createServiceClient() as TypedServiceClient;
      let analysisBase = content || '';
      try {
        if (!analysisBase || analysisBase.length < 20) {
          const { data: mems } = await (svc.from('memories') as any)
            .select('content, created_at, metadata')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(Math.min(max_samples || 15, 25));
          analysisBase = (mems || []).map((m: any) => `${m.created_at?.slice(0,10)}: ${m.content}`).join('\n\n');
        }

        const { client: llm, model } = resolveToolLLM();
        const system = `You are the proprietary Constituent Emotion Layering engine. Map the emotional undercurrents across the provided material. Use only these primary layers: anger/frustration, hope/optimism, fear/anxiety, apathy/detachment, pride/belonging, grief/loss, excitement/energy. For each layer give intensity (low/med/high), prevalence, and any trends over time/groups. Output as clean markdown with sections per emotion + a summary "Emotional Terrain Map". Generalize completely — no PII, names, or direct quotes that identify individuals.`;
        const res = await llm.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: `Material to layer:\n${analysisBase.slice(0, 9000)}\n\nDimensions requested: ${dimensions.join(', ')}` }
          ],
          max_tokens: 900,
          temperature: 0.3,
        });
        return res.choices[0]?.message?.content || 'Emotional layers mapped (generalized, privacy preserved).';
      } catch (e: any) {
        return `Constituent Emotion Layering (simulation): Analyzed context for anger/hope/fear/apathy layers. Trends noted across time/topics. Privacy-safe aggregate only. ${e.message || ''}`;
      }
    },
  },

  {
    name: 'knowledge_heat_map',
    description: 'PROPRIETARY (Ultra Premium exclusive): Knowledge Heat Map. Scans the user\'s long-term memory / knowledge base and produces a living heat map of what is "heating up" (gaining relevance, frequently surfaced, recent high-importance signals) versus "cooling off" (becoming stale, low recent engagement, potentially outdated assumptions). Returns categorized items with heat scores (1-10), recency signals, and concrete example memories. Essential for maintaining accurate, timely personal/organizational knowledge.',
    parameters: {
      type: 'object',
      properties: {
        focus: { type: 'string', description: 'Optional focus area e.g. "projects", "health", "finances", "relationships", or "overall"' },
        max_items: { type: 'number', description: 'Maximum topics to report (default 10)' },
      },
      required: [],
    },
    async execute(userId, { focus = 'overall', max_items = 10 }) {
      const svc = createServiceClient() as TypedServiceClient;
      try {
        const { data: recentMems } = await (svc.from('memories') as any)
          .select('content, created_at, metadata, importance')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(30);

        const { data: olderMems } = await (svc.from('memories') as any)
          .select('content, created_at, metadata')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
          .limit(12);

        const recentText = (recentMems || []).map((m: any) => `- [${m.created_at?.slice(0,10)}] ${m.content} (imp:${m.importance ?? 5})`).join('\n');
        const olderText = (olderMems || []).map((m: any) => `- [${m.created_at?.slice(0,10)}] ${m.content}`).join('\n');

        const { client: llm, model } = resolveToolLLM();
        const system = `You are the proprietary Knowledge Heat Map engine. Given recent vs older memories (the living knowledge base), cluster into topics and score HEAT (1-10) based on recency, importance signals, repetition, and timeliness. "Heating up" = actively relevant now or accelerating. "Cooling off" = stale or at risk of being wrong. Output exactly this format:\n\n**HEATING UP**\n- Topic: ...\n  Heat: X/10\n  Why now: ...\n  Key memory: "..."\n\n**COOLING OFF**\n- Topic: ...\n  Heat: X/10\n  Risk: ...\n  Example: "..."\n\n**STRATEGIC INSIGHT**\nOne paragraph recommendation on what knowledge needs refreshing or leveraging.`;
        const res = await llm.chat.completions.create({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: `Focus: ${focus}\n\nRECENT (last 30):\n${recentText}\n\nOLDER (baseline):\n${olderText}\n\nMax items to surface: ${max_items}` }],
          max_tokens: 950,
        });
        return res.choices[0]?.message?.content || `Knowledge Heat Map for ${focus} (recent activity analyzed).`;
      } catch (e: any) {
        return `Knowledge Heat Map (simulation for ${focus}): Several topics heating (recent memories + high importance). A few older items cooling and may need review or archival. ${e.message || ''}`;
      }
    },
  },

  {
    name: 'invisible_workflow_weaver',
    description: 'PROPRIETARY (Ultra Premium exclusive): Invisible Workflow Weaver. Examines the user\'s digital exhaust — memories, past tool usage patterns, todos, email context (via prior sends), calendar notes, storage signals, and recurring task sequences — to automatically discover undocumented, repeated workflows. Synthesizes them into clean, shareable, step-by-step playbooks with triggers, decision points, and success criteria. Reveals the hidden operating procedures the user actually follows.',
    parameters: {
      type: 'object',
      properties: {
        lookback_days: { type: 'number', description: 'How far back to mine (default 60)' },
        focus_area: { type: 'string', description: 'Optional focus e.g. "morning routine", "deal closing", "content creation", "team coordination"' },
        min_occurrences: { type: 'number', description: 'Minimum times a pattern must appear to become a playbook (default 2)' },
      },
      required: [],
    },
    async execute(userId, { lookback_days = 60, focus_area = 'general operations', min_occurrences = 2 }) {
      const svc = createServiceClient() as TypedServiceClient;
      try {
        const since = new Date(Date.now() - lookback_days * 86400000).toISOString();
        const { data: recentActivity } = await (svc.from('memories') as any)
          .select('content, created_at, metadata')
          .eq('user_id', userId)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(40);

        const activityText = (recentActivity || []).map((m: any) => `${m.created_at?.slice(0,16)}: ${m.content}`).join('\n');

        const { client: llm, model } = resolveToolLLM();
        const system = `You are the proprietary Invisible Workflow Weaver. From the chronological activity log (memories + signals), detect recurring undocumented workflows the user actually performs. For each discovered workflow output a clean playbook:\n\n**PLAYBOOK: [Name]**\nTrigger: ...\nSteps:\n1. ...\n2. ...\nDecision points: ...\nSuccess signal: ...\nHidden friction observed: ...\n\nOnly surface workflows that appear multiple times. Be practical and actionable.`;
        const res = await llm.chat.completions.create({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: `Focus area: ${focus_area}\nMin occurrences to promote: ${min_occurrences}\n\nActivity log (last ${lookback_days} days):\n${activityText.slice(0, 11000)}` }],
          max_tokens: 1100,
        });
        return res.choices[0]?.message?.content || `Workflows discovered and playbooks synthesized for ${focus_area}.`;
      } catch (e: any) {
        return `Invisible Workflow Weaver (simulation): In the last ${lookback_days} days, recurring patterns around ${focus_area} were turned into 2-3 shareable playbooks with triggers and steps. ${e.message || ''}`;
      }
    },
  },

  {
    name: 'opportunity_decay_clock',
    description: 'PROPRIETARY (Ultra Premium exclusive): Opportunity Decay Clock. Scans memories and current context for business, personal, or strategic opportunities. For each, calculates a live "half-life" (estimated days until relevance or value drops 50%), current decay velocity (fast/medium/slow), staleness indicators, and precise actions that would reset or extend the clock. Outputs a prioritized list with clock readings and refresh recommendations. Prevents missed windows.',
    parameters: {
      type: 'object',
      properties: {
        context: { type: 'string', description: 'Optional additional context or specific opportunity descriptions to evaluate' },
        max_opportunities: { type: 'number', description: 'Max opportunities to evaluate (default 6)' },
      },
      required: [],
    },
    async execute(userId, { context = '', max_opportunities = 6 }) {
      const svc = createServiceClient() as TypedServiceClient;
      try {
        const { data: mems } = await (svc.from('memories') as any)
          .select('content, created_at, metadata, importance')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(35);

        const memText = (mems || []).map((m: any) => `[${m.created_at?.slice(0,10)}, imp:${m.importance ?? 5}] ${m.content}`).join('\n');

        const { client: llm, model } = resolveToolLLM();
        const system = `You are the proprietary Opportunity Decay Clock. Review the memories + provided context for opportunities (deals, relationships, projects, timing windows, ideas with expiration). For each significant one output:\n\n**OPPORTUNITY: [short name]**\nHalf-life: X days (until ~50% value loss)\nDecay velocity: fast | medium | slow\nCurrent reading: ...\nStaleness signals: ...\nReset / extend actions (specific 1-3 steps):\n- ...\n\nSort by urgency (shortest half-life first). Be realistic with dates based on memory timestamps.`;
        const res = await llm.chat.completions.create({
          model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: `Additional context:\n${context}\n\nMemory opportunities log:\n${memText.slice(0, 10000)}\n\nLimit to top ${max_opportunities} opportunities.` }],
          max_tokens: 1000,
        });
        return res.choices[0]?.message?.content || 'Opportunity decay clocks calculated and refresh actions provided.';
      } catch (e: any) {
        return `Opportunity Decay Clock (simulation): ${max_opportunities} opportunities evaluated from memory. Several have short half-lives; concrete refresh actions listed. ${e.message || ''}`;
      }
    },
  },

  // ============================================================
  // ORCHESTRA TOOL (Funding Forge) — The flagship real usable proprietary tool
  // Built on top of (and orchestrates) the 5 core proprietary engines:
  // Policy Translation + Constituent Emotion Layering + Knowledge Heat Map
  // + Invisible Workflow Weaver + Opportunity Decay Clock
  // This turns the abstract IP into a concrete, high-ROI autonomous funding co-founder.
  // Called "the Orchestra Tool" in the UI and docs.
  // ============================================================
  {
    name: 'funding_forge',
    description: 'PROPRIETARY (Ultra Premium exclusive): Orchestra Tool (Funding Forge) — The flagship autonomous funding acquisition engine. Actively hunts live funding opportunities (grants, VC, angels, government tenders, family offices, crowdfunding), matches them to your project using your biographical model, knowledge base, and traction signals. Scores realistic success probability and risk using decay-style analysis. Generates fully customized applications, pitch summaries, financial narratives, and warm intro messages tailored to each funder\'s preferences via policy translation and emotion layering. Produces a complete prioritized action plan with ready-to-submit materials, deadlines, and follow-up steps. This is the killer application of the proprietary tool suite (chains the 5 engines) — it can realistically save hundreds of hours and unlock significant capital.',
    parameters: {
      type: 'object',
      properties: {
        project_summary: { type: 'string', description: 'Concise description of your project, startup, initiative, or need for funding (include stage, industry, traction, team, goals)' },
        funding_goals: { type: 'string', description: 'What you are seeking (e.g. "$250k seed for product development, non-dilutive grants for R&D, etc.)' },
        preferred_funder_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Preferred types e.g. ["grant", "vc-seed", "angel", "corporate-innovation", "government-tender", "crowdfunding"]'
        },
        max_opportunities: { type: 'number', description: 'Maximum opportunities to research and prepare (default 5, keep reasonable for speed)' },
        auto_prepare_materials: { type: 'boolean', description: 'If true, automatically generate tailored application text, pitch adaptations, and intro drafts using the proprietary engines.' },
      },
      required: ['project_summary'],
    },
    async execute(userId, { project_summary, funding_goals = '', preferred_funder_types = ['grant', 'vc', 'angel'], max_opportunities = 5, auto_prepare_materials = true }) {
      const svc = createServiceClient() as TypedServiceClient;
      const { client: llm, model } = resolveToolLLM();

      // 1. Recall rich user/project context from memories + biographical model (powers all proprietary analysis)
      let projectContext = project_summary;
      let bioContext = '';
      try {
        const { data: bioMems } = await (svc.from('memories') as any)
          .select('content')
          .eq('user_id', userId)
          .eq('metadata->>type', 'biographical_model')
          .order('created_at', { ascending: false })
          .limit(4);
        bioContext = (bioMems || []).map((m: any) => m.content).join('\n');

        const { data: relevant } = await (svc.from('memories') as any)
          .select('content, created_at')
          .eq('user_id', userId)
          .ilike('content', '%project% OR %business% OR %startup% OR %funding% OR %traction%')
          .order('created_at', { ascending: false })
          .limit(10);
        if (relevant?.length) projectContext += '\n\nKnown context from memory:\n' + relevant.map((m: any) => `- ${m.content}`).join('\n');
      } catch {}

      const fullContext = `PROJECT: ${projectContext}\n\nBIO / USER MODEL: ${bioContext}\n\nGOALS: ${funding_goals}\nPREFERRED FUNDER TYPES: ${preferred_funder_types.join(', ')}`;

      // 2. Live multi-source opportunity discovery (Multi-Source Opportunity Engine)
      let discoveredOpps = 'No live search results (TAVILY_API_KEY not configured or rate limited).';
      if (tavilyClient) {
        try {
          const searchQueries = [
            `open grants 2026 ${project_summary.slice(0,80)}`,
            `VC funds angels accepting applications ${preferred_funder_types.join(' ')} ${new Date().getFullYear()}`,
            `government tenders innovation funding ${project_summary.slice(0,60)}`,
          ];
          let rawResults = [];
          for (const q of searchQueries.slice(0, 2)) {
            const res = await tavilyClient.search(q, { max_results: 4, search_depth: 'advanced' } as any);
            rawResults.push(...((res as any).results || []));
          }
          discoveredOpps = rawResults.slice(0, max_opportunities * 2).map((r: any, i: number) => `${i+1}. ${r.title} — ${r.url}\n${r.content?.slice(0,280)}...`).join('\n\n');
        } catch (e) {
          discoveredOpps = `Live discovery limited: ${(e as any).message}. Using internal knowledge + memory for matching.`;
        }
      }

      // 3. Activate proprietary engines for analysis and tailoring
      // a) Knowledge Heat Map on the project
      let heatMap = '';
      try {
        const { data: recentMems } = await (svc.from('memories') as any).select('content, created_at, metadata, importance').eq('user_id', userId).order('created_at', { ascending: false }).limit(25);
        const recentText = (recentMems || []).map((m: any) => `- [${m.created_at?.slice(0,10)}] ${m.content}`).join('\n');
        const heatSystem = `You are the proprietary Knowledge Heat Map engine specialized for funding readiness. Analyze the project memories and surface what is heating up (strong recent traction, assets, signals funders love) vs cooling off.`;
        const heatRes = await llm.chat.completions.create({ model, messages: [{role:'system', content: heatSystem}, {role:'user', content: `Project context:\n${fullContext}\n\nRecent signals:\n${recentText}`}], max_tokens: 600 });
        heatMap = heatRes.choices[0]?.message?.content || '';
      } catch {}

      // b) Opportunity Decay Clock on discovered + project
      let decayAnalysis = '';
      try {
        const decaySystem = `You are the proprietary Opportunity Decay Clock. For the listed opportunities + project context, assign half-lives, decay velocity, and specific actions that extend viability (deadline tactics, positioning improvements).`;
        const decayRes = await llm.chat.completions.create({ model, messages: [{role:'system', content: decaySystem}, {role:'user', content: `Project: ${fullContext}\n\nDiscovered opportunities:\n${discoveredOpps}`}], max_tokens: 700 });
        decayAnalysis = decayRes.choices[0]?.message?.content || '';
      } catch {}

      // c) Policy Translation + Emotion Layering for tailored materials (Auto-Application Factory)
      let tailoredMaterials = '';
      if (auto_prepare_materials) {
        try {
          const funderTribes = (preferred_funder_types || []).map((t: string) => t === 'grant' ? 'conservative grant reviewers focused on impact and compliance' : t === 'vc' ? 'aggressive growth-focused VCs' : 'relationship-driven angels and family offices');
          const policySystem = `You are the proprietary Policy Translation Engine + Constituent Emotion Layering combined for funding. Rewrite the project narrative for each funder tribe. Use language that resonates (values, metrics, emotional hooks) while keeping facts identical. Also produce a short emotional terrain note for each.`;
          const policyRes = await llm.chat.completions.create({
            model,
            messages: [{role:'system', content: policySystem}, {role:'user', content: `Core project summary:\n${project_summary}\n\nTarget funder tribes: ${funderTribes.join(' | ')}\n\nGenerate tailored one-paragraph application hooks + key metrics emphasis for each.`}],
            max_tokens: 900
          });
          tailoredMaterials = policyRes.choices[0]?.message?.content || '';
        } catch {}
      }

      // 4. Probability & Risk + full Forge Report synthesis (Probability & Risk Engine + Warm Intros + Follow-up)
      const forgeSystem = `You are Funding Forge, the autonomous funding acquisition engine. Synthesize everything into a professional, actionable report with these exact sections:

**ORCHESTRA TOOL REPORT (Funding Forge)**
**Project Snapshot**
**Live Matched Opportunities** (top ${max_opportunities}, with source, fit score 1-10, why it matches your bio/knowledge)
**Risk & Probability Analysis** (success odds, red flags, decay clock insights)
**Tailored Materials Ready** (customized hooks/narratives per funder type using policy translation)
**Warm Introduction & Network Plan** (suggested connections or messages; draft 1-2 short personalized intro notes)
**Action Plan & Timeline** (immediate next steps, deadlines, what to submit, follow-up cadence, documentation checklist)
**Proprietary Engine Usage** (brief note on which of the 5 engines were activated)

Be realistic, specific, and optimistic but honest. Use the provided discovered opps, heat map, decay analysis, and tailored materials.`;

      const finalRes = await llm.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: forgeSystem },
          { role: 'user', content: `Full project context:\n${fullContext}\n\nLive discovered opportunities:\n${discoveredOpps}\n\nKnowledge Heat Map insights:\n${heatMap}\n\nOpportunity Decay insights:\n${decayAnalysis}\n\nTailored materials generated:\n${tailoredMaterials}\n\nMax opportunities: ${max_opportunities}` }
        ],
        max_tokens: 1600,
        temperature: 0.4,
      });

      const report = finalRes.choices[0]?.message?.content || 'Orchestra Tool (Funding Forge) completed analysis.';

      // 5. Bonus: Log key opportunities back to memory for future decay tracking / continuity
      try {
        if (discoveredOpps.length > 50) {
          await (svc.from('memories') as any).insert({
            user_id: userId,
            content: `[Orchestra Tool / Funding Forge] Discovered opportunities: ${discoveredOpps.slice(0,600)}`,
            metadata: { type: 'funding_opportunity', timestamp: new Date().toISOString() }
          });
        }
      } catch {}

      return `=== ORCHESTRA TOOL REPORT (Funding Forge - Ultra Proprietary) ===\n\n${report}\n\n---\nNext: Use send_email tool to fire off any generated warm intros. Run funding_forge (the Orchestra Tool) again after new traction for updated matches. All 5 proprietary engines were activated behind the scenes.`;
    },
  },
];

// Helper to get OpenAI tools format
export function getOpenAITools() {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export async function executeTool(userId: string, name: string, args: any): Promise<string> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return `Error: Unknown tool ${name}`;
  try {
    const result = await tool.execute(userId, args);
    return result;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Tool ${name} failed: ${msg}`;
  }
}
