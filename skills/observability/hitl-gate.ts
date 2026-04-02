/**
 * Human-in-the-Loop (HITL) Gate
 * Pauses execution and requests human approval for critical operations
 */

import {
  withExecutionLogging,
  SkillExecutionContext,
} from "../../supabase/middleware";

interface HITLGateInput {
  task_id: string;
  gate_name: string;
  reason: string;
  approval_timeout_seconds: number;
  required_approvers: number;
  slack_channel?: string;
  escalation_policy_id?: string;
}

interface HITLGateResponse {
  gate_id: string;
  status: "waiting_for_approval" | "approved" | "rejected" | "timeout";
  decision?: {
    approved: boolean;
    approved_by?: string;
    approved_at?: Date;
    comment?: string;
  };
  deadline: Date;
}

/**
 * Create HITL gate request
 */
function createGateRequest(input: HITLGateInput): Record<string, unknown> {
  const deadline = new Date(Date.now() + input.approval_timeout_seconds * 1000);

  return {
    gate_id: `GATE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    task_id: input.task_id,
    gate_name: input.gate_name,
    reason: input.reason,
    required_approvers: input.required_approvers,
    deadline: deadline.toISOString(),
    created_at: new Date().toISOString(),
    status: "waiting_for_approval",
  };
}

/**
 * Build Slack approval message
 */
function buildApprovalMessage(
  input: HITLGateInput,
  gateId: string
): Record<string, unknown> {
  return {
    channel: input.slack_channel || "#approvals",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🔒 Approval Required: ${input.gate_name}*\n\n_Task:_ \`${input.task_id}\`\n_Reason:_ ${input.reason}`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `⏱️ *Approval Deadline*\n${new Date(Date.now() + input.approval_timeout_seconds * 1000).toISOString()}`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✅ Approve",
            },
            value: `approve_${gateId}`,
            style: "primary",
            action_id: `approve_${gateId}`,
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "❌ Reject",
            },
            value: `reject_${gateId}`,
            style: "danger",
            action_id: `reject_${gateId}`,
          },
        ],
      },
    ],
  };
}

/**
 * Core HITL gate logic
 */
async function createGateLogic(
  input: HITLGateInput
): Promise<HITLGateResponse> {
  const gateRequest = createGateRequest(input);
  const deadline = new Date(Date.now() + input.approval_timeout_seconds * 1000);

  // In production:
  // 1. Post approval message to Slack
  // 2. Store in task_gates table
  // 3. Return gate_id for polling
  // 4. Poll until timeout or approval received

  return {
    gate_id: gateRequest.gate_id as string,
    status: "waiting_for_approval",
    deadline,
  };
}

/**
 * Execute gate creation with automatic logging
 */
async function createApprovalGate(
  context: SkillExecutionContext & { input: HITLGateInput }
): Promise<HITLGateResponse> {
  const { task_id, sb } = context;

  try {
    const gateResponse = await createGateLogic(context.input);

    // Log gate creation
    await sb.logExecution({
      task_id,
      status: "running",
      thought_process: {
        skill: "hitl_gate",
        action: "create_approval_gate",
        gate_name: context.input.gate_name,
        gate_id: gateResponse.gate_id,
        deadline: gateResponse.deadline.toISOString(),
      },
    });

    // TODO: Post to Slack channel
    // const slackMessage = buildApprovalMessage(context.input, gateResponse.gate_id);
    // await notifySlack(slackMessage);

    return gateResponse;
  } catch (error) {
    throw error;
  }
}

/**
 * Poll for gate decision
 */
async function pollGateDecision(
  sb: SupabaseClient,
  gateId: string,
  taskId: string,
  timeout_ms: number = 300000 // 5 minutes default
): Promise<HITLGateResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout_ms) {
    // TODO: Query task_gates table for decision
    // const gate = await sb.getGateDecision(taskId, gateId);

    // For now, simulate polling
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if decision made
    // if (gate.status !== 'waiting_for_approval') {
    //   return gate;
    // }
  }

  // Timeout
  return {
    gate_id: gateId,
    status: "timeout",
    deadline: new Date(),
  };
}

/**
 * Wrapped skill with execution logging
 */
const executeApprovalGate = withExecutionLogging(
  createGateLogic,
  "hitl_gate"
);

export {
  createApprovalGate,
  executeApprovalGate,
  pollGateDecision,
  HITLGateResponse,
  HITLGateInput,
};
