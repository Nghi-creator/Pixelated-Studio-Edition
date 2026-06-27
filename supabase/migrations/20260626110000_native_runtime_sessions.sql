-- Phase 3: native runtime session metadata. Native builds do not have ROM
-- artifacts; they boot an engine-owned allowlisted launch manifest.

ALTER TABLE public.backend_sessions
ADD COLUMN IF NOT EXISTS boot_launch_manifest_id text;
