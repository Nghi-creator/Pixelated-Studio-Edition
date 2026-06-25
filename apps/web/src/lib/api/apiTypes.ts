export type ApiMeResponse = {
  user: {
    email: string | null;
    id: string;
  };
};

export type ApiPermissionsResponse = {
  abilities: {
    canAccessAdmin: boolean;
    canManageReports: boolean;
    canManageUsers: boolean;
    canPublishGames: boolean;
    isBanned: boolean;
  };
  profile: {
    avatar_url: string | null;
    email: string | null;
    is_banned: boolean;
    is_developer: boolean;
    role: string;
    username: string | null;
  };
  user: {
    email: string | null;
    id: string;
  };
};

export type ApiSessionResponse = {
  boot: {
    artifactSha256: string | null;
    artifactSize: number | null;
    launchManifestId: string | null;
    romFilename: string | null;
    romUrl: string | null;
    runtimeId: string;
  };
  engineUrl: string;
  expiresAt: string;
  sessionId: string;
  sessionToken: string;
  user: {
    id: string;
  };
};

export type ApiLocalPairingResponse = {
  pairing: {
    createdAt: string;
    engineUrl: string;
    pairingId: string;
    tokenStoredBy: "browser-local-storage";
    updatedAt: string;
  };
  status?: "paired";
};

export type ApiStreamMetricPayload = {
  bitrateKbps: number | null;
  connectionState: RTCPeerConnectionState;
  fps: number | null;
  iceConnectionState: RTCIceConnectionState;
  jitterMs: number | null;
  packetsLost: number;
  sessionId: string;
  timestamp: string;
};

export type ApiIceServer = {
  credential?: string;
  urls: string | string[];
  username?: string;
};

export type ApiIceServersResponse = {
  expiresAt: string | null;
  iceServers: ApiIceServer[];
  ttlSeconds: number;
};

export type ApiMultiplayerLobbyPayload = {
  engineUrl: string | null;
  exposureMode: "lan" | "local" | "unknown";
  gameId: string;
  maxPlayers: number;
  participants: {
    displayName: string;
    playerIndex: number | null;
    role: "host" | "player" | "spectator";
  }[];
};

export type ApiAdminReportAction = "ban_user" | "delete_comment" | "ignore";

export type ApiAdminReportActionResponse = {
  action: ApiAdminReportAction;
  commentId: string;
  reportId: string;
  success: true;
  targetUserId?: string;
};

export type ApiPaginatedAccessLogsResponse<TLog> = {
  logs: TLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiPaginatedGamesResponse = {
  featuredGames: ApiGame[];
  games: ApiGame[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiFeaturedGamesResponse = {
  featuredGames: ApiGame[];
};

export type ApiPaginatedUsersResponse<TUser> = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  users: TUser[];
};

export type ApiPaginatedReportsResponse<TReport> = {
  page: number;
  pageSize: number;
  reports: TReport[];
  targetRole?: "all" | "users" | "admins";
  total: number;
  totalPages: number;
};

export type ApiGameSubmissionPayload = {
  authorName: string;
  bannerUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  email: string;
  gameTitle: string;
  romUrl: string;
};

export type ApiGame = {
  author_name?: string | null;
  backdrop_url?: string | null;
  cover_url: string;
  game_builds?: {
    artifact_filename: string | null;
    artifact_sha256?: string | null;
    artifact_size?: number | null;
    artifact_url: string | null;
    enabled: boolean;
    game_id: string;
    id: string;
    launch_manifest_id?: string | null;
    platform_id: string;
    runtime_id: string;
    runtime_kind: "libretro" | "native_linux";
  }[];
  game_rights?: {
    asset_license_spdx?: string | null;
    attribution_text?: string | null;
    code_license_spdx?: string | null;
    commercial_use_allowed?: boolean | null;
    cover_license_spdx?: string | null;
    game_build_id: string | null;
    game_id: string;
    id?: string;
    license_url?: string | null;
    modification_allowed?: boolean | null;
    original_release_url?: string | null;
    permission_evidence_url?: string | null;
    review_notes?: string | null;
    source_url?: string | null;
    verified_at: string | null;
  }[];
  id: string;
  play_count?: number | null;
  rom_filename?: string | null;
  rom_url?: string | null;
  title: string;
};

export type ApiProfile = {
  avatar_url: string | null;
  created_at?: string;
  id?: string;
  is_banned?: boolean;
  role: string;
  username: string | null;
};
