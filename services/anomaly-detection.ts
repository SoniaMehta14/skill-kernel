/**
 * Anomaly Detection
 * ML-based detection for error patterns and performance degradation
 */

import { SupabaseClient, ExecutionLogEntry } from "../supabase/client";

interface AnomalyScore {
  score: number; // 0-1, higher = more anomalous
  severity: "normal" | "warning" | "critical";
  reason: string;
  detected_at: Date;
}

interface AnomalyMetrics {
  error_rate: number; // Percentage of errors
  average_duration: number; // ms
  duration_variance: number; // Standard deviation
  failure_clustering: number; // Are errors clustered in time?
  token_burn_rate: number; // Tokens per minute
  recovery_rate: number; // Percentage of recovered tasks
}

class AnomalyDetector {
  private sb: SupabaseClient;
  private baselineMetrics: Map<string, AnomalyMetrics> = new Map();

  constructor(sb: SupabaseClient) {
    this.sb = sb;
  }

  /**
   * Calculate anomaly score for a task
   */
  async detectAnomalies(taskId: string): Promise<AnomalyScore[]> {
    const logs = await this.sb.getExecutionLogs(taskId, 100);
    if (logs.length === 0) {
      return [];
    }

    const metrics = this.calculateMetrics(logs);
    const anomalies: AnomalyScore[] = [];

    // Check error rate anomaly
    if (metrics.error_rate > 0.5) {
      anomalies.push({
        score: Math.min(1, metrics.error_rate),
        severity: metrics.error_rate > 0.8 ? "critical" : "warning",
        reason: `High error rate: ${(metrics.error_rate * 100).toFixed(1)}%`,
        detected_at: new Date(),
      });
    }

    // Check duration anomaly
    if (metrics.duration_variance > 5000) {
      anomalies.push({
        score: Math.min(1, metrics.duration_variance / 10000),
        severity: "warning",
        reason: `High execution time variance: ${metrics.duration_variance.toFixed(0)}ms`,
        detected_at: new Date(),
      });
    }

    // Check token burn rate
    if (metrics.token_burn_rate > 1000) {
      anomalies.push({
        score: Math.min(1, metrics.token_burn_rate / 5000),
        severity: metrics.token_burn_rate > 3000 ? "critical" : "warning",
        reason: `High token consumption: ${metrics.token_burn_rate.toFixed(0)} tokens/min`,
        detected_at: new Date(),
      });
    }

    // Check failure clustering
    if (metrics.failure_clustering > 0.7) {
      anomalies.push({
        score: metrics.failure_clustering,
        severity: "critical",
        reason: "Errors are clustered - possible cascading failure",
        detected_at: new Date(),
      });
    }

    return anomalies;
  }

  /**
   * Calculate task execution metrics
   */
  private calculateMetrics(logs: ExecutionLogEntry[]): AnomalyMetrics {
    const errorLogs = logs.filter((log) => log.status === "error");
    const successLogs = logs.filter((log) => log.status === "success");

    // Error rate
    const errorRate = errorLogs.length / logs.length;

    // Duration metrics
    const durations = logs
      .filter((log) => log.started_at && log.completed_at)
      .map(
        (log) =>
          new Date(log.completed_at!).getTime() -
          new Date(log.started_at!).getTime()
      );

    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b) / durations.length
        : 0;

    const variance =
      durations.length > 0
        ? Math.sqrt(
            durations.reduce(
              (sum, d) => sum + Math.pow(d - avgDuration, 2),
              0
            ) / durations.length
          )
        : 0;

    // Token burn rate (tokens per minute)
    const totalTokens = logs.reduce((sum, log) => sum + (log.metadata?.['token_usage']?.tokens || 0), 0);
    const durationMinutes =
      logs.length > 0
        ? (logs[logs.length - 1].created_at && logs[0].created_at
            ? (new Date(logs[0].created_at).getTime() -
                new Date(logs[logs.length - 1].created_at).getTime()) /
              60000
            : 1)
        : 1;

    const tokenBurnRate = totalTokens / Math.max(durationMinutes, 1);

    // Failure clustering (are errors grouped together?)
    const failureClustering = this.calculateFailureClustering(errorLogs);

