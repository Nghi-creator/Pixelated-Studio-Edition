import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const modulesRoot = fileURLToPath(new URL("../../../src/modules/", import.meta.url));

function filesNamed(directory: string, segment: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (!entry.isDirectory()) return [];
    if (entry.name === segment) {
      return fs
        .readdirSync(entryPath, { withFileTypes: true })
        .filter((child) => child.isFile() && child.name.endsWith(".ts"))
        .map((child) => path.join(entryPath, child.name));
    }
    return filesNamed(entryPath, segment);
  });
}

test("HTTP modules do not construct Supabase table or RPC queries", () => {
  for (const file of filesNamed(modulesRoot, "http")) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /\b(?:service|authenticatedService|supabaseService)\.(?:from|rpc)\s*\(/,
      file,
    );
    assert.doesNotMatch(source, /\.auth\.admin\b|\.storage\.from\s*\(/, file);
  }
});

test("domain modules do not depend on Fastify, Supabase, or infrastructure", () => {
  for (const file of filesNamed(modulesRoot, "domain")) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from ["']fastify["']|@supabase\//, file);
    assert.doesNotMatch(source, /from ["'][^"']*infrastructure\//, file);
  }
});

test("application modules depend on ports rather than Fastify or infrastructure", () => {
  for (const file of filesNamed(modulesRoot, "application")) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from ["']fastify["']|@supabase\//, file);
    assert.doesNotMatch(source, /from ["'][^"']*infrastructure\//, file);
  }
});
