# Phase 3: Observability & Governance

> Building the "Supervisor" Agent for high-reliability workflows

## Overview

Phase 3 adds the critical infrastructure for autonomous workflows at scale:
- **Budget Tracking** - Token usage monitoring and enforcement
- **Loop Detection** - Recursive failure detection and termination
- **Human-in-the-Loop** - Approval gates for critical operations
- **PagerDuty Escalation** - Critical alerts to on-call teams
- **QA Test Framework** - Ground truth datasets for validation

## New Database Tables

### task_budget_alerts
Tracks budget violations and alerts:
```sql
id                  uuid PRIMARY KEY
task_id             uuid NOT NULL REFERENCES tasks(id)
alert_type          TEXT ('budget_warning', 'budget_exceeded', 'loop_detected', ...)
severity            TEXT ('info', 'warning', 'critical')
message             TEXT
escalated_to_pagerduty BOOLEAN
escalation_id       TEXT (PagerDuty incident ID)
created_at          timestamp
resolved_at         timestamp
```

### Enhanced tasks table
Added budget tracking columns:
- `token_budget` - Total token allocation for task
- `token_used` - Current token consumption
- `iteration_count` - Number of execution iterations

### Enhanced execution_logs table
Added monitoring columns:
- `token_cost` - Tokens consumed by this log entry
- `iteration_number` - Which iteration this log belongs to

## New Skills

### Observability Agent (Supervisor)
```typescript
const supervisor = new ObservabilityAgent(sb, {
  max_iterations: 5,
  token_budget_warning_threshold: 0.8,  // 80% warning
  token_budget_critical_threshold: 0.95 // 95% kill
});

// Monitor task health
const health = await supervisor.monitorTask(taskId);
// → Returns: budget_status, loop_detected, recommendations, etc.

// Enforce constraints
await supervisor.enforceConstraints(taskId);
// → Kills task if critical conditions detected

// Generate report
const report = await supervisor.generateReport(taskId);
// → Formatted observability report
```

### PagerDuty Escalator
```typescript
await escalateToPagerDuty({
  ...context,
  skill_name: "pagerduty_escalator",
  input: {
    task_id: taskId,
    severity: "critical",
    title: "Token Budget Exceeded",
    description: "Task has used 95% of allocated budget",
    escalation_policy_id: "POLICY123",
    alert_type: "budget_exceeded"
  }
});
// → Creates incident in PagerDuty
```

### Human-in-the-Loop Gate
```typescript
const gate = await createApprovalGate({
  ...context,
  skill_name: "hitl_gate",
  input: {
    task_id: taskId,
    gate_name: "production_deploy",
    reason: "Deploy to production requires approval",
    approval_timeout_seconds: 3600, // 1 hour
    required_approvers: 2,
    slack_channel: "#approvals"
  }
});

// Poll for decision
const decision = await pollGateDecision(sb, gate.gate_id, taskId);
// → { status: 'approved' | 'rejected' | 'timeout' }
```

## QA Testing Framework

### Ground Truth Datasets
Pre-built test datasets for validating skills:

```typescript
import {
  LOG_ANALYSIS_TESTS,      // 3 test cases for log analyzer
  OUTPUT_EVALUATION_TESTS, // 3 test cases for evaluator
  LATENCY_TESTS,          // 3 latency benchmarks
  VIBE_TESTS              // 3 tone/context tests
} from "./qa/ground-truth";
```

### Test Runner
```typescript
import { QATestRunner } from "./qa/test-runner";

const runner = new QATestRunner(context);

// Run specific dataset
const results = await runner.runDatasetTests("dataset_log_analysis_v1");

// Run all tests
const allResults = await runner.runAllTests();

// Generate report
const report = await runner.generateTestReport();
```

## Workflow Example: Supervised Task Execution

