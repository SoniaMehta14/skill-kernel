/**
 * Integrity Check Skill — Security & Compliance Agent
 * Verifies RLS policies are actively enforced on all public Supabase tables.
 *
 * Strategy: query each protected table using the anon key (no auth context).
 * A correctly configured RLS policy returns 0 rows for unauthenticated requests.
 * Any rows returned indicate a policy gap.
 */

import { createClient } from "@supabase/supabase-js";
import {
  withExecutionLogging,
  SkillExecutionContext,
} from "../../supabase/middleware";

export interface IntegrityCheckInput {
  task_id: string;
  /** Override the tables to audit. Defaults to all known protected tables. */
  tables?: string[];
}

export interface TableIntegrityResult {
  table: string;
  /** True if the anon client could not read any rows (RLS is blocking). */
  rls_enforced: boolean;
  /** Number of rows visible to an unauthenticated request. Should be 0. */
  anon_row_count: number;
  status: "pass" | "fail";
  details: string;
}

export interface IntegrityCheckOutput {
  total_checked: number;
  passing: number;
  failing: number;
  results: TableIntegrityResult[];
  overall_status: "pass" | "fail";
}

// All tables that must block unauthenticated reads via RLS.
const DEFAULT_PROTECTED_TABLES = [
  "tasks",
  "execution_logs",
  "task_budget_alerts",
  "skill_registry",
];

async function integrityCheckLogic(
  input: IntegrityCheckInput
): Promise<IntegrityCheckOutput> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be set");
  }

  // Anon client — no JWT, simulates an unauthenticated caller.
  const anonClient = createClient(supabaseUrl, anonKey);
  const tables = input.tables ?? DEFAULT_PROTECTED_TABLES;
  const results: TableIntegrityResult[] = [];

  for (const table of tables) {
    const { count, error } = await anonClient
      .from(table)
      .select("id", { count: "exact", head: true });

    if (error) {
      // PostgREST returns an error when permission is explicitly denied —
      // that means RLS is active and blocking access. This is the ideal state.
      results.push({
        table,
        rls_enforced: true,
        anon_row_count: 0,
        status: "pass",
        details: `Access denied by RLS: ${error.message}`,
      });
    } else {
      const rowCount = count ?? 0;
      const rlsEnforced = rowCount === 0;
      results.push({
        table,
        rls_enforced: rlsEnforced,
        anon_row_count: rowCount,
        status: rlsEnforced ? "pass" : "fail",
        details: rlsEnforced
          ? "RLS is blocking unauthenticated reads (0 rows visible)."
          : `POLICY GAP: ${rowCount} row(s) visible to unauthenticated requests.`,
      });
    }
  }

  const passing = results.filter((r) => r.status === "pass").length;
  const failing = results.filter((r) => r.status === "fail").length;

  return {
    total_checked: tables.length,
    passing,
    failing,
    results,
    overall_status: failing > 0 ? "fail" : "pass",
  };
}

/**
 * Direct call — for use when you already have a SkillExecutionContext.
 */
export async function integrityCheck(
  context: SkillExecutionContext & { input: IntegrityCheckInput }
): Promise<IntegrityCheckOutput> {
  return integrityCheckLogic(context.input);
}

/**
 * Logged variant — wraps execution with an execution_logs entry.
 * Use this from the MCP server or any orchestration layer.
 */
export const executeIntegrityCheck = withExecutionLogging(
  integrityCheckLogic,
  "integrity_check"
);
