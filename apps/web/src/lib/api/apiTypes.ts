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
    runtimeKind: "libretro" | "native_linux";
  };
  engineUrl: string;
  expiresAt: string;
  sessionId: string;
  sessionToken: string;
  user: {
    id: string | null;
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
export type ApiCatalogCandidateReviewAction = "promote" | "reject";
export type ApiCatalogCandidateStatus =
  | "approved"
  | "needs_review"
  | "promoted"
  | "rejected";
export type ApiCatalogCandidateSourceKind =
  | "curated_licensed_rom"
  | "debian_main_games"
  | "homebrew_hub_gb"
  | "homebrew_hub_gba"
  | "homebrew_hub_nes"
  | "user_submission";
export type ApiGameSubmissionStatus =
  | "candidate_created"
  | "pending"
  | "rejected";

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

export type ApiCatalogCandidate = {
  artifact_filename: string | null;
  artifact_sha256: string | null;
  artifact_size: number | null;
  artifact_url: string | null;
  asset_license_spdx: string | null;
  attribution_text: string | null;
  code_license_spdx: string | null;
  cover_license_spdx?: string | null;
  developer_name: string | null;
  developer_url: string | null;
  first_seen_at?: string | null;
  id: string;
  import_status: ApiCatalogCandidateStatus | string;
  last_seen_at?: string | null;
  launch_manifest_id: string | null;
  license_url: string | null;
  noncommercial_hosting_allowed: boolean | null;
  original_release_url: string | null;
  package_component: string | null;
  package_name: string | null;
  package_version: string | null;
  permission_evidence_url: string | null;
  platform_id: string;
  promoted_build_id?: string | null;
  promoted_game_id?: string | null;
  review_notes: string | null;
  rights_warnings?: string[] | null;
  runtime_id: string;
  runtime_kind: "libretro" | "native_linux";
  source_commit: string;
  source_entry_path: string;
  source_kind: ApiCatalogCandidateSourceKind | string;
  source_repo_url: string;
  title: string;
};

export type ApiPaginatedCatalogCandidatesResponse<TCandidate> = {
  candidates: TCandidate[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiGameSubmission = {
  asset_license_spdx?: string | null;
  author_name: string;
  banner_url: string | null;
  catalog_candidate_id?: string | null;
  code_license_spdx?: string | null;
  cover_url: string | null;
  created_at: string;
  description: string | null;
  email: string;
  game_title: string;
  hosting_confirmed?: boolean | null;
  hosting_permission?: string | null;
  id: string;
  license_url?: string | null;
  no_release_url_explanation?: string | null;
  original_release_url?: string | null;
  ownership_confirmed?: boolean | null;
  ownership_status?: string | null;
  permission_evidence_url?: string | null;
  public_license_scope?: string | null;
  review_notes?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rom_url: string;
  rights_confirmed?: boolean | null;
  rights_notes?: string | null;
  source_repo_url?: string | null;
  status: ApiGameSubmissionStatus | string;
  submitter_id: string | null;
  third_party_content?: string | null;
  attribution_text?: string | null;
};

export type ApiPaginatedGameSubmissionsResponse<TSubmission> = {
  page: number;
  pageSize: number;
  submissions: TSubmission[];
  total: number;
  totalPages: number;
};

export type ApiSubmissionCandidatePayload = {
  asset_license_spdx?: string | null;
  attribution_text: string;
  code_license_spdx: string;
  license_url: string;
  noncommercial_hosting_allowed: true;
  notes?: string;
  original_release_url?: string | null;
  permission_evidence_url?: string | null;
  rights_warnings?: string[];
  source_repo_url: string;
};

export type ApiGameSubmissionReviewResponse<
  TSubmission,
  TCandidate = ApiCatalogCandidate,
> = {
  candidate?: TCandidate;
  submission: TSubmission;
};

export type ApiCatalogCandidateReviewResponse<TCandidate> = {
  candidate?: TCandidate;
  build?: { id: string };
  game?: { id: string };
  rights?: { id: string };
};

export type ApiGameSubmissionPayload = {
  assetLicenseSpdx: string | null;
  attributionText: string;
  authorName: string;
  bannerUrl: string | null;
  codeLicenseSpdx: string | null;
  coverUrl: string | null;
  description: string | null;
  email: string;
  gameTitle: string;
  hostingConfirmed: boolean;
  hostingPermission: string;
  licenseUrl: string | null;
  noReleaseUrlExplanation: string | null;
  originalReleaseUrl: string | null;
  ownershipConfirmed: boolean;
  ownershipStatus: string;
  permissionEvidenceUrl: string | null;
  publicLicenseScope: string;
  romUrl: string;
  rightsConfirmed: boolean;
  rightsNotes: string | null;
  sourceRepoUrl: string | null;
  thirdPartyContent: string;
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
    noncommercial_hosting_allowed?: boolean | null;
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
