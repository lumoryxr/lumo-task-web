import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  UserProfileWireSchema,
  DataExportWireSchema,
  DeleteAccountResponseSchema,
} from "../user.js";

describe("UserProfileWireSchema", () => {
  const valid = {
    id: "u_1",
    email: "ada@example.com",
    name: "Ada",
    initials: "AL",
    local: false,
    emailVerified: true,
    plan: "free",
    renewsAt: null,
    stats: { tasks: 3, pomodoros: 12, syncOK: true },
  };

  test("parses a full profile", () => {
    assert.equal(UserProfileWireSchema.safeParse(valid).success, true);
  });

  test("allows a non-null renewsAt", () => {
    assert.equal(
      UserProfileWireSchema.safeParse({ ...valid, renewsAt: "2026-12-01" }).success,
      true,
    );
  });

  test("rejects a row missing stats", () => {
    const { stats, ...noStats } = valid;
    assert.equal(UserProfileWireSchema.safeParse(noStats).success, false);
  });
});

describe("DataExportWireSchema", () => {
  const empty = {
    format_version: 1 as const,
    exported_at: "2026-08-08T00:00:00.000Z",
    user: {
      id: "u_1",
      email: "ada@example.com",
      name: "Ada",
      initials: "AL",
      plan: "free",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    settings: null,
    tasks: [],
    completed: [],
    people: [],
    habits: [],
    habit_logs: [],
    countdowns: [],
    projects: [],
    templates: [],
  };

  test("parses an empty (but complete) bundle", () => {
    assert.equal(DataExportWireSchema.safeParse(empty).success, true);
  });

  test("accepts arbitrary open rows in each collection", () => {
    const withRows = {
      ...empty,
      settings: { locale: "en", accent: "green", hasAiKey: false },
      tasks: [{ id: "t_1", title_en: "Ship it", quadrant: "Q1" }],
    };
    assert.equal(DataExportWireSchema.safeParse(withRows).success, true);
  });

  test("rejects a bundle missing a collection", () => {
    const { templates, ...missing } = empty;
    assert.equal(DataExportWireSchema.safeParse(missing).success, false);
  });

  test("rejects a wrong format_version", () => {
    assert.equal(DataExportWireSchema.safeParse({ ...empty, format_version: 2 }).success, false);
  });
});

describe("DeleteAccountResponseSchema", () => {
  test("parses the ack", () => {
    assert.equal(DeleteAccountResponseSchema.safeParse({ ok: true }).success, true);
  });

  test("rejects ok:false", () => {
    assert.equal(DeleteAccountResponseSchema.safeParse({ ok: false }).success, false);
  });
});
