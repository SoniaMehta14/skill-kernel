/**
 * Observability Dashboard API
 * Provides endpoints for monitoring and analytics
 */

import { SupabaseClient } from "../supabase/client";
import { ObservabilityAgent } from "../skills/observability/supervisor";
import { AnomalyDetector } from "./anomaly-detection";
import { BillingManager } from "./billing";

interface DashboardMetrics {
  total_tasks: number;
  active_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  total_cost_cents: number;
  average_token_usage: number;
  error_rate: number;
  anomalies_detected: number;
}

interface TaskMetrics {
  task_id: string;
  name: string;
  status: string;
  token_used: number;
  token_budget: number;
  budget_percentage: number;
  iterations: number;
  cost_cents: number;
  duration_ms: number;
  error_count: number;
  anomaly_score: number;
}

interface SkillMetrics {
  skill_name: string;
  execution_count: number;
  success_rate: number;
  average_duration_ms: number;
  total_cost_cents: number;
  error_rate: number;
}

class DashboardAPI {
  private sb: SupabaseClient;
  private supervisor: ObservabilityAgent;
  private anomalyDetector: AnomalyDetector;
  private billingManager: BillingManager;

  constructor(sb: SupabaseClient) {
    this.sb = sb;
    this.supervisor = new ObservabilityAgent(sb);
    this.anomalyDetector = new AnomalyDetector(sb);
    this.billingManager = new BillingManager(sb);
  }

  /**
   * Get high-level dashboard metrics
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    // TODO: Query aggregated data from database
    return {
      total_tasks: 0,
      active_tasks: 0,
      completed_tasks: 0,
      failed_tasks: 0,
      total_cost_cents: 0,
      average_token_usage: 0,
      error_rate: 0,
      anomalies_detected: 0,
    };
  }

  /**
   * Get detailed metrics for a specific task
   */
  async getTaskMetrics(taskId: string): Promise<TaskMetrics> {
    const task = await this.sb.getTask(taskId);
    const logs = await this.sb.getExecutionLogs(taskId);
    const errors = await this.sb.getFailedLogs(taskId);

    const errorCount = errors.length;
    const successCount = logs.filter((log) => log.status === "success").length;

    // Calculate duration
    const firstLog = logs[logs.length - 1];
    const lastLog = logs[0];
    const durationMs =
      firstLog && lastLog
        ? new Date(lastLog.created_at).getTime() -
          new Date(firstLog.created_at).getTime()
        : 0;

    // Get anomaly score
    const anomalies = await this.anomalyDetector.detectAnomalies(taskId);
    const anomalyScore =
      anomalies.length > 0
        ? anomalies.reduce((sum, a) => sum + a.score, 0) / anomalies.length
        : 0;

    // Get cost
    const cost = await this.billingManager.getTaskCost(taskId);

    return {
      task_id: taskId,
      name: task.name,
      status: task.status as string,
      token_used: task.token_used || 0,
      token_budget: task.token_budget || 50000,
      budget_percentage: ((task.token_used || 0) / (task.token_budget || 1)) * 100,
      iterations: task.iteration_count || 0,
      cost_cents: cost,
      duration_ms: durationMs,
      error_count: errorCount,
      anomaly_score: anomalyScore,
    };
  }

  /**
   * Get metrics grouped by skill
   */
  async getSkillMetrics(): Promise<SkillMetrics[]> {
    // TODO: Query execution_logs grouped by skill
    return [];
  }

  /**
   * Get time-series data for a task
   */
  async getTaskTimeSeries(
    taskId: string,
    metric: "tokens" | "errors" | "duration"
  ): Promise<Array<{ timestamp: Date; value: number }>> {
    const logs = await this.sb.getExecutionLogs(taskId, 500);

    return logs.map((log) => {
      let value = 0;

      if (metric === "tokens") {
        value = log.metadata?.['token_usage']?.tokens || 0;
      } else if (metric === "errors") {
        value = log.status === "error" ? 1 : 0;
      } else if (metric === "duration") {
        value = log.started_at && log.completed_at
          ? new Date(log.completed_at).getTime() -
            new Date(log.started_at).getTime()
          : 0;
      }

      return {
        timestamp: new Date(log.created_at),
        value,
      };
    });
  }

