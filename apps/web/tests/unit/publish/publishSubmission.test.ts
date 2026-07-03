import assert from "node:assert/strict";
import test from "node:test";
import {
  createSubmissionObjectPath,
  getPublishErrorMessage,
  getSubmissionRightsErrors,
  submitGameForReview,
  validateRomFile,
  validateSubmissionImageFile,
} from "../../../src/features/publish/publishSubmission.ts";

function fileLike(name: string, type: string, size: number) {
  return { name, size, type } as File;
}

function rightsFields() {
  return {
    assetLicenseSpdx: "",
    attributionText: "Demo by Creator",
    authorName: "Creator",
    codeLicenseSpdx: "",
    description: "",
    email: "creator@example.com",
    gameTitle: "Demo",
    hostingConfirmed: true,
    hostingPermission: "creator_permission",
    licenseUrl: "",
    noReleaseUrlExplanation: "",
    originalReleaseUrl: "https://example.test/demo",
    ownershipConfirmed: true,
    ownershipStatus: "creator",
    permissionEvidenceUrl: "",
    publicLicenseScope: "none_owned",
    rightsConfirmed: true,
    rightsNotes: "",
    sourceRepoUrl: "",
    thirdPartyContent: "no",
  };
}

test("submission file validation rejects invalid ROMs and oversized images", () => {
  assert.equal(
    validateRomFile(fileLike("demo.zip", "application/zip", 100)),
    "ROM uploads must use one of these extensions: .nes, .gb, .gbc, .gba, .sfc, .smc, .md, .gen, .sms, or .gg.",
  );
  assert.equal(
    validateSubmissionImageFile(fileLike("cover.txt", "text/plain", 100)),
    "Use an image file for cover or banner art.",
  );
  assert.equal(validateRomFile(fileLike("demo.nes", "application/octet-stream", 100)), null);
  assert.equal(validateRomFile(fileLike("demo.gba", "application/octet-stream", 100)), null);
  assert.equal(validateRomFile(fileLike("demo.sfc", "application/octet-stream", 100)), null);
  assert.equal(validateRomFile(fileLike("demo.md", "application/octet-stream", 100)), null);
  assert.equal(validateSubmissionImageFile(fileLike("cover.png", "image/png", 100)), null);
});

test("submission file validation uses per-runtime ROM size limits", () => {
  assert.equal(
    validateRomFile(fileLike("demo.nes", "application/octet-stream", 9 * 1024 * 1024)),
    ".NES ROM files must be 8 MB or smaller.",
  );
  assert.equal(
    validateRomFile(fileLike("demo.gba", "application/octet-stream", 31 * 1024 * 1024)),
    null,
  );
  assert.equal(
    validateRomFile(fileLike("demo.sfc", "application/octet-stream", 63 * 1024 * 1024)),
    null,
  );
});

test("submission object paths are scoped to the authenticated user", () => {
  assert.equal(
    createSubmissionObjectPath({
      folder: "roms",
      originalName: "DEMO.NES",
      randomId: "abc123",
      timestamp: 1781500000000,
      userId: "user-1",
    }),
    "user-1/roms/1781500000000-abc123.nes",
  );
});

test("failed metadata submission removes uploaded submission objects", async () => {
  const uploadedPaths: string[] = [];
  const removedPaths: string[][] = [];

  await assert.rejects(
    submitGameForReview({
      createSubmission: async () => {
        throw new Error("metadata failed");
      },
      fields: {
        ...rightsFields(),
        authorName: "Creator",
        description: "  Demo game  ",
        email: "creator@example.com",
        gameTitle: "Demo",
      },
      files: {
        bannerFile: fileLike("banner.jpg", "image/jpeg", 100),
        coverFile: fileLike("cover.png", "image/png", 100),
        romFile: fileLike("demo.gba", "application/octet-stream", 100),
      },
      removeFiles: async (paths) => {
        removedPaths.push(paths);
      },
      uploadFile: async (_file, path) => {
        uploadedPaths.push(path);
        return `https://storage.example/submissions/${path}`;
      },
      userId: "user-1",
    }),
    /metadata failed/,
  );

  assert.equal(uploadedPaths.length, 3);
  assert.deepEqual(removedPaths, [uploadedPaths]);
});

test("successful submission trims metadata and keeps uploaded objects", async () => {
  let submittedPayload: unknown;
  const removedPaths: string[][] = [];

  await submitGameForReview({
    createSubmission: async (payload) => {
      submittedPayload = payload;
    },
      fields: {
        ...rightsFields(),
        attributionText: "  Demo by Creator  ",
        authorName: " Creator ",
        description: "  ",
        email: " creator@example.com ",
      gameTitle: " Demo ",
    },
    files: {
      bannerFile: null,
      coverFile: null,
      romFile: fileLike("demo.sfc", "application/octet-stream", 100),
    },
    removeFiles: async (paths) => {
      removedPaths.push(paths);
    },
    uploadFile: async (_file, path) => `https://storage.example/submissions/${path}`,
    userId: "user-1",
  });

  const payload = submittedPayload as { romUrl: string };
  assert.deepEqual(removedPaths, []);
  assert.deepEqual(submittedPayload, {
    assetLicenseSpdx: null,
    attributionText: "Demo by Creator",
    authorName: "Creator",
    bannerUrl: null,
    codeLicenseSpdx: null,
    coverUrl: null,
    description: null,
    email: "creator@example.com",
    gameTitle: "Demo",
    hostingConfirmed: true,
    hostingPermission: "creator_permission",
    licenseUrl: null,
    noReleaseUrlExplanation: null,
    originalReleaseUrl: "https://example.test/demo",
    ownershipConfirmed: true,
    ownershipStatus: "creator",
    permissionEvidenceUrl: null,
    publicLicenseScope: "none_owned",
    romUrl: payload.romUrl,
    rightsConfirmed: true,
    rightsNotes: null,
    sourceRepoUrl: null,
    thirdPartyContent: "no",
  });
  assert.match(
    payload.romUrl,
    /^https:\/\/storage\.example\/submissions\/user-1\/roms\//,
  );
});

test("rights validation follows guided conditional answers", () => {
  assert.deepEqual(getSubmissionRightsErrors(rightsFields()), []);
  assert.deepEqual(
    getSubmissionRightsErrors({
      ...rightsFields(),
      codeLicenseSpdx: "",
      publicLicenseScope: "code",
      sourceRepoUrl: "https://example.test/source",
    }),
    ["Add the code license SPDX ID."],
  );
  assert.deepEqual(
    getSubmissionRightsErrors({
      ...rightsFields(),
      ownershipStatus: "permission",
      permissionEvidenceUrl: "",
    }),
    ["Add a permission evidence URL."],
  );
});

test("publish errors prefer backend-safe messages", () => {
  assert.equal(
    getPublishErrorMessage(
      { payload: { error: "Submission limit reached. Please try again later." } },
      "fallback",
    ),
    "Submission limit reached. Please try again later.",
  );
});
