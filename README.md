# Skill-Kernel 

> Autonomous Agentic Workflows with Supabase & TypeScript

Skill-Kernel is a production-grade orchestration platform for "Digital Employees." It moves beyond basic LLM assistance into high-reliability Agentic Workflows using a modular Skills framework, Postgres for state management, and deep observability.

## Architecture

### State-First Design
- **The Brain:** Claude models via API
- **The Memory:** Supabase (PostgreSQL) for task persistence & execution traces
- **The Hands:** Modular TypeScript/Python Skills
- **The Nervous System:** Slack & PagerDuty for escalations

### Agent Personas

| Agent | Domain | Responsibility |
|-------|--------|-----------------|
| **Architect** | Planning | Requirements ingestion, task decomposition |
| **SRE** | Operations | Root-cause analysis, automated healing |
| **QA/Eval** | Quality | LLM output validation, regression testing |
| **Security** | Compliance | RLS auditing, secret detection |
| **Observability** | Governance | Loop detection, budget tracking |

## Core Features

### 1. **Automatic Execution Logging**
Every skill execution is wrapped with middleware that logs:
- Execution status (pending → running → success/error)
- Input/output data
- Stack traces on failure
- Duration and timestamps

```typescript
// Skill execution is automatically traced
const result = await analyzeExecutionLogs(context);
// → Logged to execution_logs table with thought_process JSONB
```

### 2. **Multi-Tenant Security (RLS)**
Row-level security policies ensure users only see their own tasks:
```sql
-- Users see only their tasks
SELECT * FROM tasks WHERE user_id = current_user_id();
-- Service role (Edge Functions) bypasses RLS
```

### 3. **Modular Skills Framework**
- **Atomic:** Each skill does one thing (e.g., analyze logs, send notifications)
- **Portable:** Hosted as Supabase Edge Functions
- **Observable:** All executions traced to execution_logs

## Quick Start

### Prerequisites
```bash
# Install dependencies
npm install

# You'll need:
# - Node.js 16+
# - Supabase CLI (brew install supabase/tap/supabase)
```

### 1. Setup Database
```bash
# Create Supabase project
supabase init
supabase start

# Apply migrations
npm run db:push
```

The migrations create:
- `tasks` - Workflow definitions with status tracking
- `execution_logs` - Full audit trail of all operations
- `skill_registry` - Registered skill definitions

### 2. Environment Setup
```bash
# Copy template
cp supabase/.env.example supabase/.env.local

# Add your Supabase credentials
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### 3. Create a Task
```typescript
import { SupabaseClient, createExecutionContext } from './skills/index';

const sb = new SupabaseClient(projectUrl, anonKey);

// Create task
const task = await sb.createTask({
  name: "Analyze Production Logs",
  description: "RCA for spike in 500 errors",
  status: "in_progress",
  user_id: "user-123"
});

// Create execution context
const context = createExecutionContext(task.id, sb);

// Execute skill (auto-logged)
const analysis = await analyzeExecutionLogs({
  ...context,
  skill_name: "log_analyzer",
  input: { task_id: task.id }
});
```

### 4. Monitor Execution
```typescript
// View all execution logs for a task
const logs = await sb.getExecutionLogs(task.id);

// View only failures
const errors = await sb.getFailedLogs(task.id);

// Access thought_process JSONB
logs.forEach(log => {
  console.log(log.thought_process); // { skill: "...", duration_ms: ... }
});
```

## Available Skills

### SRE Skills
- `analyzeExecutionLogs()` - Detect error patterns from execution logs
  - Returns: error pattern, frequency, suggested action

### QA Skills
- `evaluateOutput()` - Validate LLM outputs against ground truth
  - Metrics: accuracy (Levenshtein), latency, vibe
  - Returns: score (0-1), pass/fail, feedback

### Communication Skills
- `notifySlack()` - Send messages with optional action buttons
  - Supports: channels, threads, attachments
  - Returns: message timestamp, channel ID

## Database Schema

### tasks
```sql
id                  uuid PRIMARY KEY
name                text NOT NULL
description         text
status              TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'human_intervened'))
user_id             uuid
metadata            jsonb
created_at          timestamp with time zone
updated_at          timestamp with time zone
```

### execution_logs
```sql
id                  uuid PRIMARY KEY
task_id             uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
status              TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'success', 'error'))
output              text
error_message       text
thought_process     jsonb  -- Captures skill logic, duration, inputs
started_at          timestamp with time zone
completed_at        timestamp with time zone
created_at          timestamp with time zone
metadata            jsonb
```

## Development

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

### Reset Database
```bash
npm run db:reset  # ⚠️ Development only
```

## Governance & Safety

### Execution Rules
1. **No Silent Failures** - Every operation logged to execution_logs
2. **State Integrity** - Check task status before executing
3. **Type Safety** - Strict TypeScript, no `any` types
4. **Observability** - thought_process captures decision trees

### RLS Policies
- Users see only their own tasks
- Service role (Edge Functions) bypasses RLS for automation
- Execution logs filtered by task ownership

## Examples

See `/examples/orchestration.ts` for:
- Complete RCA workflow (analyze → notify → evaluate)
- SRE on-call response pattern
- Multi-skill orchestration

## Architecture Files

- `CLAUDE.md` - Agent framework & execution rules
- `supabase/client.ts` - Database client with type safety
- `supabase/middleware.ts` - Execution logging wrapper
- `skills/index.ts` - Centralized skill exports
- `supabase/migrations/` - Database schema + RLS policies

## Next Phase

- [ ] PagerDuty escalation for critical tasks
- [ ] Token budget tracking per task_id
- [ ] Recursive loop detection (Observability agent)
- [ ] Human-in-the-loop approval gates
- [ ] Skill registry UI for discovery

## License

MIT
