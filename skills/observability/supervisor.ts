/**
 * Observability Agent (The "Supervisor")
 * Monitors execution state, token budget, and detects recursive loops
 * Kills tasks that violate safety constraints
 */

import { SupabaseClient, TaskRecord } from "../supabase/client";
import { SkillExecutionContext } from "../supabase/middleware";

interface ObservabilityConfig {
  max_iterations: number; // Max iterations without state change
  token_budget_warning_threshold: number; // % of budget (e.g., 0.8 = 80%)
  token_budget_critical_threshold: number; // % of budget (e.g., 0.95 = 95%)
}

interface TaskHealthStatus {
  task_id: string;
  budget_status: "healthy" | "warning" | "critical";
  token_used: number;
  token_budget: number;
  iterations: number;
  loop_detected: boolean;
  execution_logs_count: number;
  latest_status: string;
  last_state_change: Date;
  recommendations: string[];
}

const DEFAULT_CONFIG: ObservabilityConfig = {
  max_iterations: 5,
  token_budget_warning_threshold: 0.8,
  token_budget_critical_threshold: 0.95,
};

class ObservabilityAgent {
  private sb: SupabaseClient;
  private config: ObservabilityConfig;

  constructor(sb: SupabaseClient, config?: Partial<ObservabilityConfig>) {
    this.sb = sb;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Monitor a task's health and safety constraints
   */
  async monitorTask(taskId: string): Promise<TaskHealthStatus> {
    const task = await this.sb.getTask(taskId);
    const logs = await this.sb.getExecutionLogs(taskId);

    // Calculate token usage
    const tokenUsed = task.token_used || 0;
    const tokenBudget = task.token_budget || 50000;
    const budgetRatio = tokenUsed / tokenBudget;

    // Determine budget status
    let budgetStatus: "healthy" | "warning" | "critical" = "healthy";
    if (budgetRatio >= this.config.token_budget_critical_threshold) {
      budgetStatus = "critical";
    } else if (budgetRatio >= this.config.token_budget_warning_threshold) {
      budgetStatus = "warning";
    }

    // Detect infinite loops (multiple identical states)
    const loopDetected = this.detectLoop(logs);

    // Get last state change timestamp
    const lastStateChange =
      logs.find((log) => log.thought_process?.state_changed)?. created_at ||
      task.created_at;

    const recommendations = this.generateRecommendations(
      task,
      budgetStatus,
      loopDetected
    );

    return {
      task_id: taskId,
      budget_status: budgetStatus,
      token_used: tokenUsed,
      token_budget: tokenBudget,
      iterations: task.iteration_count || 0,
      loop_detected: loopDetected,
      execution_logs_count: logs.length,
      latest_status: task.status as string,
      last_state_change: new Date(lastStateChange),
      recommendations,
    };
  }

  /**
   * Detect recursive loops in execution logs
   */
  private detectLoop(logs: any[]): boolean {
    if (logs.length < this.config.max_iterations) {
      return false;
    }

    // Check if last N errors are identical
    const recentErrors = logs
      .filter((log) => log.status === "error")
      .slice(0, this.config.max_iterations);

    if (recentErrors.length < this.config.max_iterations) {
      return false;
    }

    // Compare error messages
    const errorMessages = recentErrors.map((log) => log.error_message);
    const firstError = errorMessages[0];

    return errorMessages.every((msg) => msg === firstError);
  }

  /**
   * Generate recommendations based on health status
   */
  private generateRecommendations(
    task: TaskRecord,
    budgetStatus: string,
    loopDetected: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (budgetStatus === "critical") {
      recommendations.push(
        "CRITICAL: Token budget exceeded. Terminate task immediately."
      );
    } else if (budgetStatus === "warning") {
      recommendations.push(
        "WARNING: Token budget at 80%. Consider optimizing skills or increasing budget."
      );
    }

    if (loopDetected) {
      recommendations.push(
        "LOOP DETECTED: Task is in a recursive failure loop. Kill task and analyze root cause."
      );
    }

    if (task.iteration_count && task.iteration_count > 10) {
      recommendations.push(
        "High iteration count. Task may be inefficient. Consider human intervention."
      );
    }

    return recommendations;
  }

  /**
   * Kill a task and log the reason
   */
  async killTask(taskId: string, reason: string): Promise<void> {
    console.log(`❌ KILLING TASK ${taskId}: ${reason}`);

    // Update task status to failed
    await this.sb.updateTaskStatus(taskId, "failed");

    // Log the kill event
    await this.sb.logExecution({
      task_id: taskId,
      status: "error",
      error_message: `Task killed by Observability Agent: ${reason}`,
      thought_process: {
        agent: "observability",
        action: "kill_task",
        reason,
      },
    });

    // TODO: Escalate to PagerDuty if critical
  }

  /**
   * Poll and enforce constraints on a task
   */
  async enforceConstraints(taskId: string): Promise<void> {
    const health = await this.monitorTask(taskId);

    // Kill on critical budget
    if (health.budget_status === "critical") {
      await this.killTask(
        taskId,
        `Token budget exceeded: ${health.token_used}/${health.token_budget}`
      );
      return;
    }

    // Kill on detected loop
    if (health.loop_detected) {
      await this.killTask(
        taskId,
        "Recursive loop detected - task stuck in failure state"
      );
      return;
    }

    // Log warnings
    health.recommendations.forEach((rec) => {
      if (rec.includes("WARNING")) {
        console.warn(`⚠️  ${rec}`);
      }
    });
  }

  /**
   * Generate observability report for a task
   */
  async generateReport(taskId: string): Promise<string> {
    const health = await this.monitorTask(taskId);
    const task = await this.sb.getTask(taskId);

    const report = `
╔══════════════════════════════════════════╗
║        TASK OBSERVABILITY REPORT         ║
╚══════════════════════════════════════════╝

Task ID:           ${health.task_id}
Status:            ${health.latest_status}
Budget Status:     ${health.budget_status.toUpperCase()}

Token Usage:
  Used:   ${health.token_used.toLocaleString()} / ${health.token_budget.toLocaleString()} tokens
  Ratio:  ${((health.token_used / health.token_budget) * 100).toFixed(1)}%

Execution Health:
  Iterations:      ${health.iterations}
  Log Entries:     ${health.execution_logs_count}
  Loop Detected:   ${health.loop_detected ? "YES ❌" : "NO ✓"}
  Last Change:     ${health.last_state_change.toISOString()}

Recommendations:
${health.recommendations.map((rec) => `  • ${rec}`).join("\n")}

Generated: ${new Date().toISOString()}
    `;

    return report;
  }
}

export { ObservabilityAgent, TaskHealthStatus, ObservabilityConfig };
