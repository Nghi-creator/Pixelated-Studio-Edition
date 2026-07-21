import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerStudioOriginGate } from "../../../src/plugins/studioOriginGate.js";

async function createApp() {
  const app = Fastify({ logger: false });
  await registerStudioOriginGate(app, { studioOrigins: ["https://studio.example"] });
  app.get("/admin/users", async () => ({ ok: true }));
  app.post("/submissions/games", async () => ({ ok: true }));
  app.get("/games", async () => ({ ok: true }));
  return app;
}

test("Studio origin gate protects admin and submission writes", async () => {
  const app = await createApp();
  assert.equal((await app.inject({ method: "GET", url: "/admin/users" })).statusCode, 403);
  assert.equal((await app.inject({ headers: { origin: "https://user.example" }, method: "POST", url: "/submissions/games" })).statusCode, 403);
  assert.equal((await app.inject({ headers: { origin: "https://studio.example" }, method: "GET", url: "/admin/users" })).statusCode, 200);
  await app.close();
});

test("Studio origin gate leaves public and read-only paths alone", async () => {
  const app = await createApp();
  assert.equal((await app.inject({ method: "GET", url: "/games" })).statusCode, 200);
  assert.equal((await app.inject({ method: "GET", url: "/submissions/games" })).statusCode, 404);
  await app.close();
});
