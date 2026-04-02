/**
 * Cost Tracking & Billing
 * Tracks per-skill costs and generates billing reports
 */

import { SupabaseClient } from "./client";

interface CostRecord {
  skill_name: string;
  task_id: string;
  cost_cents: number;
  cost_type: "token" | "api_call" | "compute" | "cache_miss";
  metadata?: Record<string, unknown>;
}

interface SkillCostConfig {
  token_cost_per_1k: number; // e.g., 0.0002 = $0.0002 per 1k tokens
  api_call_cost_cents: number; // e.g., 10 = $0.10 per API call
  compute_cost_per_second: number; // e.g., 0.001 = $0.001 per second
  cache_miss_penalty_cents: number; // e.g., 5 = $0.05 penalty for cache miss
}

interface BillingPeriod {
  start: Date;
  end: Date;
  total_cost_cents: number;
  breakdown: Record<string, number>;
  top_skills: Array<{ skill: string; cost_cents: number }>;
}

const DEFAULT_COSTS: Record<string, SkillCostConfig> = {
  log_analyzer: {
    token_cost_per_1k: 0.0002,
    api_call_cost_cents: 10,
    compute_cost_per_second: 0.001,
    cache_miss_penalty_cents: 5,
  },
  qa_evaluator: {
    token_cost_per_1k: 0.00015,
    api_call_cost_cents: 5,
    compute_cost_per_second: 0.0005,
    cache_miss_penalty_cents: 3,
  },
  slack_notifier: {
    token_cost_per_1k: 0.00001,
    api_call_cost_cents: 15,
    compute_cost_per_second: 0.0001,
    cache_miss_penalty_cents: 0,
  },
  pagerduty_escalator: {
    token_cost_per_1k: 0.00001,
    api_call_cost_cents: 25,
    compute_cost_per_second: 0.0002,
    cache_miss_penalty_cents: 0,
  },
};

class BillingManager {
  private sb: SupabaseClient;
  private costs: Record<string, SkillCostConfig>;

  constructor(sb: SupabaseClient, costs?: Record<string, SkillCostConfig>) {
    this.sb = sb;
    this.costs = costs || DEFAULT_COSTS;
  }

  /**
   * Calculate cost for token usage
   */
  calculateTokenCost(skillName: string, tokenCount: number): number {
    const config = this.costs[skillName];
    if (!config) return 0;

    const cost = (tokenCount / 1000) * config.token_cost_per_1k;
    return Math.round(cost * 100); // Convert to cents
  }

  /**
   * Calculate cost for API call
   */
  calculateApiCallCost(skillName: string): number {
    return this.costs[skillName]?.api_call_cost_cents || 0;
  }

  /**
   * Calculate cost for compute time
   */
  calculateComputeCost(skillName: string, durationSeconds: number): number {
    const config = this.costs[skillName];
    if (!config) return 0;

    const cost = durationSeconds * config.compute_cost_per_second;
    return Math.round(cost * 100); // Convert to cents
  }

  /**
   * Record a cost for a skill execution
   */
  async recordCost(record: CostRecord): Promise<string> {
    // TODO: Implement in supabase/client.ts
    const costId = `cost_${Date.now()}`;

    console.log(
      `📊 Cost recorded: ${record.skill_name} - $${(record.cost_cents / 100).toFixed(4)}`
    );

    return costId;
  }

  /**
   * Record token consumption
   */
  async recordTokenConsumption(
    skillName: string,
    taskId: string,
    tokenCount: number
  ): Promise<void> {
    const costCents = this.calculateTokenCost(skillName, tokenCount);

    await this.recordCost({
      skill_name: skillName,
      task_id: taskId,
      cost_cents: costCents,
      cost_type: "token",
      metadata: { token_count: tokenCount },
    });
  }

  /**
   * Record API call
   */
  async recordApiCall(skillName: string, taskId: string): Promise<void> {
    const costCents = this.calculateApiCallCost(skillName);

    await this.recordCost({
      skill_name: skillName,
      task_id: taskId,
      cost_cents: costCents,
      cost_type: "api_call",
    });
  }

  /**
   * Record cache miss penalty
   */
  async recordCacheMiss(skillName: string, taskId: string): Promise<void> {
    const config = this.costs[skillName];
    if (!config) return;

    await this.recordCost({
      skill_name: skillName,
      task_id: taskId,
      cost_cents: config.cache_miss_penalty_cents,
      cost_type: "cache_miss",
    });
  }

  /**
   * Get total cost for a task
   */
  async getTaskCost(taskId: string): Promise<number> {
    // TODO: Query skill_costs table and sum
    return 0;
  }

  /**
   * Get cost breakdown by skill
   */
  async getSkillCostBreakdown(taskId: string): Promise<Record<string, number>> {
    // TODO: Query and aggregate by skill_name
    return {};
  }

  /**
   * Generate billing report for period
   */
  async generateBillingReport(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<BillingPeriod> {
    // TODO: Query skill_costs and billing_summary tables

    return {
      start: startDate,
      end: endDate,
      total_cost_cents: 0,
      breakdown: {},
      top_skills: [],
    };
  }

  /**
   * Estimate cost before execution
   */
  estimateExecutionCost(
    skillName: string,
    estimatedTokens: number,
    estimatedDurationSeconds: number
  ): {
    token_cost: number;
    compute_cost: number;
    api_cost: number;
    total: number;
  } {
    const tokenCost = this.calculateTokenCost(skillName, estimatedTokens);
    const computeCost = this.calculateComputeCost(
      skillName,
      estimatedDurationSeconds
    );
    const apiCost = this.calculateApiCallCost(skillName);

    return {
      token_cost: tokenCost,
      compute_cost: computeCost,
      api_cost: apiCost,
      total: tokenCost + computeCost + apiCost,
    };
  }

  /**
   * Check if execution would exceed budget
   */
  wouldExceedBudget(
    currentCost: number,
    taskBudget: number,
    newExecutionCost: number
  ): boolean {
    return currentCost + newExecutionCost > taskBudget;
  }

  /**
   * Format cost as currency string
   */
  formatCost(centAmount: number): string {
    const dollars = centAmount / 100;
    return `$${dollars.toFixed(4)}`;
  }
}

export {
  BillingManager,
  CostRecord,
  SkillCostConfig,
  BillingPeriod,
  DEFAULT_COSTS,
};
