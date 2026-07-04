export const RESEARCH_RUN_SCHEMA_VERSION = 1;

export type ResearchRunScenario =
  | "browser_only_baseline"
  | "custom"
  | "lan"
  | "localhost";

export type ResearchRunMetadataForm = {
  coldStart: boolean;
  networkType: string;
  notes: string;
  scenario: ResearchRunScenario;
};

export type ResearchRunMetadata = {
  capturedAt: string;
  client: {
    userAgent: string;
  };
  game: {
    id: string | null;
    title: string | null;
  };
  networkType: string | null;
  notes: string | null;
  playerMode: "guest" | "host";
  runId: string;
  scenario: ResearchRunScenario;
  schemaVersion: number;
  sessionId: string;
  shareUrl: string | null;
  status: string;
  streamProfile: {
    bitrateKbps: number | null;
    fps: number | null;
    id: string | null;
  };
  trial: {
    coldStart: boolean;
  };
};

function safeMetadataPart(value: string) {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function createResearchRunRandomPart(recordedAt: Date) {
  const cryptoApi =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID().slice(0, 8);
  }

  if (cryptoApi?.getRandomValues) {
    return Array.from(
      cryptoApi.getRandomValues(new Uint8Array(4)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  }

  return recordedAt.getTime().toString(16).slice(-8).padStart(8, "0");
}

export function createResearchRunId(recordedAt = new Date()) {
  const randomPart = createResearchRunRandomPart(recordedAt);
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");

  return `edge-run-${timestamp}-${randomPart}`;
}

export function createResearchRunMetadata({
  form,
  gameId,
  gameTitle,
  playerMode,
  runId,
  sessionId,
  shareUrl,
  status,
  streamProfile,
  userAgent,
  capturedAt = new Date(),
}: {
  capturedAt?: Date;
  form: ResearchRunMetadataForm;
  gameId: string | undefined;
  gameTitle: string;
  playerMode: "guest" | "host";
  runId: string;
  sessionId: string;
  shareUrl: string;
  status: string;
  streamProfile: {
    bitrateKbps?: number;
    fps?: number;
    id?: string;
  };
  userAgent: string;
}): ResearchRunMetadata {
  const networkType = form.networkType.trim();
  const notes = form.notes.trim();

  return {
    capturedAt: capturedAt.toISOString(),
    client: {
      userAgent,
    },
    game: {
      id: gameId || null,
      title: gameTitle || null,
    },
    networkType: networkType || null,
    notes: notes || null,
    playerMode,
    runId,
    scenario: form.scenario,
    schemaVersion: RESEARCH_RUN_SCHEMA_VERSION,
    sessionId,
    shareUrl: shareUrl || null,
    status,
    streamProfile: {
      bitrateKbps: streamProfile.bitrateKbps ?? null,
      fps: streamProfile.fps ?? null,
      id: streamProfile.id || null,
    },
    trial: {
      coldStart: form.coldStart,
    },
  };
}

export function researchRunMetadataToJson(metadata: ResearchRunMetadata) {
  return `${JSON.stringify(metadata, null, 2)}\n`;
}

export function createResearchRunMetadataFilename({
  gameId,
  recordedAt = new Date(),
  runId,
}: {
  gameId: string | undefined;
  recordedAt?: Date;
  runId: string;
}) {
  const safeName = safeMetadataPart([gameId || "game", runId].join("-"));
  const timestamp = recordedAt.toISOString().replace(/[:.]/g, "-");

  return `pixelated-research-run-${safeName}-${timestamp}.json`;
}
