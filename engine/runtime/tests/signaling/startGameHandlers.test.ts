import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import test from "node:test";
import {
  normalizeStreamProfile,
  registerStartGameHandler,
  type StreamProfile,
} from "../../src/signaling/startGameHandlers";

type RuntimeBootOptions = {
  isCloudRom?: boolean;
  runtimeId: string;
  streamProfile: StreamProfile;
};

type HarnessOverrides = {
  downloadCloudRom?: (
    romUrl: string,
    destinationPath: string,
    validation: {
      expectedSha256?: string | null;
      expectedSizeBytes?: number | null;
      runtimeId: string;
    },
  ) => Promise<void>;
  bootGame?: (
    romPath: string,
    sessionId: string,
    options: RuntimeBootOptions,
  ) => void;
  verifyBackendSession?: (options: {
    apiUrl: string;
    sessionId: string;
    sessionToken: string;
  }) => Promise<{
    launchManifestId?: string | null;
    mode: string;
    romTarget?: string | null;
    runtimeId?: string | null;
    userId?: string | null;
  }>;
};

class FakeSocket extends EventEmitter {
  data: Record<string, unknown> = {};
  outbound: Array<{ event: string; payload: unknown }> = [];
  rooms: string[] = [];

  emit(event: string, ...args: unknown[]) {
    if (event === "engine-error") {
      this.outbound.push({ event, payload: args[0] });
      return true;
    }
    return super.emit(event, ...args);
  }

  join(room: string) {
    this.rooms.push(room);
  }
}

function createHarness(overrides: HarnessOverrides = {}) {
  const socket = new FakeSocket();
  const booted: Array<{
    options: RuntimeBootOptions;
    romPath: string;
    sessionId: string;
  }> = [];
  const streamRestarts: Array<{
    options: {
      iceServers?: unknown[];
      streamProfile: StreamProfile;
    };
    sessionId: string;
  }> = [];
  const downloads: Array<{
    destinationPath: string;
    romUrl: string;
    validation: { runtimeId: string };
  }> = [];
  const calls = { verify: 0 };

  registerStartGameHandler(socket as never, {
    apiUrl: "http://api.test",
    downloadCloudRom:
      overrides.downloadCloudRom ||
      ((romUrl, destinationPath, validation) => {
        downloads.push({ destinationPath, romUrl, validation });
        return Promise.resolve();
      }),
    runtime: {
      bootGame: (romPath, sessionId, options) => {
        if (overrides.bootGame) {
          overrides.bootGame(romPath, sessionId, options);
          return;
        }
        booted.push({ options, romPath, sessionId });
      },
      restartStream: (sessionId, options) => {
        streamRestarts.push({ options, sessionId });
      },
    },
    verifyBackendSession:
      overrides.verifyBackendSession ||
      ((options) => {
        calls.verify += 1;
        return Promise.resolve({
          mode: "cloud",
          romTarget: "https://cdn.example.test/game.nes",
          runtimeId: "mesen",
          userId: "verified-user",
          options,
        });
      }),
  });

  return { booted, calls, downloads, socket, streamRestarts };
}

function flushStartGame() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function getErrorMessage(socket: FakeSocket) {
  return (socket.outbound[0]?.payload as { message?: string })?.message;
}

test("cloud session intent requires a backend session token", async () => {
  const { booted, calls, socket } = createHarness();

  socket.emit("start-game", {
    mode: "cloud",
    romFilename: "spoofed.nes",
    sessionId: "session-1",
  });
  await flushStartGame();

  assert.equal(calls.verify, 0);
  assert.deepEqual(booted, []);
  assert.equal(
    getErrorMessage(socket),
    "Cloud games require a backend session token.",
  );
});

