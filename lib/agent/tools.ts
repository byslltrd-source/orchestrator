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
