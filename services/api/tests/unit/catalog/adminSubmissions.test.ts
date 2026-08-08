import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminSubmissionUseCaseError,
  createAdminSubmissionUseCases,
} from "../../../src/modules/catalog/application/adminSubmissions.js";
import type { SubmissionRow } from "../../../src/modules/catalog/domain/submissionTypes.js";

const submission: SubmissionRow = {
  author_name: "Pixel Dev",
  banner_url: null,
  cover_url: null,
  created_at: "2026-08-08T00:00:00.000Z",
  description: null,
  email: "dev@example.com",
  game_title: "Tiny Quest",
  id: "11111111-1111-4111-8111-111111111111",
  rom_url: "https://example.com/storage/v1/object/public/submissions/game.nes",
  status: "pending",
  submitter_id: "22222222-2222-4222-8222-222222222222",
};

test("admin submission listing identifies transient URL signing failures", async () => {
  const signingFailure = new Error("storage signing unavailable");
  const useCases = createAdminSubmissionUseCases({
    authorize: async () => true,
    createCandidate: async () => ({ candidate: {}, submission: {} }),
    fetchArtifact: fetch,
    findOne: async () => null,
    findPage: async () => ({ submissions: [submission], total: 1 }),
    reject: async () => ({}),
    signUrl: async () => {
      throw signingFailure;
    },
  });

  await assert.rejects(
    useCases.list({
      page: 1,
      pageSize: 25,
      status: "pending",
      userId: submission.submitter_id!,
    }),
    (error: unknown) =>
      error instanceof AdminSubmissionUseCaseError &&
      error.stage === "sign_review_urls" &&
      error.cause === signingFailure,
  );
});
