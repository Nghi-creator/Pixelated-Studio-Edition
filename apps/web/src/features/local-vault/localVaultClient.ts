import { getAuthSession } from "../../lib/api/apiClient";
import {
  clearEngineToken,
  engineAuthHeaders,
  hasEngineToken,
} from "../../lib/engine/engineAuth";
import { engineEndpoint } from "../../lib/engine/engineConfig";
import { engineFetch } from "../../lib/engine/engineRequest";
export {
  getLocalGameTitle,
  getLocalGamePlayPath,
  getLocalVaultErrorMessage,
  INVALID_ENGINE_TOKEN_MESSAGE,
  InvalidEngineTokenError,
  isInvalidEngineTokenError,
  LOCAL_ENGINE_UNREACHABLE_MESSAGE,
  normalizeLocalGameFilenames,
  toLocalVaultGames,
  validateLocalRomFile,
  type LocalVaultGame,
} from "./localVaultState";
import {
  InvalidEngineTokenError,
  LOCAL_ENGINE_UNREACHABLE_MESSAGE,
  normalizeLocalGameFilenames,
  validateLocalRomFile,
} from "./localVaultState";

export async function getLocalVaultUserId() {
  const session = await getAuthSession();
  return session?.user?.id || "anonymous";
}

async function parseEngineError(response: Response, fallback: string) {
  const payload = await response.json().catch(() => null);
  return (
    (payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string" &&
      payload.error) ||
    fallback
  );
}

function handleInvalidToken(response: Response) {
  if (response.status !== 401) return;
  clearEngineToken();
  throw new InvalidEngineTokenError();
}

export async function fetchLocalVaultFilenames(userId: string) {
  if (!hasEngineToken()) return [];

  const response = await engineFetch(engineEndpoint("/local-games"), {
    headers: { "X-User-Id": userId, ...engineAuthHeaders() },
  });

  handleInvalidToken(response);
  if (!response.ok) throw new Error(LOCAL_ENGINE_UNREACHABLE_MESSAGE);

  return normalizeLocalGameFilenames(await response.json());
}

export async function uploadLocalVaultRom(file: File, userId: string) {
  const validationError = validateLocalRomFile(file);
  if (validationError) throw new Error(validationError);

  const formData = new FormData();
  formData.append("romFile", file);

  const response = await engineFetch(engineEndpoint("/upload"), {
    body: formData,
    headers: { "X-User-Id": userId, ...engineAuthHeaders() },
    method: "POST",
  });

  handleInvalidToken(response);
  if (!response.ok) {
    throw new Error(
      await parseEngineError(
        response,
        "Upload failed. Check the ROM file and try again.",
      ),
    );
  }
}

export async function deleteLocalVaultGame(filename: string, userId: string) {
  const response = await engineFetch(
    engineEndpoint(`/local-games/${encodeURIComponent(filename)}`),
    {
      headers: { "X-User-Id": userId, ...engineAuthHeaders() },
      method: "DELETE",
    },
  );

  handleInvalidToken(response);
  if (!response.ok) {
    throw new Error(
      await parseEngineError(response, "Failed to delete that game."),
    );
  }
}
