import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function mockFetch(status: number, body: unknown) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: () => Promise.resolve(body),
  } as Response;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res));
}

beforeEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API client — 401 session-expired handling", () => {
  it("dispatches lumo:session-expired on 401 from a protected endpoint", async () => {
    mockFetch(401, { error: { code: "UNAUTHORIZED", message: "Token expired" } });
    localStorage.setItem("lumo.token", "old-jwt");

    const dispatched: Event[] = [];
    const handler = (e: Event) => dispatched.push(e);
    window.addEventListener("lumo:session-expired", handler);

    const { api } = await import("../client");
    try { await api.listTasks(); } catch { /* expected */ }

    expect(dispatched).toHaveLength(1);
    expect(localStorage.getItem("lumo.token")).toBeNull();

    window.removeEventListener("lumo:session-expired", handler);
  });

  it("does NOT dispatch lumo:session-expired on 401 from /auth/signout", async () => {
    mockFetch(401, { error: { code: "UNAUTHORIZED", message: "Token expired" } });
    localStorage.setItem("lumo.token", "old-jwt");

    const dispatched: Event[] = [];
    const handler = (e: Event) => dispatched.push(e);
    window.addEventListener("lumo:session-expired", handler);

    const { api } = await import("../client");
    await api.signOut(); // swallows error internally

    expect(dispatched).toHaveLength(0);

    window.removeEventListener("lumo:session-expired", handler);
  });

  it("does NOT dispatch lumo:session-expired on 401 with no token (e.g. wrong password)", async () => {
    mockFetch(401, { error: { code: "INVALID_CREDENTIALS", message: "Wrong password" } });
    // No token in localStorage — simulates the login page scenario

    const dispatched: Event[] = [];
    const handler = (e: Event) => dispatched.push(e);
    window.addEventListener("lumo:session-expired", handler);

    const { api } = await import("../client");
    try {
      await api.signIn({ email: "a@b.com", password: "wrong" });
    } catch { /* expected */ }

    expect(dispatched).toHaveLength(0);

    window.removeEventListener("lumo:session-expired", handler);
  });

  it("dispatches lumo:session-expired only once when concurrent requests all return 401", async () => {
    mockFetch(401, { error: { code: "UNAUTHORIZED", message: "Token expired" } });
    localStorage.setItem("lumo.token", "old-jwt");

    const dispatched: Event[] = [];
    const handler = (e: Event) => dispatched.push(e);
    window.addEventListener("lumo:session-expired", handler);

    const { api } = await import("../client");
    await Promise.allSettled([api.listTasks(), api.listTasks(), api.listTasks()]);

    expect(dispatched).toHaveLength(1);

    window.removeEventListener("lumo:session-expired", handler);
  });
});

describe("API client — transparent token refresh on 401", () => {
  const json = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, statusText: String(status), json: () => Promise.resolve(body) }) as Response;

  it("refreshes the access token on 401 and replays the original request", async () => {
    localStorage.setItem("lumo.token", "old-access");
    localStorage.setItem("lumo.refresh_token", "rt1");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { error: { code: "UNAUTHORIZED" } }))      // GET /user
      .mockResolvedValueOnce(json(200, { token: "new-access", refreshToken: "rt2" })) // /auth/refresh
      .mockResolvedValueOnce(json(200, { id: "u1", name: "X" }));                 // replayed GET /user
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const user = await api.getUser();

    expect((user as { id: string }).id).toBe("u1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/auth/refresh");
    expect(localStorage.getItem("lumo.token")).toBe("new-access");
    expect(localStorage.getItem("lumo.refresh_token")).toBe("rt2");
  });

  it("shares a single refresh across concurrent 401s (no token-reuse storm)", async () => {
    localStorage.setItem("lumo.token", "old-access");
    localStorage.setItem("lumo.refresh_token", "rt1");
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes("/auth/refresh")) {
        localStorage.setItem("lumo.token", "new-access");
        return Promise.resolve(json(200, { token: "new-access", refreshToken: "rt2" }));
      }
      // /user: 401 while the access token is stale, 200 once refreshed.
      const fresh = localStorage.getItem("lumo.token") === "new-access";
      return Promise.resolve(fresh ? json(200, { id: "u1" }) : json(401, { error: { code: "UNAUTHORIZED" } }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    await Promise.all([api.getUser(), api.getUser(), api.getUser()]);

    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/auth/refresh"));
    expect(refreshCalls.length).toBe(1);
  });

  it("fires session-expired and clears tokens when the refresh itself fails", async () => {
    localStorage.setItem("lumo.token", "old-access");
    localStorage.setItem("lumo.refresh_token", "rt-bad");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { error: { code: "UNAUTHORIZED" } }))            // GET /user
      .mockResolvedValueOnce(json(401, { error: { code: "INVALID_REFRESH_TOKEN" } }));  // /auth/refresh
    vi.stubGlobal("fetch", fetchMock);

    const dispatched: Event[] = [];
    const handler = (e: Event) => dispatched.push(e);
    window.addEventListener("lumo:session-expired", handler);

    const { api } = await import("../client");
    await expect(api.getUser()).rejects.toBeTruthy();

    expect(dispatched).toHaveLength(1);
    expect(localStorage.getItem("lumo.token")).toBeNull();
    expect(localStorage.getItem("lumo.refresh_token")).toBeNull();

    window.removeEventListener("lumo:session-expired", handler);
  });

  it("signOut sends the refresh token for revocation and clears both tokens", async () => {
    localStorage.setItem("lumo.token", "acc");
    localStorage.setItem("lumo.refresh_token", "rt1");
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    await api.signOut();

    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sentBody.refreshToken).toBe("rt1");
    expect(localStorage.getItem("lumo.token")).toBeNull();
    expect(localStorage.getItem("lumo.refresh_token")).toBeNull();
  });
});

describe("API client — listAllCompleted pagination", () => {
  const page = (items: unknown[], nextCursor: string | null) =>
    ({ ok: true, status: 200, statusText: "200", json: () => Promise.resolve({ items, nextCursor }) }) as Response;

  it("pages through the keyset cursor and concatenates the full history", async () => {
    localStorage.setItem("lumo.token", "jwt");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(page([{ id: "a", title: { en: "A" }, completedAt: "2026-01-03" }], "cur1"))
      .mockResolvedValueOnce(page([{ id: "b", title: { en: "B" }, completedAt: "2026-01-02" }], "cur2"))
      .mockResolvedValueOnce(page([{ id: "c", title: { en: "C" }, completedAt: "2026-01-01" }], null));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const all = await api.listAllCompleted();

    expect(all.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // The 2nd and 3rd calls must carry the cursor returned by the prior page.
    expect(String(fetchMock.mock.calls[1][0])).toContain("cursor=cur1");
    expect(String(fetchMock.mock.calls[2][0])).toContain("cursor=cur2");
  });

  it("stops after a single page when there is no nextCursor", async () => {
    localStorage.setItem("lumo.token", "jwt");
    const fetchMock = vi.fn().mockResolvedValueOnce(page([{ id: "only", title: { en: "X" }, completedAt: "2026-01-01" }], null));
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("../client");
    const all = await api.listAllCompleted();

    expect(all).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
