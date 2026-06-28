-- Public catalog games should be playable without requiring a Supabase account.
-- Authenticated sessions still record user_id, while anonymous play stores null
-- and is authorized by the opaque session token instead.

ALTER TABLE public.backend_sessions
  ALTER COLUMN user_id DROP NOT NULL;
