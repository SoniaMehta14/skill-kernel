/**
 * Skill-Kernel MCP Server
 *
 * Exposes registered skills as standardized MCP Tools via StdioTransport.
 * Compatible with Claude Desktop, Claude Code CLI, and any MCP-aware client.
 *
 * Transport: stdio  (connect via `npm start`)
 * Schema:    JSON Schema definitions mirror the skill_registry table for
 *            backward compatibility with the existing Supabase registry.
 */

import * as dotenv from "dotenv";
dotenv.config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { SupabaseClient as KernelClient } from "../supabase/client";
import { executeSlackNotify } from "../skills/comms/slack-notifier";
import { executeIntegrityCheck } from "../skills/security/integrity-check";

// ---------------------------------------------------------------------------
// Bootstrap — validate required env vars before doing anything else.
// The AI never sees these values; they are opaque to the MCP client.
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

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "skill-kernel",
  version: "0.2.0",
});

// ---------------------------------------------------------------------------
// Tool: executeSlackNotify
//
// skill_registry JSON Schema (for backward compatibility):
// {
//   "type": "object",
//   "properties": {
//     "task_id":        { "type": "string", "format": "uuid" },
//     "channel":        { "type": "string" },
//     "message":        { "type": "string" },
//     "action_type":    { "type": "string", "enum": ["info","warning","error","success"] },
//     "include_buttons":{ "type": "boolean" }
//   },
//   "required": ["task_id", "channel", "message"]
// }
// ---------------------------------------------------------------------------
server.tool(
  "executeSlackNotify",
  "Post a notification to a Slack channel and log execution to Supabase.",
  {
    task_id: z
      .string()
      .uuid()
      .describe("Supabase task ID to associate this execution log with"),
    channel: z
      .string()
      .describe("Slack channel name or ID (e.g. #alerts, C01234567)"),
    message: z
      .string()
      .describe("Message body — supports Slack mrkdwn formatting"),
    action_type: z
      .enum(["info", "warning", "error", "success"])
      .optional()
      .describe("Visual severity level of the notification"),
    include_buttons: z
      .boolean()
      .optional()
      .describe("Attach a View Task action button linking to the task"),
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
// Tool: integrityCheck
//
// skill_registry JSON Schema (for backward compatibility):
// {
//   "type": "object",
//   "properties": {
//     "task_id": { "type": "string", "format": "uuid" },
//     "tables":  { "type": "array", "items": { "type": "string" } }
//   },
//   "required": ["task_id"]
// }
// ---------------------------------------------------------------------------
server.tool(
  "integrityCheck",
  "Verify RLS policies are enforced on Supabase public tables. Returns a pass/fail report per table.",
  {
    task_id: z
      .string()
      .uuid()
      .describe("Supabase task ID to associate this audit log with"),
    tables: z
      .array(z.string())
      .optional()
      .describe(
        "Specific tables to audit. Defaults to all known protected tables: tasks, execution_logs, task_budget_alerts, skill_registry."
      ),
  },
  async (args) => {
    const result = await executeIntegrityCheck({
      task_id: args.task_id,
      skill_name: "integrity_check",
      input: {
        task_id: args.task_id,
        tables: args.tables,
      },
      sb,
    });

    return {
      content: [{ type: "text", text: JSON.stringify(result.output, null, 2) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Start — connect to stdio transport and begin serving requests.
// Nothing should write to stdout after server.connect() is called.
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(
    `MCP server failed to start: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
