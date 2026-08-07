import type { BrowserCoreId, BrowserSystemId } from "./browserCoreContract.js";

export type BackendSessionRow = {
  browser_core_id: BrowserCoreId | null;
  browser_system_id: BrowserSystemId | null;
  boot_artifact_sha256: string | null;
  boot_artifact_size: number | null;
  boot_launch_manifest_id: string | null;
  boot_rom_filename: string | null;
  boot_rom_url: string | null;
  boot_runtime_id: string;
  client_edition: "studio" | "user";
  client_runtime_kind: "wasm" | "webrtc" | "native";
  deleted_at: string | null;
  expires_at: string;
  game_id: string;
  id: string;
  mode: "cloud" | "local";
  session_token_hash: string;
  user_id: string | null;
};
