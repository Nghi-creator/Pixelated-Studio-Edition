-- Phase 2: controlled public artifact bucket for reviewed catalog builds.
-- Service-role API code mirrors approved upstream artifacts here before
-- publishing a build URL.

INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog_artifacts', 'catalog_artifacts', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Catalog artifacts are publicly readable"
ON storage.objects;

CREATE POLICY "Catalog artifacts are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'catalog_artifacts');
