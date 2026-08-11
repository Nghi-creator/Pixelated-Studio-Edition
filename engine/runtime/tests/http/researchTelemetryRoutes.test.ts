import assert from "node:assert/strict";
import type { Express, Request, RequestHandler, Response } from "express";
import test from "node:test";
import { registerResearchTelemetryRoutes } from "../../src/http/researchTelemetryRoutes";

test("research telemetry route authenticates before reading a session", () => {
  const handlers: RequestHandler[] = [];
  const app = {
    get: (_path: string, ...routeHandlers: RequestHandler[]) => {
      handlers.push(...routeHandlers);
    },
  } as unknown as Express;
  const requireEngineToken: RequestHandler = (_req, _res, next) => next();

  registerResearchTelemetryRoutes(app, {
    getResearchTelemetrySnapshot: () => null,
    requireEngineToken,
  });

  assert.equal(handlers[0], requireEngineToken);
  assert.equal(handlers.length, 2);
});

test("research telemetry route bounds and binds session requests", () => {
  const handlers: RequestHandler[] = [];
  const app = {
    get: (_path: string, ...routeHandlers: RequestHandler[]) => {
      handlers.push(...routeHandlers);
    },
  } as unknown as Express;
  const requestedSessions: string[] = [];
  registerResearchTelemetryRoutes(app, {
    getResearchTelemetrySnapshot: (sessionId) => {
      requestedSessions.push(sessionId);
      return sessionId === "active-session" ? { sessionId } : null;
    },
    requireEngineToken: (_req, _res, next) => next(),
  });
  const bodyHandler = handlers[1];

  function invoke(sessionId: string) {
    const result: { body?: unknown; status?: number } = {};
    const response = {
      json: (body: unknown) => {
        result.body = body;
        return response;
      },
      set: () => response,
      status: (status: number) => {
        result.status = status;
        return response;
      },
    } as unknown as Response;
    bodyHandler(
      { query: { sessionId } } as unknown as Request,
      response,
      () => undefined,
    );
    return result;
  }

  assert.equal(invoke("bad/session").status, 400);
  assert.deepEqual(requestedSessions, []);
  assert.equal(invoke("inactive-session").status, 409);
  assert.deepEqual(invoke("active-session").body, {
    sessionId: "active-session",
  });
});