  /**
   * Get cost breakdown for a period
   */
  async getCostBreakdown(
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, number>> {
    // TODO: Query skill_costs table and aggregate
    return {};
  }

  /**
   * Get top N most expensive tasks
   */
  async getTopCostlyTasks(limit: number = 10): Promise<
    Array<{
      task_id: string;
      name: string;
      cost_cents: number;
    }>
  > {
    // TODO: Query and sort by cost
    return [];
  }

  /**
   * Get error distribution
   */
  async getErrorDistribution(taskId: string): Promise<
    Array<{
      error_type: string;
      count: number;
      percentage: number;
    }>
  > {
    const errors = await this.sb.getFailedLogs(taskId);

    const errorCounts: Record<string, number> = {};
    errors.forEach((log) => {
      if (log.error_message) {
        const errorType = log.error_message.split(":")[0];
        errorCounts[errorType] = (errorCounts[errorType] || 0) + 1;
      }
    });

    const total = Object.values(errorCounts).reduce((a, b) => a + b, 0);

    return Object.entries(errorCounts)
      .map(([errorType, count]) => ({
        error_type: errorType,
        count,
        percentage: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Generate HTML dashboard
   */
  async generateDashboardHTML(taskId: string): Promise<string> {
    const metrics = await this.getTaskMetrics(taskId);
    const anomalies = await this.anomalyDetector.detectAnomalies(taskId);
    const errors = await this.getErrorDistribution(taskId);

    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Skill-Kernel Dashboard - Task ${taskId}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
    .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .metric { display: inline-block; margin: 10px 20px; }
    .value { font-size: 24px; font-weight: bold; color: #2196F3; }
    .label { font-size: 12px; color: #666; }
    .critical { color: #f44336; }
    .warning { color: #ff9800; }
    .success { color: #4caf50; }
    .progress-bar { background: #e0e0e0; height: 20px; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: ${metrics.budget_percentage > 95 ? "#f44336" : metrics.budget_percentage > 80 ? "#ff9800" : "#4caf50"}; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #f5f5f5; font-weight: bold; }
  </style>
</head>
<body>
  <h1>Task Dashboard</h1>

  <div class="card">
    <h2>${metrics.name}</h2>
    <p><strong>Task ID:</strong> ${taskId}</p>
    <p><strong>Status:</strong> <span class="${metrics.status === "completed" ? "success" : metrics.status === "failed" ? "critical" : ""}">${metrics.status}</span></p>

    <div>
      <div class="metric">
        <div class="label">Budget Usage</div>
        <div class="value">${metrics.budget_percentage.toFixed(1)}%</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${Math.min(100, metrics.budget_percentage)}%"></div>
        </div>
      </div>

      <div class="metric">
        <div class="label">Cost</div>
        <div class="value">$${(metrics.cost_cents / 100).toFixed(4)}</div>
      </div>

      <div class="metric">
        <div class="label">Tokens Used</div>
        <div class="value">${metrics.token_used.toLocaleString()} / ${metrics.token_budget.toLocaleString()}</div>
      </div>

      <div class="metric">
        <div class="label">Iterations</div>
        <div class="value">${metrics.iterations}</div>
      </div>

      <div class="metric">
        <div class="label">Errors</div>
        <div class="value ${metrics.error_count > 0 ? "critical" : ""}">${metrics.error_count}</div>
      </div>
    </div>
  </div>

  ${anomalies.length > 0 ? `
  <div class="card">
    <h3>Anomalies Detected</h3>
    <table>
      <tr>
        <th>Severity</th>
        <th>Issue</th>
        <th>Score</th>
      </tr>
      ${anomalies
        .map(
          (a) => `
        <tr>
          <td><span class="${a.severity === "critical" ? "critical" : "warning"}">${a.severity.toUpperCase()}</span></td>
          <td>${a.reason}</td>
          <td>${(a.score * 100).toFixed(1)}/100</td>
        </tr>
      `
        )
        .join("")}
    </table>
  </div>
  ` : ""}

  ${errors.length > 0 ? `
  <div class="card">
    <h3>Error Distribution</h3>
    <table>
      <tr>
        <th>Error Type</th>
        <th>Count</th>
        <th>Percentage</th>
      </tr>
      ${errors
        .map(
          (e) => `
        <tr>
          <td>${e.error_type}</td>
          <td>${e.count}</td>
          <td>${e.percentage.toFixed(1)}%</td>
        </tr>
      `
        )
        .join("")}
    </table>
  </div>
  ` : ""}

  <div class="card" style="font-size: 12px; color: #999;">
    Generated: ${new Date().toISOString()}
  </div>
</body>
</html>
    `;

    return html;
  }
}

export { DashboardAPI, DashboardMetrics, TaskMetrics, SkillMetrics };
