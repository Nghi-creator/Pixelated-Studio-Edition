import assert from "node:assert/strict";
import { requestSmoke } from "../shared/smokeHttp.mjs";
export function createHostedPairingClient({ apiUrl, supabaseUrl, serviceRoleKey, email, webUrl, getBearerToken }) {
  async function apiRequest(pathname, options = {}) {
    const headers = new Headers(options.headers);
    if (options.auth !== false)
      headers.set("authorization", `Bearer ${getBearerToken()}`);
    if (options.body)
      headers.set("content-type", "application/json");
    const { body } = await requestSmoke(`${apiUrl}${pathname}`, {
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers,
    }, { expected: Array.isArray(options.expected) ? options.expected : [options.expected ?? 200] });
    return body;
  }
  async function adminRequest(pathname, options = {}) {
    const { body } = await requestSmoke(`${supabaseUrl}/auth/v1/admin${pathname}`, {
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        ...(options.body ? { "content-type": "application/json" } : {}),
      },
    });
    return body;
  }
  async function generateMagicLink() {
    const payload = await adminRequest(`/generate_link?redirect_to=${encodeURIComponent(webUrl)}`, {
      body: {
        email,
        type: "magiclink",
      },
      method: "POST",
    });
    assert.equal(typeof payload?.action_link, "string");
    return payload.action_link;
  }
  async function findCloudGameId() {
    const payload = await apiRequest("/games?page=1&pageSize=50", { auth: false });
    const game = payload.games?.find((candidate) => typeof candidate.id === "string" &&
      (candidate.rom_url || candidate.rom_filename));
    if (!game)
      throw new Error("Hosted catalog has no game with a ROM target.");
    return game.id;
  }
  async function findDebianNativeGame() {
    let pageNumber = 1;
    let lastPayload = null;
    while (pageNumber <= 10) {
      const payload = await apiRequest(`/games?page=${pageNumber}&pageSize=50`, {
        auth: false,
      });
      lastPayload = payload;
      const game = payload.games?.find((candidate) => candidate.game_builds?.some((build) => build.runtime_kind === "native_linux" &&
        build.runtime_id === "debian-native-v1" &&
        typeof build.launch_manifest_id === "string" &&
        build.launch_manifest_id.length > 0));
      if (game) {
        return {
          build: game.game_builds.find((candidate) => candidate.runtime_kind === "native_linux"),
          game,
        };
      }
      if (!payload.totalPages || pageNumber >= payload.totalPages)
        break;
      pageNumber += 1;
    }
    throw new Error(`Hosted catalog has no published Debian native game with a launch manifest. lastPage=${JSON.stringify({
      page: lastPayload?.page,
      total: lastPayload?.total,
      totalPages: lastPayload?.totalPages,
    })}`);
  }
  return { apiRequest, generateMagicLink, findCloudGameId, findDebianNativeGame };
}
