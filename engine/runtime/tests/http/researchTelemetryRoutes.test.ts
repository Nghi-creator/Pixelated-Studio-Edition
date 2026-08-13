import assert from "node:assert/strict";
import type { Express, Request, RequestHandler, Response } from "express";
import test from "node:test";
import {
  createResearchTelemetryRateLimiter,
  registerResearchTelemetryRoutes,
} from "../../src/http/researchTelemetryRoutes";

test("research telemetry route authenticates before reading a session", () => {
  const handlers: RequestHandler[] = [];
  const app = {
    get: (_path: string, ...routeHandlers: RequestHandler[]) => {
      handlers.push(...routeHandlers);
    },
  } as unknown as Express;
  const requireEngineToken: RequestHandler = (_req, _res, next) => next();
  const rateLimit: RequestHandler = (_req, _res, next) => next();

  registerResearchTelemetryRoutes(app, {
    getResearchTelemetrySnapshot: () => null,
    rateLimit,
    requireEngineToken,
  });

  assert.equal(handlers[0], requireEngineToken);
  assert.equal(handlers[1], rateLimit);
  assert.equal(handlers.length, 3);
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
    rateLimit: (_req, _res, next) => next(),
    requireEngineToken: (_req, _res, next) => next(),
  });
  const bodyHandler = handlers[2];

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

test("research telemetry rate limiting has per-client and global ceilings", () => {
  let now = 1_000;
  const limiter = createResearchTelemetryRateLimiter({
    globalLimit: 3,
    limit: 2,
    now: () => now,
    windowMs: 1_000,
  });

  function invoke(clientId: string) {
    const result: { next: boolean; retryAfter?: string; status?: number } = {
      next: false,
    };
    const request = {
      get: (name: string) =>
        name === "x-pixelated-client-id" ? clientId : undefined,
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;
    const response = {
      json: () => response,
      set: (name: string, value: string) => {
        if (name === "Retry-After") result.retryAfter = value;
        return response;
      },
      status: (status: number) => {
        result.status = status;
        return response;
      },
    } as unknown as Response;
    limiter(request, response, () => {
      result.next = true;
    });
    return result;
  }

  assert.equal(invoke("client-a").next, true);
  assert.equal(invoke("client-a").next, true);
  assert.equal(invoke("client-a").status, 429);
  assert.equal(invoke("client-b").status, 429);

  now = 2_001;
  assert.equal(invoke("client-a").next, true);
});
