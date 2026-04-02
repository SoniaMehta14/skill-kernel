-- RLS Policies for Multi-Tenant Security

-- Tasks table policies
CREATE POLICY "Users can view their own tasks"
ON tasks
FOR SELECT
USING (
  auth.uid() = user_id OR user_id IS NULL
);

CREATE POLICY "Users can create tasks"
ON tasks
FOR INSERT
WITH CHECK (
  auth.uid() = user_id OR user_id IS NULL
);

CREATE POLICY "Users can update their own tasks"
ON tasks
FOR UPDATE
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Execution logs policies (read-only for users)
CREATE POLICY "Users can view logs for their tasks"
ON execution_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.id = execution_logs.task_id
    AND (tasks.user_id = auth.uid() OR tasks.user_id IS NULL)
  )
);

-- Service role (bypass RLS for internal operations)
-- Edge functions use service_role key which bypasses RLS
