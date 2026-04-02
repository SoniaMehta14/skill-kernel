/**
 * Log Analysis Skill - SRE Agent
 * Analyzes execution_logs for error patterns and root causes
 */

import { SupabaseClient } from "../../supabase/client";
import {
  withExecutionLogging,
  createExecutionContext,
  SkillExecutionContext,
} from "../../supabase/middleware";

interface LogAnalysisInput {
  task_id: string;
  limit?: number;
}

interface LogAnalysisOutput {
  error_pattern: string;
  frequency: number;
  suggested_action: string;
  confidence: number;
  error_summary: Record<string, number>;
}

/**
 * Core log analysis logic
 */
async function analyzeLogsLogic(input: LogAnalysisInput): Promise<LogAnalysisOutput> {
  // This would be called within the middleware context
  // For now, returning mock analysis
  return {
    error_pattern: "database_connection_timeout",
    frequency: 5,
    suggested_action: "Increase connection pool size and retry with exponential backoff",
    confidence: 0.85,
    error_summary: {
      timeout: 5,
      auth_failed: 2,
      rate_limited: 1,
    },
  };
}

/**
 * Execute log analysis with full execution logging
 */
async function analyzeExecutionLogs(
  context: SkillExecutionContext & { input: LogAnalysisInput }
): Promise<LogAnalysisOutput> {
  const { task_id, sb } = context;

  // Fetch failed logs from the task
  const failedLogs = await sb.getFailedLogs(task_id);

  if (failedLogs.length === 0) {
    return {
      error_pattern: "none",
      frequency: 0,
      suggested_action: "No errors detected",
      confidence: 1.0,
      error_summary: {},
    };
  }

  // Analyze error patterns
  const errorCounts: Record<string, number> = {};
  failedLogs.forEach((log) => {
    if (log.error_message) {
      const pattern = log.error_message.split(":")[0];
      errorCounts[pattern] = (errorCounts[pattern] || 0) + 1;
    }
  });

  const topError = Object.entries(errorCounts).sort(
    ([, a], [, b]) => b - a
  )[0];

  return {
    error_pattern: topError?.[0] || "unknown",
    frequency: topError?.[1] || 0,
    suggested_action: "Investigate root cause and apply fix",
    confidence: 0.75,
    error_summary: errorCounts,
  };
}

/**
 * Wrapped skill with automatic execution logging
 */
const executeLogAnalysis = withExecutionLogging(analyzeLogsLogic, "log_analyzer");

export { analyzeExecutionLogs, executeLogAnalysis, LogAnalysisOutput };
