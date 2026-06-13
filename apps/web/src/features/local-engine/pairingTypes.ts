export type PairingState = "idle" | "checking" | "paired" | "error";
export type EngineUrlScope = "local" | "lan" | "custom";

export type EngineHealthPayload = {
  advertisedUrls?: string[];
  engineTokenRequired?: boolean;
  exposureMode?: "local" | "lan";
  ok?: boolean;
};

export type InviteRedeemPayload = {
  code?: string;
  companionToken?: string;
  engineUrl?: string;
  error?: string;
  expiresAt?: string;
};

export type LanPreflightPayload = {
  certificate?: {
    status?: "accepted";
  };
  engine?: {
    status?: "available" | "unavailable";
  };
  invite?: {
    expiresAt?: string | null;
    status?: "active" | "expired" | "revoked";
  };
  ready?: boolean;
};

export type LanPreflightState =
  | { status: "idle" }
  | { status: "checking" }
  | { payload: LanPreflightPayload; status: "complete" }
  | { status: "unreachable" };

