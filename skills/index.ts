/**
 * Skill-Kernel Skills Index
 * Exports all registered skills for easy access
 */

// SRE Skills
export { analyzeExecutionLogs, executeLogAnalysis, LogAnalysisOutput } from "./sre/log-analyzer";

// QA Skills
export { evaluateOutput, executeEvaluation, EvaluationResult } from "./qa/evaluator";

// Communication Skills
export { notifySlack, executeSlackNotify, SlackResponse } from "./comms/slack-notifier";

// Re-export execution utilities
export {
  withExecutionLogging,
  createExecutionContext,
  type SkillExecutionContext,
  type ExecutionResult,
} from "../supabase/middleware";

export { SupabaseClient, type ExecutionLogEntry, type TaskRecord } from "../supabase/client";
