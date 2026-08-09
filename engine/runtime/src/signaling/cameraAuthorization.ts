import type { ClientAccessScope } from "../clients/connectedClients";

export function canClaimTrustedCamera(
  accessScope: ClientAccessScope,
  requestedRole: string,
) {
  return accessScope === "raw" && requestedRole === "camera";
}
