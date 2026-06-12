// Auto-generated style types based on supabase/schema.sql
// These provide strong typing for Supabase queries without requiring a live `supabase gen types` run.
// Update this file when the schema changes.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          subscription_plan: string | null
          current_period_end: string | null
          orchestrations_used: number | null
          orchestrations_limit: number | null
          usage_reset_date: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_plan?: string | null
          current_period_end?: string | null
          orchestrations_used?: number | null
          orchestrations_limit?: number | null
          usage_reset_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          subscription_plan?: string | null
          current_period_end?: string | null
          orchestrations_used?: number | null
          orchestrations_limit?: number | null
          usage_reset_date?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      memories: {
        Row: {
          id: string
          user_id: string
          task_id: string | null
          content: string
          embedding: number[] | null // vector(1536)
          metadata: Json
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          task_id?: string | null
          content: string
          embedding?: number[] | null
          metadata?: Json
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          task_id?: string | null
          content?: string
          embedding?: number[] | null
          metadata?: Json
          created_at?: string | null
        }
      }
      tasks: {
        Row: {
          id: string
          user_id: string
          title: string | null
          goal: string
          status: string | null
          max_steps: number | null
          images: Json // jsonb array of StoredAsset[] (from lib/supabase/storage) or legacy url strings
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          goal: string
          status?: string | null
          max_steps?: number | null
          images?: Json
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          goal?: string
          status?: string | null
          max_steps?: number | null
          images?: Json
          created_at?: string | null
          updated_at?: string | null
        }
      }
      agent_runs: {
        Row: {
          id: string
          task_id: string
          user_id: string
          status: string | null
          current_step: number | null
          final_result: string | null
          error: string | null
          started_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          task_id: string
          user_id: string
          status?: string | null
          current_step?: number | null
          final_result?: string | null
          error?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
        Update: {
          id?: string
          task_id?: string
          user_id?: string
          status?: string | null
          current_step?: number | null
          final_result?: string | null
          error?: string | null
          started_at?: string | null
          completed_at?: string | null
        }
      }
      agent_steps: {
        Row: {
          id: string
          run_id: string
          step_number: number
          type: string
          content: string | null
          tool_name: string | null
          tool_args: Json | null
          tool_result: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          run_id: string
          step_number: number
          type: string
          content?: string | null
          tool_name?: string | null
          tool_args?: Json | null
          tool_result?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          run_id?: string
          step_number?: number
          type?: string
          content?: string | null
          tool_name?: string | null
          tool_args?: Json | null
          tool_result?: string | null
          created_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_memories: {
        Args: {
          query_embedding: number[]
          match_user_id: string
          match_threshold?: number
          match_count?: number
          filter_task_id?: string | null
        }
        Returns: {
          id: string
          content: string
          metadata: Json
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type Inserts<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type Updates<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

// Convenience aliases used across the app
export type ProfileRow = Tables<'profiles'>
export type MemoryRow = Tables<'memories'>
export type TaskRow = Tables<'tasks'>
export type AgentRunRow = Tables<'agent_runs'>
export type AgentStepRow = Tables<'agent_steps'>
