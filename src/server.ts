/**
 * Skill-Kernel MCP Server
 *
 * Exposes all registered skills as standardized MCP Tools.
 * Supports two transports:
 *   - stdio  (default) — for Claude Desktop / Claude Code CLI
 *   - http              — for deployed services via SSE
 *
 * Set TRANSPORT=http and MCP_PORT=3001 to enable HTTP mode.
 * Tool schemas mirror the skill_registry JSON Schema for backward compatibility.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "node:http";
import { z } from "zod";

import { SupabaseClient as KernelClient } from "../supabase/client";
import { executeSlackNotify } from "../skills/comms/slack-notifier";
import { executePagerDutyEscalation } from "../skills/comms/pagerduty-escalator";
import { executeLogAnalysis } from "../skills/sre/log-analyzer";
import { executeEvaluation } from "../skills/qa/evaluator";
import { ObservabilityAgent } from "../skills/observability/supervisor";
import { executeApprovalGate } from "../skills/observability/hitl-gate";
import { executeIntegrityCheck } from "../skills/security/integrity-check";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  process.stderr.write(
    "Fatal: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env\n"
  );
  process.exit(1);
}

const sb = new KernelClient(supabaseUrl, supabaseAnonKey);
const supervisor = new ObservabilityAgent(sb);

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "skill-kernel",
  version: "0.2.0",
});

// ---------------------------------------------------------------------------
// Tool: analyzeExecutionLogs  (SRE Agent)
//
// skill_registry schema:
// { task_id: string, limit?: number }
// ---------------------------------------------------------------------------
server.tool(
  "analyzeExecutionLogs",
  "SRE Agent — Analyze execution_logs for a task to identify error patterns and root causes. Returns the top error pattern, frequency, and a suggested remediation action.",
  {
    task_id: z.string().uuid().describe("Task whose logs to analyze"),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max number of log entries to inspect (default: 100)"),
  },
  async (args) => {
    const result = await executeLogAnalysis({
      task_id: args.task_id,
      skill_name: "log_analyzer",
      input: { task_id: args.task_id, limit: args.limit },
      sb,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result.output, null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: evaluateOutput  (QA Agent)
//
// skill_registry schema:
// { task_id, output, ground_truth, metric }
// ---------------------------------------------------------------------------
server.tool(
  "evaluateOutput",
  "QA Agent — Validate an LLM output against a ground truth value. Returns a score (0–1), pass/fail, and feedback. Supports accuracy (Levenshtein), latency, and vibe metrics.",
  {
    task_id: z.string().uuid().describe("Task to associate this evaluation with"),
    output: z.string().describe("The actual output produced by the agent"),
    ground_truth: z.string().describe("The expected correct output"),
    metric: z
      .enum(["accuracy", "latency", "vibe"])
      .describe("Evaluation metric to apply"),
  },
  async (args) => {
    const result = await executeEvaluation({
      task_id: args.task_id,
      skill_name: "qa_evaluator",
      input: {
        output: args.output,
        ground_truth: args.ground_truth,
        metric: args.metric,
      },
      sb,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result.output, null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: executeSlackNotify  (Comms Agent)
//
// skill_registry schema:
// { task_id, channel, message, action_type?, include_buttons? }
// ---------------------------------------------------------------------------
server.tool(
  "executeSlackNotify",
  "Comms Agent — Post a notification to a Slack channel and log the execution to Supabase.",
  {
    task_id: z.string().uuid().describe("Task to associate this log entry with"),
    channel: z.string().describe("Slack channel name or ID (e.g. #alerts)"),
    message: z.string().describe("Message body — supports Slack mrkdwn formatting"),
    action_type: z
      .enum(["info", "warning", "error", "success"])
      .optional()
      .describe("Visual severity level of the notification"),
    include_buttons: z
      .boolean()
      .optional()
      .describe("Attach a View Task action button to the message"),
  },
  async (args) => {
    const result = await executeSlackNotify({
      task_id: args.task_id,
      skill_name: "slack_notifier",
      input: {
        task_id: args.task_id,
        channel: args.channel,
        message: args.message,
        action_type: args.action_type,
        include_buttons: args.include_buttons,
      },
      sb,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result.output, null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: escalateToPagerDuty  (Comms Agent)
//
// skill_registry schema:
// { task_id, severity, title, description, escalation_policy_id, alert_type, metadata? }
// ---------------------------------------------------------------------------
server.tool(
  "escalateToPagerDuty",
  "Comms Agent — Create a PagerDuty incident for critical task failures. Logs the escalation to task_budget_alerts.",
  {
    task_id: z.string().uuid().describe("Task that triggered the escalation"),
    severity: z
      .enum(["info", "warning", "critical"])
      .describe("Incident severity — critical maps to high urgency in PagerDuty"),
    title: z.string().describe("Short incident title"),
    description: z.string().describe("Full incident description with context"),
    escalation_policy_id: z
      .string()
      .describe("PagerDuty escalation policy ID to route the incident"),
    alert_type: z
      .enum(["budget_exceeded", "loop_detected", "human_intervention", "budget_warning"])
      .describe("Category of alert that triggered this escalation"),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Additional key/value context to attach to the incident"),
  },
  async (args) => {
    const result = await executePagerDutyEscalation({
      task_id: args.task_id,
      skill_name: "pagerduty_escalator",
      input: {
        task_id: args.task_id,
        severity: args.severity,
        title: args.title,
        description: args.description,
        escalation_policy_id: args.escalation_policy_id,
        alert_type: args.alert_type,
        metadata: args.metadata,
      },
      sb,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result.output, null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: monitorTask  (Observability Agent)
//
// skill_registry schema:
// { task_id }
// ---------------------------------------------------------------------------
server.tool(
  "monitorTask",
  "Observability Agent — Check a task's health: token budget status, loop detection, iteration count, and recommendations. Call this before executing expensive skills.",
  {
    task_id: z.string().uuid().describe("Task to inspect"),
  },
  async (args) => {
    const health = await supervisor.monitorTask(args.task_id);
    return {
      content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: createApprovalGate  (Observability Agent — HITL)
//
// skill_registry schema:
// { task_id, gate_name, reason, approval_timeout_seconds, required_approvers, slack_channel?, escalation_policy_id? }
// ---------------------------------------------------------------------------
server.tool(
  "createApprovalGate",
  "Observability Agent — Pause execution and request human approval via Slack before proceeding with a critical or destructive operation.",
  {
    task_id: z.string().uuid().describe("Task that requires approval"),
    gate_name: z.string().describe("Short label for this approval step (e.g. deploy_to_production)"),
    reason: z.string().describe("Explanation of why approval is needed"),
    approval_timeout_seconds: z
      .number()
      .int()
      .positive()
      .describe("How long to wait for approval before timing out"),
    required_approvers: z
      .number()
      .int()
      .min(1)
      .describe("Number of approvals required to proceed"),
    slack_channel: z
      .string()
      .optional()
      .describe("Slack channel to post the approval request (default: #approvals)"),
    escalation_policy_id: z
      .string()
      .optional()
      .describe("PagerDuty policy to escalate to if approval times out"),
  },
  async (args) => {
    const result = await executeApprovalGate({
      task_id: args.task_id,
      skill_name: "hitl_gate",
      input: {
        task_id: args.task_id,
        gate_name: args.gate_name,
        reason: args.reason,
        approval_timeout_seconds: args.approval_timeout_seconds,
        required_approvers: args.required_approvers,
        slack_channel: args.slack_channel,
        escalation_policy_id: args.escalation_policy_id,
      },
      sb,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result.output, null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: integrityCheck  (Security Agent)
//
// skill_registry schema:
// { task_id, tables? }
// ---------------------------------------------------------------------------
server.tool(
  "integrityCheck",
  "Security Agent — Verify RLS policies are enforced on Supabase public tables. Returns a pass/fail report per table.",
  {
    task_id: z.string().uuid().describe("Task to associate this audit with"),
    tables: z
      .array(z.string())
      .optional()
      .describe(
        "Tables to audit. Defaults to: tasks, execution_logs, task_budget_alerts, skill_registry."
      ),
  },
  async (args) => {
    const result = await executeIntegrityCheck({
      task_id: args.task_id,
      skill_name: "integrity_check",
      input: { task_id: args.task_id, tables: args.tables },
      sb,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result.output, null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
const TRANSPORT = process.env.TRANSPORT ?? "stdio";
const HTTP_PORT = parseInt(process.env.MCP_PORT ?? "3001", 10);

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Do NOT write to stdout after this — it is the MCP wire
}

async function startHttp(): Promise<void> {
  // Track active SSE transports by session so POST /messages can route correctly.
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${HTTP_PORT}`);

    if (req.method === "GET" && url.pathname === "/sse") {
      const transport = new SSEServerTransport("/messages", res);
      sessions.set(transport.sessionId, transport);
      res.on("close", () => sessions.delete(transport.sessionId));
      await server.connect(transport);
      return;
    }

    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId") ?? "";
      const transport = sessions.get(sessionId);
      if (!transport) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Session not found");
        return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  httpServer.listen(HTTP_PORT, () => {
    process.stderr.write(
      `skill-kernel MCP server listening on http://localhost:${HTTP_PORT}/sse\n`
    );
  });
}

async function main(): Promise<void> {
  if (TRANSPORT === "http") {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((err: unknown) => {
  process.stderr.write(
    `MCP server failed to start: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
