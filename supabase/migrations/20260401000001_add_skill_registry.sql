-- Create skill_registry table for skill registration
CREATE TABLE skill_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name TEXT NOT NULL UNIQUE,
  description TEXT,
  schema JSONB NOT NULL,
  handler_url TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'experimental')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB
);

CREATE INDEX idx_skill_registry_status ON skill_registry(status);
CREATE INDEX idx_skill_registry_created_at ON skill_registry(created_at);

ALTER TABLE skill_registry ENABLE ROW LEVEL SECURITY;
