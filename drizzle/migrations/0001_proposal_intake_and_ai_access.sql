ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS project_name text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS industry text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '', ADD COLUMN IF NOT EXISTS funding_purpose text NOT NULL DEFAULT '';
CREATE TABLE public.ai_gateway_state (model_id text PRIMARY KEY, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.ai_gateway_state TO service_role;
ALTER TABLE public.ai_gateway_state ENABLE ROW LEVEL SECURITY;