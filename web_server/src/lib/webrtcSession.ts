import { supabase } from "./supabaseClient";

export type WebRTCStatus = "idle" | "connecting" | "playing" | "error";

export const createWebRTCSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const resolveGameBootTarget = async (gameId: string) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id || "anonymous";

  if (gameId.toLowerCase().endsWith(".nes")) {
    console.log(
      `[WebRTC] Local Vault game detected. Booting directly: ${gameId} for user ${userId}`,
    );
    return { romFilename: gameId, userId };
  }

  const { data, error } = await supabase
    .from("games")
    .select("rom_url, rom_filename")
    .eq("id", gameId)
    .single();

  if (error || !data) throw new Error("Game not found in DB");

  const romFilename = data.rom_url || data.rom_filename;
  if (!romFilename) throw new Error("Game has no ROM target");

  console.log(`[WebRTC] Cloud Game found. Sending boot string: ${romFilename}`);

  return { romFilename, userId };
};
