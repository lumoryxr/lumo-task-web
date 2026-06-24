/**
 * API · CORS origin policy
 *
 * The allowlist callback decides Access-Control-Allow-Origin. Exercises the
 * localhost-dev, Electron "null" origin, no-origin, and disallowed-origin paths.
 */
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { req, setupDb } from "../helpers/index.js";

before(setupDb);

describe("CORS origin allowlist", () => {
  test("echoes a localhost dev origin", async () => {
    const { headers } = await req("GET", "/health", { headers: { Origin: "http://localhost:5173" } });
    assert.equal(headers.get("access-control-allow-origin"), "http://localhost:5173");
  });

  test("echoes a 127.0.0.1 dev origin", async () => {
    const { headers } = await req("GET", "/health", { headers: { Origin: "http://127.0.0.1:5173" } });
    assert.equal(headers.get("access-control-allow-origin"), "http://127.0.0.1:5173");
  });

  test("returns 'null' for the Electron file:// (null) origin", async () => {
    const { headers } = await req("GET", "/health", { headers: { Origin: "null" } });
    assert.equal(headers.get("access-control-allow-origin"), "null");
  });

  test("does NOT allow an arbitrary disallowed origin", async () => {
    const { headers } = await req("GET", "/health", { headers: { Origin: "https://evil.example.com" } });
    const acao = headers.get("access-control-allow-origin");
    assert.ok(acao === null || acao === "", `unexpected ACAO: ${acao}`);
  });

  test("no Origin header → no ACAO added (server-to-server)", async () => {
    const { headers, status } = await req("GET", "/health");
    assert.equal(status, 200);
    const acao = headers.get("access-control-allow-origin");
    assert.ok(acao === null || acao === "", `unexpected ACAO: ${acao}`);
  });
});
