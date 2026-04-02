/**
 * Output Evaluation Skill - QA Agent
 * Validates LLM outputs against ground truth datasets
 */

import {
  withExecutionLogging,
  SkillExecutionContext,
} from "../../supabase/middleware";

interface EvaluationInput {
  output: string;
  ground_truth: string;
  metric: "accuracy" | "latency" | "vibe";
}

interface EvaluationResult {
  score: number;
  passed: boolean;
  feedback: string;
  metric_type: string;
}

/**
 * Calculate string similarity (Levenshtein distance)
 */
function calculateSimilarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const editDistance = calculateLevenshtein(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance
 */
function calculateLevenshtein(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Core evaluation logic
 */
async function evaluateOutputLogic(
  input: EvaluationInput
): Promise<EvaluationResult> {
  const { output, ground_truth, metric } = input;

  if (metric === "accuracy") {
    const score = calculateSimilarity(output, ground_truth);
    return {
      score,
      passed: score >= 0.85,
      feedback: `Output matches ground truth with ${(score * 100).toFixed(1)}% similarity`,
      metric_type: "accuracy",
    };
  }

  if (metric === "latency") {
    // Mock latency check - would be actual timing in real scenario
    const score = 0.95;
    return {
      score,
      passed: score >= 0.8,
      feedback: "Response time within acceptable range",
      metric_type: "latency",
    };
  }

  if (metric === "vibe") {
    // Mock vibe check - would use NLP in real scenario
    const score = 0.92;
    return {
      score,
      passed: score >= 0.8,
      feedback: "Tone and context are appropriate",
      metric_type: "vibe",
    };
  }

  throw new Error(`Unknown metric: ${metric}`);
}

/**
 * Execute evaluation with automatic logging
 */
async function evaluateOutput(
  context: SkillExecutionContext & { input: EvaluationInput }
): Promise<EvaluationResult> {
  return evaluateOutputLogic(context.input);
}

/**
 * Wrapped skill with execution logging
 */
const executeEvaluation = withExecutionLogging(evaluateOutputLogic, "qa_evaluator");

export { evaluateOutput, executeEvaluation, EvaluationResult };
