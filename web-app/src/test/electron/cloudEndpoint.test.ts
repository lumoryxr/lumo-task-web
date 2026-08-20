/**
 * Desktop cloud-endpoint resolution + validation (electron/cloudEndpoint.cjs).
 *
 * The endpoint governs which cloud the bundled backend signs into with the
 * user's credentials, so its validation is a security boundary: only https (or
 * http to loopback), origin-only, no embedded credentials. Priority is saved
 * custom → operator env → built-in production default.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

interface CloudEndpointModule {
  DEFAULT_CLOUD_API_BASE: string;
  MAX_ENDPOINT_LENGTH: number;
  validateCloudEndpoint: (raw: unknown) => string | null;
  resolveCloudApiBase: (opts?: { savedEndpoint?: string | null; envBase?: string | null }) => string;
}

const require = createRequire(import.meta.url);
const { DEFAULT_CLOUD_API_BASE, validateCloudEndpoint, resolveCloudApiBase } =
  require("../../../electron/cloudEndpoint.cjs") as CloudEndpointModule;

describe("validateCloudEndpoint", () => {
  it("accepts an https origin and normalises away a trailing slash", () => {
    expect(validateCloudEndpoint("https://lumoryxr.duckdns.org")).toBe("https://lumoryxr.duckdns.org");
    expect(validateCloudEndpoint("https://sync.example.com/")).toBe("https://sync.example.com");
    expect(validateCloudEndpoint("  https://sync.example.com  ")).toBe("https://sync.example.com");
  });

  it("accepts http only for loopback hosts", () => {
    expect(validateCloudEndpoint("http://localhost:8080")).toBe("http://localhost:8080");
    expect(validateCloudEndpoint("http://127.0.0.1:47291")).toBe("http://127.0.0.1:47291");
    expect(validateCloudEndpoint("http://sync.example.com")).toBeNull();
  });

  it("rejects non-http(s) schemes", () => {
    expect(validateCloudEndpoint("ftp://example.com")).toBeNull();
    expect(validateCloudEndpoint("javascript:alert(1)")).toBeNull();
    expect(validateCloudEndpoint("file:///etc/passwd")).toBeNull();
  });

  it("rejects a path, query, fragment, or embedded credentials", () => {
    expect(validateCloudEndpoint("https://example.com/v1")).toBeNull();
    expect(validateCloudEndpoint("https://example.com/?x=1")).toBeNull();
    expect(validateCloudEndpoint("https://example.com#frag")).toBeNull();
    expect(validateCloudEndpoint("https://user:pass@example.com")).toBeNull();
  });

  it("rejects empty, over-long, and non-string input", () => {
    expect(validateCloudEndpoint("")).toBeNull();
    expect(validateCloudEndpoint("   ")).toBeNull();
    expect(validateCloudEndpoint("not a url")).toBeNull();
    expect(validateCloudEndpoint(`https://${"a".repeat(300)}.com`)).toBeNull();
    expect(validateCloudEndpoint(null)).toBeNull();
    expect(validateCloudEndpoint(42)).toBeNull();
  });
});

describe("resolveCloudApiBase", () => {
  it("defaults to production when nothing is configured", () => {
    expect(resolveCloudApiBase()).toBe(DEFAULT_CLOUD_API_BASE);
    expect(DEFAULT_CLOUD_API_BASE).toBe("https://lumoryxr.duckdns.org");
    expect(resolveCloudApiBase({ savedEndpoint: null, envBase: "" })).toBe(DEFAULT_CLOUD_API_BASE);
  });

  it("prefers a valid saved endpoint over env and default", () => {
    expect(
      resolveCloudApiBase({ savedEndpoint: "https://mine.example.com", envBase: "https://ops.example.com" }),
    ).toBe("https://mine.example.com");
  });

  it("falls back to the operator env base when no saved endpoint", () => {
    expect(resolveCloudApiBase({ savedEndpoint: "", envBase: "https://ops.example.com" })).toBe(
      "https://ops.example.com",
    );
  });

  it("ignores an invalid saved endpoint and falls through", () => {
    expect(
      resolveCloudApiBase({ savedEndpoint: "http://evil.example.com", envBase: "https://ops.example.com" }),
    ).toBe("https://ops.example.com");
    expect(resolveCloudApiBase({ savedEndpoint: "garbage" })).toBe(DEFAULT_CLOUD_API_BASE);
  });
});
