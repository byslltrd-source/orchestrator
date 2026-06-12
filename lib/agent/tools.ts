// Copyright (c) 2026 [Your Name or Company]. All rights reserved.
// This source code is proprietary. See LICENSE and the Commercial License Agreement for usage rights.

/* eslint-disable @typescript-eslint/no-explicit-any -- External lib responses (tavily, OpenAI, cheerio text), Supabase service casts, and tool JSON schema are dynamic */

import { createServiceClient } from '@/lib/supabase/service';
import * as cheerio from 'cheerio';
import { tavily } from '@tavily/core';
import type { TypedServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/lib/supabase/database.types';
import { resolveToolLLM, getEmbedder } from '@/lib/ai/client';

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
