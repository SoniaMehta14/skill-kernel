/**
 * Supabase Client Library
 * Handles all database interactions for skills
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

interface ExecutionLogEntry {
  task_id: string;
  status: "pending" | "running" | "success" | "error";
  output?: string;
  error_message?: string;
  thought_process?: Record<string, unknown>;
  started_at?: Date;
  completed_at?: Date;
  metadata?: Record<string, unknown>;
}

interface TaskRecord {
  id: string;
  name: string;
  description?: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "human_intervened";
  user_id?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

class SupabaseClient {
  private client: SupabaseClient;
  private projectUrl: string;
  private anonKey: string;

  constructor(projectUrl: string, anonKey: string) {
    this.projectUrl = projectUrl;
    this.anonKey = anonKey;
    this.client = createClient(projectUrl, anonKey);
  }

  /**
   * Create a new task
   */
  async createTask(task: Omit<TaskRecord, "id" | "created_at" | "updated_at">): Promise<TaskRecord> {
    const { data, error } = await this.client
      .from("tasks")
      .insert([task])
      .select()
      .single();

    if (error) throw new Error(`Failed to create task: ${error.message}`);
    return data as TaskRecord;
  }

  /**
   * Get task by ID
   */
  async getTask(id: string): Promise<TaskRecord> {
    const { data, error } = await this.client
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(`Failed to fetch task: ${error.message}`);
    return data as TaskRecord;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(
    id: string,
    status: TaskRecord["status"]
  ): Promise<TaskRecord> {
    const { data, error } = await this.client
      .from("tasks")
      .update({ status, updated_at: new Date() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update task: ${error.message}`);
    return data as TaskRecord;
  }

  /**
   * Log execution details
   */
  async logExecution(entry: ExecutionLogEntry): Promise<string> {
    const { data, error } = await this.client
      .from("execution_logs")
      .insert([entry])
      .select("id")
      .single();

    if (error) throw new Error(`Failed to log execution: ${error.message}`);
    return data.id;
  }

  /**
   * Get execution logs for a task
   */
  async getExecutionLogs(
    taskId: string,
    limit = 100
  ): Promise<ExecutionLogEntry[]> {
    const { data, error } = await this.client
      .from("execution_logs")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to fetch logs: ${error.message}`);
    return data as ExecutionLogEntry[];
  }

  /**
   * Execute raw SQL query
   */
  async executeQuery(query: string, params?: any[]): Promise<any> {
    const { data, error } = await this.client.rpc("execute_query", {
      query,
      params: params || [],
    });

    if (error) throw new Error(`Query failed: ${error.message}`);
    return data;
  }

  /**
   * Update token usage for a task
   */
  async updateTokenUsage(id: string, tokens_used: number): Promise<TaskRecord> {
    const { data, error } = await this.client
      .from("tasks")
      .update({
        token_used: tokens_used,
        updated_at: new Date(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update token usage: ${error.message}`);
    return data as TaskRecord;
  }

  /**
   * Increment iteration counter
   */
  async incrementIterationCount(id: string): Promise<number> {
    const { data: current } = await this.client
      .from("tasks")
      .select("iteration_count")
      .eq("id", id)
      .single();

    const newCount = (current?.iteration_count || 0) + 1;

    const { data, error } = await this.client
      .from("tasks")
      .update({
        iteration_count: newCount,
        updated_at: new Date(),
      })
      .eq("id", id)
      .select("iteration_count")
      .single();

    if (error) throw new Error(`Failed to increment iterations: ${error.message}`);
    return data.iteration_count;
  }

  /**
   * Get budget alerts for a task
   */
  async getBudgetAlerts(taskId: string): Promise<any[]> {
    const { data, error } = await this.client
      .from("task_budget_alerts")
      .select("*")
      .eq("task_id", taskId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to fetch alerts: ${error.message}`);
    return data;
  }

  /**
   * Create a budget alert
   */
  async createBudgetAlert(
    taskId: string,
    alert_type: string,
    severity: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const { data, error } = await this.client
      .from("task_budget_alerts")
      .insert([
        {
          task_id: taskId,
          alert_type,
          severity,
          message,
          metadata,
        },
      ])
      .select("id")
      .single();

    if (error) throw new Error(`Failed to create alert: ${error.message}`);
    return data.id;
  }

export { SupabaseClient, ExecutionLogEntry, TaskRecord };
