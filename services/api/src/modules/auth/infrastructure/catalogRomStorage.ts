import type { SupabaseService } from "./supabaseClients.js";
import { parseSupabaseStorageObjectUrl } from "../domain/browserArtifact.js";

export async function createSignedCatalogRomUrl(input: {
  artifactUrl: string;
  expiresInSeconds: number;
  service: SupabaseService;
  supabaseUrl: string;
}) {
  const { bucket, path } = parseSupabaseStorageObjectUrl(
    input.artifactUrl,
    input.supabaseUrl,
  );
  if (bucket !== "catalog_roms") {
    throw new Error("Catalog ROMs must use the private catalog_roms bucket.");
  }
  const { data, error } = await input.service.storage
    .from(bucket)
    .createSignedUrl(path, input.expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw error || new Error("Supabase did not return a signed ROM URL.");
  }
  return data.signedUrl;
}
