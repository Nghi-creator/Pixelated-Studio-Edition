import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PassThrough } from "node:stream";
import {
  createCloudRomDownloader,
  createPinnedAddressLookup,
  isPublicNetworkAddress,
} from "../../src/roms/cloudRomDownloader";

const validation = { runtimeId: "mesen" };
const downloadTestRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "pixelated-download-tests-"),
);
test.after(() => {
  fs.rmSync(downloadTestRoot, { force: true, recursive: true });
});

test("cloud ROM downloads fail closed without an allowed-host configuration", () => {
  const downloader = createCloudRomDownloader({
    allowedRomHosts: [],
    maxCloudRomSizeBytes: 1024,
    timeoutMs: 100,
  });

  assert.throws(
    () => downloader.validateCloudRomUrl("https://roms.example/game.nes"),
    /downloads are disabled/,
  );
});

test("classifies private and reserved network addresses as unsafe", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "fc00::1",
    "fe80::1",
  ]) {
    assert.equal(isPublicNetworkAddress(address), false, address);
  }

  assert.equal(isPublicNetworkAddress("1.1.1.1"), true);
  assert.equal(isPublicNetworkAddress("2606:4700:4700::1111"), true);
});

test("pinned DNS lookup supports Node's all-address callback mode", () => {
  const pinnedAddress = { address: "1.1.1.1", family: 4 };
  const lookup = createPinnedAddressLookup(pinnedAddress);

  lookup("roms.example", { all: true }, (error, addresses, family) => {
    assert.ifError(error);
    assert.deepEqual(addresses, [pinnedAddress]);
    assert.equal(family, undefined);
  });
});

test("pinned DNS lookup retains the single-address callback mode", () => {
  const lookup = createPinnedAddressLookup({
    address: "2606:4700:4700::1111",
    family: 6,
  });

  lookup("roms.example", { all: false }, (error, address, family) => {
    assert.ifError(error);
    assert.equal(address, "2606:4700:4700::1111");
    assert.equal(family, 6);
  });
});

test("rejects an allowed host when DNS includes a private address", async () => {
  const downloader = createCloudRomDownloader({
    allowedRomHosts: ["roms.example"],
    maxCloudRomSizeBytes: 1024,
    timeoutMs: 100,
    resolveHost: async () => [
      { address: "203.0.113.10", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ],
  });

  await assert.rejects(
    downloader.downloadCloudRom(
      "https://roms.example/game.nes",
      path.join(downloadTestRoot, "private-address.nes"),
      validation,
    ),
    /non-public network address/,
  );
});

test("enforces a total deadline even when the transport never responds", async () => {
  class HangingRequest extends EventEmitter {
    setTimeout() {
      return this;
    }

    destroy(error: Error) {
      this.emit("error", error);
      return this;
    }
  }

  const request = (() => new HangingRequest()) as unknown as typeof https.get;
  const downloader = createCloudRomDownloader({
    allowedRomHosts: ["roms.example"],
    maxCloudRomSizeBytes: 1024,
    timeoutMs: 25,
    resolveHost: async () => [
      { address: "1.1.1.1", family: 4 },
    ],
    request,
  });

  await assert.rejects(
    downloader.downloadCloudRom(
      "https://roms.example/game.nes",
      path.join(downloadTestRoot, "deadline.nes"),
      validation,
    ),
    /deadline exceeded/,
  );
});

test("a stalled DNS lookup rejects before creating an artifact or transport", async () => {
  const destination = path.join(downloadTestRoot, "dns-deadline.nes");
  const downloader = createCloudRomDownloader({
    allowedRomHosts: ["roms.example"],
    maxCloudRomSizeBytes: 1024,
    timeoutMs: 25,
    resolveHost: () => new Promise(() => {}),
  });
  await assert.rejects(
    downloader.downloadCloudRom("https://roms.example/game.nes", destination, validation),
    /DNS resolution deadline exceeded/,
  );
  assert.equal(fs.existsSync(destination), false);
});

function downloaderWithRequest(request: typeof https.get) {
  return createCloudRomDownloader({
    allowedRomHosts: ["roms.example"],
    maxCloudRomSizeBytes: 1024,
    timeoutMs: 100,
    resolveHost: async () => [{ address: "1.1.1.1", family: 4 }],
    request,
  });
}

test("a failed exclusive open preserves the existing destination and never starts a request", async () => {
  const destination = path.join(downloadTestRoot, "existing.nes");
  fs.writeFileSync(destination, "existing artifact");
  let requested = false;
  const downloader = downloaderWithRequest((() => {
    requested = true;
    throw new Error("request must not start");
  }) as unknown as typeof https.get);
  await assert.rejects(
    downloader.downloadCloudRom("https://roms.example/game.nes", destination, validation),
    { code: "EEXIST" },
  );
  assert.equal(requested, false);
  assert.equal(fs.readFileSync(destination, "utf8"), "existing artifact");
});

test("synchronous transport failures close and remove the owned partial file", async () => {
  const destination = path.join(downloadTestRoot, "transport-error.nes");
  const downloader = downloaderWithRequest((() => {
    throw new Error("transport failed synchronously");
  }) as unknown as typeof https.get);
  await assert.rejects(
    downloader.downloadCloudRom("https://roms.example/game.nes", destination, validation),
    /transport failed synchronously/,
  );
  assert.equal(fs.existsSync(destination), false);
});

test("successful cloud downloads finish and validate the artifact", async () => {
  const destination = path.join(downloadTestRoot, "complete.nes");
  const request = ((_url: unknown, _options: unknown, callback: (response: IncomingMessage) => void) => {
    const transport = new EventEmitter() as EventEmitter & {
      setTimeout: () => void;
      destroy: () => void;
    };
    transport.setTimeout = () => {};
    transport.destroy = () => {};
    setImmediate(() => {
      const response = new PassThrough() as PassThrough & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = 200;
      response.headers = { "content-length": "4" };
      callback(response as unknown as IncomingMessage);
      response.end(Buffer.from([0x4e, 0x45, 0x53, 0x1a]));
    });
    return transport;
  }) as unknown as typeof https.get;
  await downloaderWithRequest(request).downloadCloudRom(
    "https://roms.example/game.nes", destination, validation,
  );
  assert.deepEqual(fs.readFileSync(destination), Buffer.from([0x4e, 0x45, 0x53, 0x1a]));
});
