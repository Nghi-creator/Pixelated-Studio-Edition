import { uploadGameplayArtwork } from "./catalogArtworkCapture.js";
import {
  assertCandidateRightsEvidence,
  assertCandidateRuntimeAllowed,
} from "./catalogCandidateValidation.js";
import {
  createGeneratedCover,
  mirrorCandidateArtifact,
} from "./catalogCandidateStorage.js";
import {
  CANDIDATE_COLUMNS,
  type CandidateRow,
  type CaptureGameplayArtwork,
  type GameBuildRow,
  type GameRightsRow,
  type GameRow,
  type SupabaseServiceLike,
} from "./catalogCandidateTypes.js";

export {
  CANDIDATE_COLUMNS,
  type CandidateRow,
  type CaptureGameplayArtwork,
  type GameBuildRow,
  type GameRow,
  type SupabaseServiceLike,
};

export async function promoteCandidate(
  service: SupabaseServiceLike,
  candidate: CandidateRow,
  reviewerId: string,
  notes: string | null,
  fetchArtifact: typeof fetch,
  captureGameplayArtwork?: CaptureGameplayArtwork,
) {
  const now = new Date().toISOString();
  assertCandidateRuntimeAllowed(candidate);
  assertCandidateRightsEvidence(candidate);
  const isNative = candidate.runtime_kind === "native_linux";
  const mirroredArtifact = isNative
    ? null
    : await mirrorCandidateArtifact(service, candidate, fetchArtifact);
  const generatedCover = await createGeneratedCover(service, candidate);
  const catalogFilename = isNative
    ? `${candidate.launch_manifest_id}-native`
    : candidate.artifact_filename;
  if (!catalogFilename) {
    throw new Error("Candidate is missing a catalog filename.");
  }

  const { data: existingGame, error: existingGameError } = await service
    .from("games")
    .select("id")
    .eq("rom_filename", catalogFilename)
    .maybeSingle<GameRow>();
  if (existingGameError) throw existingGameError;

  const gamePayload = {
    author_name: candidate.developer_name || candidate.title,
    developer_name: candidate.developer_name,
    developer_url: candidate.developer_url,
    backdrop_url: generatedCover.publicUrl,
    cover_url: generatedCover.publicUrl,
    publication_status: "published",
    rom_filename: catalogFilename,
    rom_url: mirroredArtifact?.publicUrl || null,
    title: candidate.title,
  };

  let game = existingGame;
  if (game) {
    const { data, error } = await service
      .from("games")
      .update(gamePayload)
      .eq("id", game.id)
      .select("id")
      .single<GameRow>();
    if (error) throw error;
    game = data;
  } else {
    const { data, error } = await service
      .from("games")
      .insert({
        ...gamePayload,
      })
      .select("id")
      .single<GameRow>();
    if (error) throw error;
    game = data;
  }

  const { data: existingBuild, error: existingBuildError } = await service
    .from("game_builds")
    .select("id")
    .eq("game_id", game.id)
    .eq("runtime_id", candidate.runtime_id)
    .eq("platform_id", candidate.platform_id)
    .maybeSingle<GameBuildRow>();
  if (existingBuildError) throw existingBuildError;

  const buildPayload = {
    artifact_filename: isNative ? null : candidate.artifact_filename,
    artifact_sha256: isNative ? null : candidate.artifact_sha256,
    artifact_size: isNative ? null : candidate.artifact_size,
    artifact_url: mirroredArtifact?.publicUrl || null,
    enabled: true,
    game_id: game.id,
    launch_manifest_id: isNative ? candidate.launch_manifest_id : null,
    platform_id: candidate.platform_id,
    runtime_id: candidate.runtime_id,
    runtime_kind: candidate.runtime_kind,
  };

  let build = existingBuild;
  if (build) {
    const { data, error } = await service
      .from("game_builds")
      .update(buildPayload)
      .eq("id", build.id)
      .select("id")
      .single<GameBuildRow>();
    if (error) throw error;
    build = data;
  } else {
    const { data, error } = await service
      .from("game_builds")
      .insert(buildPayload)
      .select("id")
      .single<GameBuildRow>();
    if (error) throw error;
    build = data;
  }

  let gameplayArtwork: Awaited<ReturnType<typeof uploadGameplayArtwork>> | null = null;
  let artworkCaptureNote: string | null = null;
  if (!isNative && captureGameplayArtwork && mirroredArtifact) {
    try {
      const capturedImage = await captureGameplayArtwork({
        artifactBytes: mirroredArtifact.bytes,
        build,
        candidate,
        game: { ...game, title: candidate.title },
      });
      if (capturedImage) {
        gameplayArtwork = await uploadGameplayArtwork(
          service,
          {
            build: {
              artifact_filename: candidate.artifact_filename,
              artifact_sha256: candidate.artifact_sha256,
              id: build.id,
            },
            game: { id: game.id, title: candidate.title },
          },
          capturedImage,
        );
        const { error: artworkUpdateError } = await service
          .from("games")
          .update({
            backdrop_url: gameplayArtwork.backdrop.publicUrl,
            cover_url: gameplayArtwork.cover.publicUrl,
          })
          .eq("id", game.id);
        if (artworkUpdateError) throw artworkUpdateError;
      } else {
        artworkCaptureNote =
          "Gameplay artwork capture unavailable; retained generated legal fallback cover.";
      }
    } catch (error) {
      artworkCaptureNote = `Gameplay artwork capture failed; retained generated legal fallback cover: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  const { data: existingRights, error: existingRightsError } = await service
    .from("game_rights")
    .select("id")
    .eq("game_id", game.id)
    .eq("game_build_id", build.id)
    .maybeSingle<GameRightsRow>();
  if (existingRightsError) throw existingRightsError;

  const rightsPayload = {
    asset_license_spdx: candidate.asset_license_spdx || candidate.code_license_spdx,
    attribution_text: candidate.attribution_text,
    code_license_spdx: candidate.code_license_spdx,
    cover_license_spdx: candidate.cover_license_spdx || "CC0-1.0",
    game_build_id: build.id,
    game_id: game.id,
    license_url: candidate.license_url,
    modification_allowed: true,
    noncommercial_hosting_allowed: candidate.noncommercial_hosting_allowed,
    original_release_url: candidate.original_release_url,
    permission_evidence_url: candidate.permission_evidence_url,
    review_notes: notes || candidate.review_notes,
    source_url: isNative
      ? candidate.source_repo_url
      : `${candidate.source_repo_url}/blob/${candidate.source_commit}/${candidate.source_entry_path}`,
    verified_at: now,
    verified_by: reviewerId,
  };

  if (existingRights) {
    const { error } = await service
      .from("game_rights")
      .update(rightsPayload)
      .eq("id", existingRights.id);
    if (error) throw error;
  } else {
    const { error } = await service.from("game_rights").insert(rightsPayload);
    if (error) throw error;
  }

  const { data: promotedCandidate, error: candidateError } = await service
    .from("catalog_ingestion_candidates")
    .update({
      import_status: "promoted",
      promoted_build_id: build.id,
      promoted_game_id: game.id,
      review_notes: [
        notes || candidate.review_notes,
        mirroredArtifact
          ? `Mirrored artifact path: catalog_roms/${mirroredArtifact.objectPath}`
          : null,
        `Generated cover path: catalog_artifacts/${generatedCover.objectPath}`,
        gameplayArtwork
          ? `Gameplay cover path: catalog_artifacts/${gameplayArtwork.cover.objectPath}`
          : null,
        gameplayArtwork
          ? `Gameplay backdrop path: catalog_artifacts/${gameplayArtwork.backdrop.objectPath}`
          : null,
        artworkCaptureNote,
      ].filter(Boolean).join("\n"),
      reviewed_at: now,
      reviewed_by: reviewerId,
      updated_at: now,
    })
    .eq("id", candidate.id)
    .select(CANDIDATE_COLUMNS)
    .single<CandidateRow>();
  if (candidateError) throw candidateError;

  return { build, candidate: promotedCandidate, game };
}