```typescript
import {
  SupabaseClient,
  createExecutionContext,
  ObservabilityAgent,
  analyzeExecutionLogs
} from "./skills/index";

async function supervisedWorkflow(projectUrl: string, anonKey: string) {
  const sb = new SupabaseClient(projectUrl, anonKey);
  const supervisor = new ObservabilityAgent(sb);

  // Create task with budget
  const task = await sb.createTask({
    name: "Analyze Production Logs",
    status: "in_progress",
    metadata: { budget_allocation: "50000 tokens" }
  });

  const context = createExecutionContext(task.id, sb);

  try {
    // Execute skill
    const analysis = await analyzeExecutionLogs({
      ...context,
      skill_name: "log_analyzer",
      input: { task_id: task.id }
    });

    // Update token usage (mock: 1000 tokens per call)
    await sb.updateTokenUsage(task.id, 1000);

    // Monitor health
    await supervisor.enforceConstraints(task.id);

    // If we get here, task is healthy
    await sb.updateTaskStatus(task.id, "completed");

  } catch (error) {
    // Supervisor will auto-kill on budget/loop violations
    console.error("Task failed:", error);
  }
}
```

## Configuration Schema

Update `CLAUDE.md` with new constraints:

```
## 📊 Observability & FinOps

### Budget Tracking
- Default allocation: 50,000 tokens per task
- Warning threshold: 80% (40,000 tokens)
- Critical threshold: 95% (47,500 tokens)
- Exceeding critical → Task killed immediately

### Loop Detection
- Max iterations without state change: 5
- Detection: Last 5 execution logs have identical error message
- Action: Kill task and escalate to PagerDuty

### Human-in-the-Loop
- Critical operations require approval
- Default timeout: 1 hour
- Multi-approver support (configurable)
- Slack integration for approvals
```

## Migration Strategy

### Step 1: Apply Schema Migration
```bash
supabase db push
```

### Step 2: Enable Observability
```typescript
// In your task orchestrator
const supervisor = new ObservabilityAgent(sb);

// Wrap main loop
async function executeWithSupervisor(taskId: string) {
  const startTime = Date.now();

  while (true) {
    // Execute next step
    const result = await executeNextStep(taskId);

    // Check constraints every iteration
    await supervisor.enforceConstraints(taskId);

    // Track execution time
    const duration = Date.now() - startTime;
    if (duration > 3600000) { // 1 hour max
      await supervisor.killTask(taskId, "Execution timeout");
      break;
    }
  }
}
```

### Step 3: Configure PagerDuty
Set environment variable:
```bash
export PAGERDUTY_API_KEY="your-api-key"
```

### Step 4: Enable Slack Approvals
Configure Slack webhook and channel for HITL gates.

## Safety Guarantees

✅ **Budget Enforcement** - Hard stop at 95% token usage
✅ **Loop Detection** - Kills stuck tasks after 5 identical failures
✅ **Human Oversight** - Critical operations require approval
✅ **Incident Escalation** - Auto-escalate to PagerDuty
✅ **Full Auditability** - Every decision logged to execution_logs
✅ **Graceful Degradation** - Tasks fail safely, never cascade

## Monitoring Queries

```sql
-- View all critical alerts
SELECT * FROM task_budget_alerts
WHERE severity = 'critical'
ORDER BY created_at DESC;

-- Track total token spend per user
SELECT user_id, SUM(token_used) as total_spent
FROM tasks
GROUP BY user_id
ORDER BY total_spent DESC;

-- Find looping tasks
SELECT task_id, COUNT(*) as iterations
FROM execution_logs
WHERE status = 'error'
GROUP BY task_id
HAVING COUNT(*) > 5
ORDER BY iterations DESC;
```

## Next Phase (Phase 4)

- [ ] Implement Redis caching for skill results
- [ ] Add cost tracking per skill execution
- [ ] Build ML-based anomaly detection
- [ ] Create dashboard for observability UI
- [ ] Add distributed tracing support
