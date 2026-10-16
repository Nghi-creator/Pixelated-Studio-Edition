import assert from "node:assert/strict";
import { createStagingSupabase } from "./client.js";
import { logStep, uniqueId } from "./config.js";
import type { JsonRecord, StagingContext } from "./client.js";
export function createCatalogChecks(context: StagingContext) {
  const { request, configuredGameId, stagingSupabaseUrl, stagingSupabaseAnonKey } = context;
  function assertHeader(response: Response, name: string, expected: string | null) {
    assert.equal(response.headers.get(name), expected, `${name} should be ${expected ?? "absent"}`);
  }
  async function smokeCatalogCaching() {
    const cacheProbe = uniqueId("staging-smoke-cache");
    const path = `/games?search=${encodeURIComponent(cacheProbe)}`;
    logStep("checking public catalog cache miss");
    const first = await request<{
      games?: unknown[];
    }>("GET", path, {
      auth: false,
    });
    assert.equal(Array.isArray(first.payload.games), true);
    assertHeader(first.response, "Cache-Control", "public, max-age=30, s-maxage=60");
    assertHeader(first.response, "X-Pixelated-Cache", "MISS");
    logStep("checking public catalog cache hit");
    const second = await request<{
      games?: unknown[];
    }>("GET", path, {
      auth: false,
    });
    assert.equal(Array.isArray(second.payload.games), true);
    assertHeader(second.response, "Cache-Control", "public, max-age=30, s-maxage=60");
    assertHeader(second.response, "X-Pixelated-Cache", "HIT");
    logStep("checking featured games bypass catalog caching");
    const featured = await request<{
      featuredGames?: unknown[];
    }>("GET", "/games/featured", { auth: false });
    assert.equal(Array.isArray(featured.payload.featuredGames), true);
    assertHeader(featured.response, "Cache-Control", "no-store");
    assertHeader(featured.response, "X-Pixelated-Cache", null);
  }
  async function predeployCatalogRpcCheck() {
    if (!stagingSupabaseUrl || !stagingSupabaseAnonKey) {
      throw new Error("Missing Supabase configuration for published catalog RPC check. " +
        "Provide STAGING_SUPABASE_URL and STAGING_SUPABASE_ANON_KEY.");
    }
    const supabase = createStagingSupabase(stagingSupabaseUrl, stagingSupabaseAnonKey);
    logStep("checking hosted published_catalog_games RPC is not client-callable");
    const probeSearch = uniqueId("catalog-rpc-signature");
    const { error: directRpcError } = await supabase.rpc("published_catalog_games", {
      p_game_id: null,
      p_genre: null,
      p_limit: 1,
      p_license_spdx: null,
      p_order: "title",
      p_search: probeSearch,
    });
    if (!directRpcError || !["42501", "PGRST202"].includes(directRpcError.code)) {
      throw new Error("Hosted Supabase did not prove that clients are denied published_catalog_games. " +
        "Apply migration supabase/migrations/20260718130000_harden_shared_api_boundaries.sql before deploying.");
    }
    logStep("checking hosted catalog RPC through the rate-limited API boundary");
    const { payload } = await request<{
      games?: unknown[];
    }>("GET", `/games?pageSize=1&search=${encodeURIComponent(probeSearch)}`, { auth: false });
    assert.equal(Array.isArray(payload.games), true, "catalog API should return a games array");
    assert.equal(payload.games?.length, 0, "unique catalog search probe should not match catalog rows");
  }
  async function findSmokeGameId() {
    if (configuredGameId)
      return configuredGameId;
    const { payload } = await request<{
      games?: JsonRecord[];
    }>("GET", "/games", {
      auth: false,
    });
    const game = (payload.games || []).find((row) => {
      return typeof row.id === "string" && (row.rom_url || row.rom_filename);
    });
    if (!game || typeof game.id !== "string") {
      throw new Error("No game with a ROM target found. Set STAGING_GAME_ID to a known game id.");
    }
    return game.id;
  }
  return { smokeCatalogCaching, predeployCatalogRpcCheck, findSmokeGameId };
}
