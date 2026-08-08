import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import test from "node:test";
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
