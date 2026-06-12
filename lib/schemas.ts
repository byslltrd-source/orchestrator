import { z } from 'zod';

// Reusable primitives
export const TaskSchema = z.string().min(3).max(4000);
export const AutonomousFlagSchema = z.boolean().optional().default(false);

// For the main /api/orchestrate form submission
export const OrchestrateInputSchema = z.object({
  task: TaskSchema,
  autonomous: AutonomousFlagSchema,
  // Images are handled separately (File[] from formData)
});

// For tool arguments (used in executor / tools for runtime safety)
export const WebSearchArgsSchema = z.object({
  query: z.string().min(2),
  num_results: z.number().int().min(1).max(10).optional(),
});

export const BrowsePageArgsSchema = z.object({
  url: z.string().url(),
  instructions: z.string().optional(),
});

export const SaveMemoryArgsSchema = z.object({
  content: z.string().min(5),
  importance: z.number().int().min(1).max(10).optional(),
  tags: z.array(z.string()).optional(),
});

export const SearchMemoriesArgsSchema = z.object({
  query: z.string().min(2),
  max_results: z.number().int().min(1).max(20).optional(),
});

export const AddTodoArgsSchema = z.object({
  task: z.string().min(1),
  priority: z.number().int().min(1).max(5).optional(),
});

export const CompleteTaskArgsSchema = z.object({
  task: z.string().min(1),
});

export const FinalAnswerArgsSchema = z.object({
  answer: z.string().min(1),
});

// Union for all known tool args (for type narrowing in executor)
export const ToolArgsSchema = z.union([
  WebSearchArgsSchema,
  BrowsePageArgsSchema,
  SaveMemoryArgsSchema,
  SearchMemoriesArgsSchema,
  AddTodoArgsSchema,
  CompleteTaskArgsSchema,
  FinalAnswerArgsSchema,
]);

export type OrchestrateInput = z.infer<typeof OrchestrateInputSchema>;
export type ToolArgs = z.infer<typeof ToolArgsSchema>;

// Helper to safely parse tool args coming from the LLM
export function parseToolArgs(name: string, raw: unknown) {
  const schemaMap: Record<string, z.ZodTypeAny> = {
    web_search: WebSearchArgsSchema,
    browse_page: BrowsePageArgsSchema,
    save_memory: SaveMemoryArgsSchema,
    search_memories: SearchMemoriesArgsSchema,
    add_todo: AddTodoArgsSchema,
    complete_task: CompleteTaskArgsSchema,
    final_answer: FinalAnswerArgsSchema,
  };

  const schema = schemaMap[name];
  if (!schema) return { success: false, data: null, error: 'Unknown tool' };

  const result = schema.safeParse(raw);
  return result;
}
