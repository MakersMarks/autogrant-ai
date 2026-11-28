-- AutoGrant: align public.site_grants with the standardized grant schema.
--
-- Idempotent: safe to run more than once, and safe whether or not the table already exists.
-- It never drops or rewrites existing columns, policies, or rows (the backfill only fills NULLs).
--
-- How to run: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- (Kept outside supabase/migrations and drizzle/ on purpose: Lovable manages those folders.)

-- 1. Base table (no-op when it already exists).
CREATE TABLE IF NOT EXISTS public.site_grants (
  id text PRIMARY KEY
);

-- 2. Legacy columns the crawlers and the edge function already write.
ALTER TABLE public.site_grants
  ADD COLUMN IF NOT EXISTS pool_tier text,
  ADD COLUMN IF NOT EXISTS grant_tier text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS funder_name text,
  ADD COLUMN IF NOT EXISTS funder_type text,
  ADD COLUMN IF NOT EXISTS award_floor numeric,
  ADD COLUMN IF NOT EXISTS award_ceiling numeric,
  ADD COLUMN IF NOT EXISTS min_months_in_business integer,
  ADD COLUMN IF NOT EXISTS eligible_states text[],
  ADD COLUMN IF NOT EXISTS application_time_minutes integer,
  ADD COLUMN IF NOT EXISTS deadline text,
  ADD COLUMN IF NOT EXISTS open_date text,
  ADD COLUMN IF NOT EXISTS close_date text,
  ADD COLUMN IF NOT EXISTS is_rolling boolean,
  ADD COLUMN IF NOT EXISTS cost_sharing_required boolean,
  ADD COLUMN IF NOT EXISTS cost_sharing_percentage numeric,
  ADD COLUMN IF NOT EXISTS eligible_entity_types text[],
  ADD COLUMN IF NOT EXISTS demographic_set_asides text[],
  ADD COLUMN IF NOT EXISTS geographic_restriction text,
  ADD COLUMN IF NOT EXISTS geographic_scope jsonb,
  ADD COLUMN IF NOT EXISTS application_method text,
  ADD COLUMN IF NOT EXISTS direct_apply_url text,
  ADD COLUMN IF NOT EXISTS official_application_url text,
  ADD COLUMN IF NOT EXISTS source_solicitation_url text,
  ADD COLUMN IF NOT EXISTS is_free_to_apply boolean,
  ADD COLUMN IF NOT EXISTS directory_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary_text text,
  ADD COLUMN IF NOT EXISTS prerequisites text[],
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- 3. Standardized columns.
ALTER TABLE public.site_grants
  ADD COLUMN IF NOT EXISTS funder text,
  ADD COLUMN IF NOT EXISTS amount_min numeric,
  ADD COLUMN IF NOT EXISTS amount_max numeric,
  ADD COLUMN IF NOT EXISTS states text[],
  ADD COLUMN IF NOT EXISTS stage_tags text[],
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS portal_url text,
  ADD COLUMN IF NOT EXISTS demographic_tags text[],
  ADD COLUMN IF NOT EXISTS required_documents text[],
  ADD COLUMN IF NOT EXISTS requires_strict_demographic boolean DEFAULT false;

-- 4. Backfill the standardized columns from the legacy ones (only where still empty).
UPDATE public.site_grants SET funder     = funder_name     WHERE funder     IS NULL AND funder_name     IS NOT NULL;
UPDATE public.site_grants SET amount_min = award_floor     WHERE amount_min IS NULL AND award_floor     IS NOT NULL;
UPDATE public.site_grants SET amount_max = award_ceiling   WHERE amount_max IS NULL AND award_ceiling   IS NOT NULL;
UPDATE public.site_grants SET states     = eligible_states WHERE states     IS NULL AND eligible_states IS NOT NULL;
UPDATE public.site_grants
  SET portal_url = COALESCE(direct_apply_url, official_application_url, source_solicitation_url)
  WHERE portal_url IS NULL;
UPDATE public.site_grants SET status = 'open' WHERE (status IS NULL OR status = 'unknown') AND is_rolling IS TRUE;
UPDATE public.site_grants SET status = 'unknown' WHERE status IS NULL;
UPDATE public.site_grants
  SET stage_tags = ARRAY(
    SELECT t FROM unnest(ARRAY[
      CASE WHEN is_rolling IS TRUE THEN 'rolling' END,
      CASE WHEN amount_max > 0 AND amount_max <= 25000 THEN 'microgrant' END
    ]) AS t WHERE t IS NOT NULL
  )
  WHERE stage_tags IS NULL;

-- 5. Indexes for the feed's state filter and status checks.
CREATE INDEX IF NOT EXISTS site_grants_states_idx ON public.site_grants USING gin (states);
CREATE INDEX IF NOT EXISTS site_grants_eligible_states_idx ON public.site_grants USING gin (eligible_states);
CREATE INDEX IF NOT EXISTS site_grants_status_idx ON public.site_grants (status);

-- 6. Access: signed-in users can read the directory; only the service role (crawlers) can write.
ALTER TABLE public.site_grants ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.site_grants TO authenticated;
GRANT ALL ON public.site_grants TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_grants'
      AND policyname = 'site grants readable by signed-in users'
  ) THEN
    CREATE POLICY "site grants readable by signed-in users"
      ON public.site_grants FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 7. Make PostgREST pick up the new columns immediately.
NOTIFY pgrst, 'reload schema';
