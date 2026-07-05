import crypto from "node:crypto";
import type { FakeSupabase, RecordRow } from "./dataBoundaryDatabase.js";

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
export const ADMIN_ID = "33333333-3333-4333-8333-333333333333";
export const SUPER_ADMIN_ID = "44444444-4444-4444-8444-444444444444";
export const GAME_ID = "55555555-5555-4555-8555-555555555555";
export const COMMENT_ID = "66666666-6666-4666-8666-666666666666";
export const REPORT_ID = "77777777-7777-4777-8777-777777777777";
export const SUBMISSION_ID = "88888888-8888-4888-8888-888888888888";

export function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function validNesRom() {
  return Buffer.concat([Buffer.from([0x4e, 0x45, 0x53, 0x1a]), Buffer.alloc(32)]);
}

export function validSnesRom() {
  const bytes = Buffer.alloc(0x10000);
  const headerOffset = 0x7fc0;
  Buffer.from("PIXELATED SNES TEST  ").copy(bytes, headerOffset);
  bytes[headerOffset + 0x15] = 0x20;
  bytes[headerOffset + 0x16] = 0x00;
  bytes[headerOffset + 0x17] = 0x09;
  bytes.writeUInt16LE(0xedcb, headerOffset + 0x1c);
  bytes.writeUInt16LE(0x1234, headerOffset + 0x1e);
  return bytes;
}

export function validGameGearRom() {
  const bytes = Buffer.alloc(0x8000);
  Buffer.from("TMR SEGA").copy(bytes, 0x7ff0);
  return bytes;
}

export function validGenesisRom() {
  const bytes = Buffer.alloc(0x200);
  Buffer.from("SEGA MEGA DRIVE").copy(bytes, 0x100);
  return bytes;
}

export function seedProfiles(db: FakeSupabase) {
  db.rows.profiles.push(
    { id: USER_ID, role: "user", username: "player" },
    { id: OTHER_USER_ID, role: "user", username: "other" },
    { id: ADMIN_ID, role: "admin", username: "admin" },
    { id: SUPER_ADMIN_ID, role: "super_admin", username: "root" },
  );
}

export function seedPublishedGames(db: FakeSupabase, ...games: RecordRow[]) {
  for (const game of games) {
    const gameId = String(game.id);
    const buildId = `${gameId}-build`;
    db.rows.games.push({
      publication_status: "published",
      rom_filename: `${gameId}.nes`,
      ...game,
    });
    db.rows.game_builds.push({
      artifact_filename: game.rom_filename || `${gameId}.nes`,
      artifact_url: game.rom_url || null,
      enabled: true,
      game_id: gameId,
      id: buildId,
      platform_id: "nes",
      runtime_id: "mesen",
      runtime_kind: "libretro",
    });
    db.rows.game_rights.push({
      attribution_text: `${game.title || gameId} test attribution`,
      code_license_spdx: "MIT",
      game_build_id: buildId,
      game_id: gameId,
      license_url: "https://example.test/license",
      noncommercial_hosting_allowed: true,
      source_url: "https://example.test/source",
      verified_at: new Date().toISOString(),
    });
  }
}

export function validSubmissionPayload(overrides: RecordRow = {}) {
  return {
    assetLicenseSpdx: null,
    attributionText: "Tiny Quest by Pixel Dev",
    authorName: "Pixel Dev",
    bannerUrl: null,
    codeLicenseSpdx: null,
    coverUrl: null,
    description: "A small GBA game",
    email: "dev@example.com",
    gameTitle: "Tiny Quest",
    hostingConfirmed: true,
    hostingPermission: "creator_permission",
    licenseUrl: null,
    noReleaseUrlExplanation: null,
    originalReleaseUrl: "https://example.com/tiny-quest",
    ownershipConfirmed: true,
    ownershipStatus: "creator",
    permissionEvidenceUrl: null,
    publicLicenseScope: "none_owned",
    rightsConfirmed: true,
    rightsNotes: null,
    sourceRepoUrl: null,
    thirdPartyContent: "no",
    ...overrides,
  };
}
