-- Add budget tracking to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  token_budget INTEGER DEFAULT 50000;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  token_used INTEGER DEFAULT 0;

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS
  iteration_count INTEGER DEFAULT 0;

-- Add index for budget monitoring
CREATE INDEX IF NOT EXISTS idx_tasks_token_budget
  ON tasks(token_used, token_budget);

CREATE INDEX IF NOT EXISTS idx_tasks_iteration
  ON tasks(iteration_count);

-- Add budget tracking to execution_logs
ALTER TABLE execution_logs ADD COLUMN IF NOT EXISTS
  token_cost INTEGER;

ALTER TABLE execution_logs ADD COLUMN IF NOT EXISTS
  iteration_number INTEGER;

-- Create task_budget_alerts table for escalations
CREATE TABLE IF NOT EXISTS task_budget_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('budget_warning', 'budget_exceeded', 'loop_detected', 'human_intervention')),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB,
  escalated_to_pagerduty BOOLEAN DEFAULT FALSE,
  escalation_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_task
  ON task_budget_alerts(task_id);

CREATE INDEX IF NOT EXISTS idx_budget_alerts_severity
  ON task_budget_alerts(severity);

ALTER TABLE task_budget_alerts ENABLE ROW LEVEL SECURITY;
