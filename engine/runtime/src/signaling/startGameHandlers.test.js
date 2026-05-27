const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const {
  normalizeStreamProfile,
  registerStartGameHandler,
} = require("./startGameHandlers");

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.data = {};
    this.outbound = [];
    this.rooms = [];
  }

  emit(event, ...args) {
    if (event === "engine-error") {
      this.outbound.push({ event, payload: args[0] });
      return true;
    }

    return super.emit(event, ...args);
  }

  join(room) {
    this.rooms.push(room);
  }
}

function createHarness(overrides = {}) {
  const socket = new FakeSocket();
  const booted = [];
  const downloads = [];
  const calls = {
    verify: 0,
  };

  registerStartGameHandler(socket, {
    apiUrl: "http://api.test",
    downloadCloudRom:
      overrides.downloadCloudRom ||
      ((romUrl, destinationPath) => {
        downloads.push({ destinationPath, romUrl });
        return Promise.resolve();
      }),
    runtime: {
      bootGame: (romPath, sessionId, options) => {
        booted.push({ options, romPath, sessionId });
      },
    },
    verifyBackendSession:
      overrides.verifyBackendSession ||
      ((options) => {
        calls.verify += 1;
        return Promise.resolve({
          mode: "cloud",
          romTarget: "https://cdn.example.test/game.nes",
          userId: "verified-user",
          options,
        });
      }),
  });

  return { booted, calls, downloads, socket };
}

function flushStartGame() {
  return new Promise((resolve) => setImmediate(resolve));
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
    socket.outbound[0].payload.message,
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
  assert.equal(downloads[0].romUrl, "https://cdn.example.test/game.nes");
  assert.equal(booted[0].sessionId, "session-2");
  assert.deepEqual(booted[0].options, {
    isCloudRom: true,
    streamProfile: { bitrateKbps: 1000, fps: 60, id: "balanced" },
  });
});

test("non-cloud backend sessions cannot boot through cloud intent", async () => {
  const { booted, socket } = createHarness({
    verifyBackendSession: () =>
      Promise.resolve({
        mode: "local",
        romTarget: "https://cdn.example.test/game.nes",
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
    socket.outbound[0].payload.message,
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
  assert.equal(booted[0].romPath, "/roms/local-user/game.nes");
  assert.equal(booted[0].sessionId, "session-4");
  assert.deepEqual(booted[0].options, {
    streamProfile: { bitrateKbps: 1000, fps: 60, id: "balanced" },
  });
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
