/**
 * PagerDuty Escalation Skill
 * Handles critical incident escalation and on-call routing
 */

import {
  withExecutionLogging,
  SkillExecutionContext,
} from "../../supabase/middleware";

interface PagerDutyEscalationInput {
  task_id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  escalation_policy_id: string;
  alert_type: "budget_exceeded" | "loop_detected" | "human_intervention" | "budget_warning";
  metadata?: Record<string, unknown>;
}

interface PagerDutyResponse {
  success: boolean;
  incident_id?: string;
  incident_url?: string;
  alert_id?: string;
  error?: string;
}

/**
 * Map severity to PagerDuty urgency
 */
function mapSeverityToUrgency(
  severity: "info" | "warning" | "critical"
): "low" | "high" {
  switch (severity) {
    case "critical":
      return "high";
    case "warning":
      return "high";
    case "info":
      return "low";
  }
}

/**
 * Build PagerDuty incident payload
 */
function buildPagerDutyPayload(input: PagerDutyEscalationInput): Record<string, unknown> {
  return {
    incident: {
      type: "incident",
      title: `[${input.alert_type.toUpperCase()}] ${input.title}`,
      description: input.description,
      urgency: mapSeverityToUrgency(input.severity),
      escalation_policy: {
        type: "escalation_policy_reference",
        id: input.escalation_policy_id,
      },
      assignments: [
        {
          assignee: {
            type: "user_reference",
          },
        },
      ],
      body: {
        type: "incident_body",
        details: JSON.stringify({
          task_id: input.task_id,
          alert_type: input.alert_type,
          metadata: input.metadata,
          timestamp: new Date().toISOString(),
        }),
      },
    },
  };
}

/**
 * Core PagerDuty escalation logic
 */
async function escalateLogic(
  input: PagerDutyEscalationInput
): Promise<PagerDutyResponse> {
  const pagerdutyApiKey = process.env.PAGERDUTY_API_KEY;

  if (!pagerdutyApiKey) {
    return {
      success: false,
      error: "PagerDuty API key not configured",
    };
  }

  try {
    const payload = buildPagerDutyPayload(input);

    // In production, this would call the PagerDuty API:
    // const response = await fetch('https://api.pagerduty.com/incidents', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Token token=${pagerdutyApiKey}` },
    //   body: JSON.stringify(payload)
    // });

    // Mock response for now
    return {
      success: true,
      incident_id: `INC${Date.now()}`,
      incident_url: `https://your-org.pagerduty.com/incidents/INC${Date.now()}`,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute escalation with automatic logging
 */
async function escalateToPagerDuty(
  context: SkillExecutionContext & { input: PagerDutyEscalationInput }
): Promise<PagerDutyResponse> {
  const { task_id, sb } = context;

  try {
    const result = await escalateLogic(context.input);

    if (result.success) {
      // Log alert to task_budget_alerts
      await sb.executeQuery(
        `INSERT INTO task_budget_alerts (task_id, alert_type, severity, message, escalation_id, escalated_to_pagerduty)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          task_id,
          context.input.alert_type,
          context.input.severity,
          context.input.title,
          result.incident_id,
          true,
        ]
      );
    }

    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Wrapped skill with execution logging
 */
const executePagerDutyEscalation = withExecutionLogging(
  escalateLogic,
  "pagerduty_escalator"
);

export {
  escalateToPagerDuty,
  executePagerDutyEscalation,
  PagerDutyResponse,
  PagerDutyEscalationInput,
};
