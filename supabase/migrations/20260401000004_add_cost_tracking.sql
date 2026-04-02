-- Cost tracking and billing schema

-- Create skill_costs table to track per-skill expenses
CREATE TABLE IF NOT EXISTS skill_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name TEXT NOT NULL,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  cost_cents INTEGER NOT NULL, -- Cost in cents
  cost_type TEXT NOT NULL CHECK (cost_type IN ('token', 'api_call', 'compute', 'cache_miss')),
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skill_costs_skill
  ON skill_costs(skill_name);

CREATE INDEX IF NOT EXISTS idx_skill_costs_task
  ON skill_costs(task_id);

CREATE INDEX IF NOT EXISTS idx_skill_costs_type
  ON skill_costs(cost_type);

-- Create billing_summary table for aggregated costs
CREATE TABLE IF NOT EXISTS billing_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  user_id uuid,
  total_cost_cents INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  total_api_calls INTEGER DEFAULT 0,
  total_compute_seconds INTEGER DEFAULT 0,
  breakdown JSONB, -- { skill_name: cost, ... }
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(billing_period_start, billing_period_end, user_id)
);

CREATE INDEX IF NOT EXISTS idx_billing_summary_period
  ON billing_summary(billing_period_start, billing_period_end);

CREATE INDEX IF NOT EXISTS idx_billing_summary_user
  ON billing_summary(user_id);

-- Create cost_alerts table for budget overruns
CREATE TABLE IF NOT EXISTS cost_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('daily_limit', 'monthly_limit', 'cost_spike')),
  threshold_cents INTEGER NOT NULL,
  actual_cost_cents INTEGER NOT NULL,
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_task
  ON cost_alerts(task_id);

CREATE INDEX IF NOT EXISTS idx_cost_alerts_type
  ON cost_alerts(alert_type);

-- Enable RLS
ALTER TABLE skill_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view costs for their tasks"
ON skill_costs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = skill_costs.task_id
    AND (tasks.user_id = auth.uid() OR tasks.user_id IS NULL)
  )
);

CREATE POLICY "Users can view their billing summary"
ON billing_summary
FOR SELECT
USING (user_id = auth.uid() OR user_id IS NULL);
