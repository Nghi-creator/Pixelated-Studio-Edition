import assert from "node:assert/strict";
import test from "node:test";
import {
  createSignedCatalogRomUrl,
  getBrowserEligibility,
  MAX_BROWSER_ARTIFACT_BYTES,
  parseSupabaseStorageObjectUrl,
} from "../../../src/modules/auth/domain/browserArtifact.js";

const validBuild = {
  artifact_filename: "game.nes",
  artifact_sha256: "a".repeat(64),
  artifact_size: 32_768,
  artifact_url:
    "https://project.supabase.co/storage/v1/object/public/catalog_roms/mirrored-roms/nes/game.nes",
  platform_id: "nes",
  runtime_kind: "libretro" as const,
};

test("marks only verified private NES artifacts eligible for the first WASM core", () => {
  assert.deepEqual(getBrowserEligibility(validBuild), {
    coreId: "fceumm",
    eligible: true,
    reason: null,
    systemId: "nes",
  });
  assert.equal(getBrowserEligibility({ ...validBuild, platform_id: "gba" }).eligible, false);
  assert.deepEqual(
    getBrowserEligibility({
      ...validBuild,
      artifact_filename: "pocket.gb",
      platform_id: "gb",
    }),
    { coreId: "gambatte", eligible: true, reason: null, systemId: "gb" },
  );
  assert.equal(getBrowserEligibility({ ...validBuild, artifact_sha256: null }).eligible, false);
  assert.match(
    getBrowserEligibility({
      ...validBuild,
      artifact_url: "https://raw.githubusercontent.com/example/game.nes",
    }).reason || "",
    /private catalog storage/,
  );
  assert.equal(
    getBrowserEligibility({
      ...validBuild,
      artifact_size: MAX_BROWSER_ARTIFACT_BYTES + 1,
    }).eligible,
    false,
  );
});

test("signs private catalog ROM objects without exposing service credentials", async () => {
  const calls: Array<{ bucket: string; expiresIn: number; path: string }> = [];
  const service = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, expiresIn: number) => {
          calls.push({ bucket, expiresIn, path });
          return {
            data: { signedUrl: "https://project.supabase.co/signed?token=opaque" },
            error: null,
          };
        },
      }),
    },
  };
  const signedUrl = await createSignedCatalogRomUrl({
    artifactUrl: validBuild.artifact_url,
    expiresInSeconds: 300,
    service: service as never,
    supabaseUrl: "https://project.supabase.co",
  });
  assert.equal(signedUrl, "https://project.supabase.co/signed?token=opaque");
  assert.deepEqual(calls, [
    {
      bucket: "catalog_roms",
      expiresIn: 300,
      path: "mirrored-roms/nes/game.nes",
    },
  ]);
});

test("extracts only same-project Supabase Storage object paths", () => {
  assert.deepEqual(
    parseSupabaseStorageObjectUrl(validBuild.artifact_url, "https://project.supabase.co"),
    { bucket: "catalog_roms", path: "mirrored-roms/nes/game.nes" },
  );
  assert.throws(
    () =>
      parseSupabaseStorageObjectUrl(
        validBuild.artifact_url,
        "https://other.supabase.co",
      ),
    /mirrored/,
  );
  assert.throws(
    () =>
      parseSupabaseStorageObjectUrl(
        "https://project.supabase.co/game.nes",
        "https://project.supabase.co",
      ),
    /Storage object/,
  );
});