    // Recovery rate
    const recoveryRate =
      successLogs.length > 0 ? successLogs.length / logs.length : 0;

    return {
      error_rate: errorRate,
      average_duration: avgDuration,
      duration_variance: variance,
      failure_clustering: failureClustering,
      token_burn_rate: tokenBurnRate,
      recovery_rate: recoveryRate,
    };
  }

  /**
   * Calculate clustering coefficient (0-1)
   * Measures if errors are grouped together in time
   */
  private calculateFailureClustering(errorLogs: ExecutionLogEntry[]): number {
    if (errorLogs.length < 2) return 0;

    // Calculate time gaps between consecutive errors
    const gaps: number[] = [];
    for (let i = 1; i < errorLogs.length; i++) {
      const gap = Math.abs(
        new Date(errorLogs[i - 1].created_at).getTime() -
          new Date(errorLogs[i].created_at).getTime()
      );
      gaps.push(gap);
    }

    if (gaps.length === 0) return 0;

    // High clustering = small gaps = low variance in gaps
    const avgGap = gaps.reduce((a, b) => a + b) / gaps.length;
    const gapVariance =
      gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) /
      gaps.length;

    // Normalize to 0-1 (inverse relationship)
    return Math.min(1, 1 - gapVariance / (avgGap * avgGap + 1));
  }

  /**
   * Compare against baseline to detect drift
   */
  async detectDrift(skillName: string, currentMetrics: AnomalyMetrics): Promise<AnomalyScore | null> {
    const baseline = this.baselineMetrics.get(skillName);
    if (!baseline) {
      this.baselineMetrics.set(skillName, currentMetrics);
      return null;
    }

    // Check for significant deviation (>50% change)
    const errorRateDrift =
      Math.abs(currentMetrics.error_rate - baseline.error_rate) / baseline.error_rate;

    if (errorRateDrift > 0.5) {
      return {
        score: Math.min(1, errorRateDrift),
        severity: errorRateDrift > 1 ? "critical" : "warning",
        reason: `Error rate drift: ${(errorRateDrift * 100).toFixed(0)}% increase`,
        detected_at: new Date(),
      };
    }

    const durationDrift =
      Math.abs(currentMetrics.average_duration - baseline.average_duration) /
      baseline.average_duration;

    if (durationDrift > 0.3) {
      return {
        score: Math.min(1, durationDrift),
        severity: "warning",
        reason: `Execution time increased ${(durationDrift * 100).toFixed(0)}%`,
        detected_at: new Date(),
      };
    }

    return null;
  }

  /**
   * Generate anomaly report
   */
  async generateAnomalyReport(taskId: string): Promise<string> {
    const anomalies = await this.detectAnomalies(taskId);

    if (anomalies.length === 0) {
      return `✅ No anomalies detected for task ${taskId}`;
    }

    let report = `
⚠️  ANOMALY DETECTION REPORT
Task ID: ${taskId}
Generated: ${new Date().toISOString()}

DETECTED ANOMALIES:
`;

    anomalies.forEach((anomaly, i) => {
      const icon =
        anomaly.severity === "critical"
          ? "🔴"
          : anomaly.severity === "warning"
            ? "🟡"
            : "🟢";

      report += `
${i + 1}. ${icon} [${anomaly.severity.toUpperCase()}] ${anomaly.reason}
   Score: ${(anomaly.score * 100).toFixed(1)}/100
`;
    });

    const criticalCount = anomalies.filter(
      (a) => a.severity === "critical"
    ).length;
    const warningCount = anomalies.filter((a) => a.severity === "warning").length;

    report += `
SUMMARY:
- Critical: ${criticalCount}
- Warnings: ${warningCount}
- Total Anomalies: ${anomalies.length}

RECOMMENDATIONS:
${criticalCount > 0 ? "- Escalate to operations team immediately" : ""}
${warningCount > 0 ? "- Monitor task closely and prepare mitigation" : ""}
- Review error logs for root cause analysis
- Consider reducing task scope or budget
`;

    return report;
  }
}

export { AnomalyDetector, AnomalyScore, AnomalyMetrics };
