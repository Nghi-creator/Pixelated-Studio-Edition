import assert from "node:assert/strict";
import test from "node:test";
import { createHostedPairingClient } from "./hostedPairingClient.mjs";

const supported = {
  id: "supported-build",
  runtime_kind: "native_linux",
  runtime_id: "debian-native-v1",
  launch_manifest_id: "neverball",
};

for (const earlier of [
  { ...supported, id: "other-runtime", runtime_id: "other-native-v1" },
  { ...supported, id: "missing-manifest", launch_manifest_id: null },
]) {
  test(`native smoke selects the matching build after ${earlier.id}`, async (t) => {
    const requests = [];
    t.mock.method(globalThis, "fetch", async (url) => {
      requests.push(String(url));
      const page = new URL(url).searchParams.get("page");
      return Response.json({
        games: page === "1"
          ? [{ id: "unsupported-game", game_builds: [earlier] }]
          : [{ id: "native-game", game_builds: [earlier, supported] }],
        totalPages: 2,
      });
    });
    const client = createHostedPairingClient({
      apiUrl: "https://api.test",
      getBearerToken: () => "unused",
    });
    const result = await client.findDebianNativeGame();
    assert.equal(result.game.id, "native-game");
    assert.deepEqual(result.build, supported);
    assert.equal(requests.length, 2);
  });
}