test("verified cloud sessions replace browser supplied boot targets", async () => {
  const { booted, calls, downloads, socket } = createHarness();

  socket.emit("start-game", {
    mode: "cloud",
    romFilename: "https://attacker.example.test/game.nes",
    sessionId: "session-2",
    sessionToken: "token",
  });
  await flushStartGame();

  assert.equal(calls.verify, 1);
  assert.equal(downloads[0]?.romUrl, "https://cdn.example.test/game.nes");
  assert.match(downloads[0]?.destinationPath || "", /\.nes$/);
  assert.equal(downloads[0]?.validation.runtimeId, "mesen");
  assert.equal(booted[0]?.sessionId, "session-2");
  assert.deepEqual(booted[0]?.options, {
    isCloudRom: true,
    runtimeId: "mesen",
    streamProfile: { bitrateKbps: 1000, fps: 60, id: "balanced" },
  });
});

test("verified mGBA cloud sessions use a matching temporary extension", async () => {
  const { booted, downloads, socket } = createHarness({
    verifyBackendSession: () =>
      Promise.resolve({
        mode: "cloud",
        romTarget: "https://cdn.example.test/game.gba?download=1",
        runtimeId: "mgba",
        userId: "verified-user",
      }),
  });

  socket.emit("start-game", {
    mode: "cloud",
    romFilename: "https://attacker.example.test/game.nes",
    sessionId: "session-gba",
    sessionToken: "token",
  });
  await flushStartGame();

  assert.equal(downloads[0]?.romUrl, "https://cdn.example.test/game.gba?download=1");
  assert.match(downloads[0]?.destinationPath || "", /\.gba$/);
  assert.equal(downloads[0]?.validation.runtimeId, "mgba");
  assert.equal(booted[0]?.options.runtimeId, "mgba");
});

test("cloud temporary ROM is removed when launch fails after download", async () => {
  let downloadedPath = "";
  const { socket } = createHarness({
    bootGame: () => {
      throw new Error("RetroArch launch failed.");
    },
    downloadCloudRom: (_romUrl, destinationPath) => {
      downloadedPath = destinationPath;
      fs.writeFileSync(destinationPath, "temporary-rom");
      return Promise.resolve();
    },
  });

  socket.emit("start-game", {
    mode: "cloud",
    romFilename: "https://attacker.example.test/game.nes",
    sessionId: "session-cloud-launch-fail",
    sessionToken: "token",
  });
  await flushStartGame();

  assert.ok(downloadedPath);
  assert.equal(fs.existsSync(downloadedPath), false);
  assert.equal(getErrorMessage(socket), "RetroArch launch failed.");
});

test("verified native sessions boot an allowlisted launch manifest without download", async () => {
  const { booted, downloads, socket } = createHarness({
    verifyBackendSession: () =>
      Promise.resolve({
        launchManifestId: "frozen-bubble",
        mode: "cloud",
        romTarget: null,
        runtimeId: "debian-native-v1",
        userId: "verified-user",
      }),
  });

  socket.emit("start-game", {
    mode: "cloud",
    romFilename: "ignored-by-backend",
    sessionId: "session-native",
    sessionToken: "token",
  });
  await flushStartGame();

  assert.deepEqual(downloads, []);
  assert.equal(booted[0]?.romPath, "frozen-bubble");
  assert.equal(booted[0]?.sessionId, "session-native");
  assert.equal(booted[0]?.options.runtimeId, "debian-native-v1");
});

test("non-cloud backend sessions cannot boot through cloud intent", async () => {
  const { booted, socket } = createHarness({
    verifyBackendSession: () =>
      Promise.resolve({
        mode: "local",
        romTarget: "https://cdn.example.test/game.nes",
        runtimeId: "mesen",
        userId: "verified-user",
      }),
  });

  socket.emit("start-game", {
    mode: "cloud",
    romFilename: "https://cdn.example.test/game.nes",
    sessionId: "session-3",
    sessionToken: "token",
  });
  await flushStartGame();

  assert.deepEqual(booted, []);
  assert.equal(
    getErrorMessage(socket),
    "Backend session is not approved for cloud boot.",
  );
});

