ALTER TABLE public.backend_sessions
ADD COLUMN IF NOT EXISTS boot_artifact_size bigint
  CHECK (boot_artifact_size IS NULL OR boot_artifact_size >= 0),
ADD COLUMN IF NOT EXISTS boot_artifact_sha256 text
  CHECK (
    boot_artifact_sha256 IS NULL
    OR boot_artifact_sha256 ~ '^[a-f0-9]{64}$'
  );
