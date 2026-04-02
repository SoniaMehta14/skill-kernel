/**
 * Execution Middleware
 * Wraps skill execution with automatic logging to execution_logs
 */

import { SupabaseClient, ExecutionLogEntry } from "./client";

interface SkillExecutionContext {
  task_id: string;
  skill_name: string;
  input: Record<string, unknown>;
  sb: SupabaseClient;
}

interface ExecutionResult {
  log_id: string;
  output: unknown;
  duration_ms: number;
}

/**
 * Wraps a skill function with execution logging middleware
 */
function withExecutionLogging<T extends (...args: any[]) => Promise<any>>(
  skillFn: T,
  skillName: string
) {
  return async (context: SkillExecutionContext): Promise<ExecutionResult> => {
    const startTime = Date.now();
    const { task_id, input, sb } = context;

    // Log execution start
    const logId = await sb.logExecution({
      task_id,
      status: "running",
      thought_process: {
        skill: skillName,
        input,
        started_at: new Date().toISOString()
      }
    });

    try {
      // Execute the skill
      const output = await skillFn(input);
      const duration = Date.now() - startTime;

      // Log success
      await sb.logExecution({
        task_id,
        status: "success",
        output: JSON.stringify(output),
        thought_process: {
          skill: skillName,
          completed_at: new Date().toISOString(),
          duration_ms: duration
        }
      });

      return { log_id: logId, output, duration_ms: duration };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Log error
      await sb.logExecution({
        task_id,
        status: "error",
        error_message: errorMessage,
        thought_process: {
          skill: skillName,
          error_at: new Date().toISOString(),
          duration_ms: duration,
          stack: error instanceof Error ? error.stack : undefined
        }
      });

      throw error;
    }
  };
}

/**
 * Create an execution context for a task
 */
function createExecutionContext(
  taskId: string,
  sb: SupabaseClient
): Omit<SkillExecutionContext, "skill_name" | "input"> {
  return {
    task_id: taskId,
    sb
  };
}

export { withExecutionLogging, createExecutionContext, SkillExecutionContext, ExecutionResult };