test("local vault starts still use local rom paths without backend verification", async () => {
  const { booted, calls, socket } = createHarness();

  socket.emit("start-game", {
    mode: "local",
    romFilename: "nested/game.nes",
    sessionId: "session-4",
    userId: "local-user",
  });
  await flushStartGame();

  assert.equal(calls.verify, 0);
  assert.equal(booted[0]?.romPath, "/roms/local-user/game.nes");
  assert.equal(booted[0]?.sessionId, "session-4");
  assert.deepEqual(booted[0]?.options, {
    runtimeId: "mesen",
    streamProfile: { bitrateKbps: 1000, fps: 60, id: "balanced" },
  });
});

test("local vault starts infer runtime from supported file extensions", async () => {
  const { booted, calls, socket } = createHarness();

  socket.emit("start-game", {
    mode: "local",
    romFilename: "nested/game.gbc",
    sessionId: "session-gbc",
    userId: "local-user",
  });
  await flushStartGame();

  assert.equal(calls.verify, 0);
  assert.equal(booted[0]?.romPath, "/roms/local-user/game.gbc");
  assert.equal(booted[0]?.options.runtimeId, "mgba");
});

test("local vault starts infer PicoDrive for Genesis and Mega Drive files", async () => {
  const { booted, calls, socket } = createHarness();

  socket.emit("start-game", {
    mode: "local",
    romFilename: "nested/drive.md",
    sessionId: "session-genesis",
    userId: "local-user",
  });
  await flushStartGame();

  assert.equal(calls.verify, 0);
  assert.equal(booted[0]?.romPath, "/roms/local-user/drive.md");
  assert.equal(booted[0]?.options.runtimeId, "picodrive");
});

test("local vault starts infer PicoDrive for Sega 8-bit files", async () => {
  const { booted, calls, socket } = createHarness();

  socket.emit("start-game", {
    mode: "local",
    romFilename: "nested/master.sms",
    sessionId: "session-sms",
    userId: "local-user",
  });
  await flushStartGame();

  assert.equal(calls.verify, 0);
  assert.equal(booted[0]?.romPath, "/roms/local-user/master.sms");
  assert.equal(booted[0]?.options.runtimeId, "picodrive");
});

test("local vault boot failures emit a user-visible engine error", async () => {
  const { booted, socket } = createHarness({
    bootGame: () => {
      throw new Error("Invalid GBA cartridge header.");
    },
  });

  socket.emit("start-game", {
    mode: "local",
    romFilename: "broken.gba",
    sessionId: "session-broken-local",
    userId: "local-user",
  });
  await flushStartGame();

  assert.deepEqual(booted, []);
  assert.equal(
    getErrorMessage(socket),
    "Local Vault game failed to launch: Invalid GBA cartridge header.",
  );
});

test("stream profiles are clamped before reaching the runtime", () => {
  assert.deepEqual(
    normalizeStreamProfile({
      bitrateKbps: 1600,
      fps: 30,
      id: "performance",
    }),
    { bitrateKbps: 1600, fps: 30, id: "performance" },
  );

  assert.deepEqual(
    normalizeStreamProfile({
      bitrateKbps: 99999,
      fps: 999,
      id: "not allowed!",
    }),
    { bitrateKbps: 1000, fps: 60, id: "balanced" },
  );
});

test("stream restarts update the camera profile without booting the game", async () => {
  const { booted, socket, streamRestarts } = createHarness();

  socket.emit("restart-stream", {
    sessionId: "session-profile",
    streamProfile: {
      bitrateKbps: 1600,
      fps: 30,
      id: "performance",
    },
  });
  await flushStartGame();

  assert.deepEqual(booted, []);
  assert.deepEqual(streamRestarts, [
    {
      options: {
        iceServers: [],
        streamProfile: {
          bitrateKbps: 1600,
          fps: 30,
          id: "performance",
        },
      },
      sessionId: "session-profile",
    },
  ]);
});
