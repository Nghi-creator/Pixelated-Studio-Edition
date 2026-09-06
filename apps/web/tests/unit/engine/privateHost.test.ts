import assert from "node:assert/strict";
import test from "node:test";
import {
  isLocalEngineHostname,
  isLocalOrLanEngineHostname,
  isPrivateIpv4,
} from "../../../src/lib/network/privateHost.ts";

test("private IPv4 validation requires four bounded integer octets", () => {
  assert.equal(isPrivateIpv4("10.0.0.1"), true);
  assert.equal(isPrivateIpv4("172.16.0.1"), true);
  assert.equal(isPrivateIpv4("172.31.255.255"), true);
  assert.equal(isPrivateIpv4("192.168.1.10"), true);
  assert.equal(isPrivateIpv4("172.32.0.1"), false);
  assert.equal(isPrivateIpv4("192.168.256.1"), false);
  assert.equal(isPrivateIpv4("192.168.-1.1"), false);
  assert.equal(isPrivateIpv4("192.168.1"), false);
  assert.equal(isPrivateIpv4("10..0.1"), false);
  assert.equal(isPrivateIpv4("10.0.0.1.5"), false);
  assert.equal(isPrivateIpv4("192.168.1.5x"), false);
});

test("local and LAN host classification is shared across engine entry points", () => {
  assert.equal(isLocalEngineHostname("LOCALHOST"), true);
  assert.equal(isLocalOrLanEngineHostname("pixelated.local"), true);
  assert.equal(isLocalOrLanEngineHostname("engine.example.test"), false);
});
