import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TaskUpdateBodySchema } from "../task.js";
import { ProjectUpdateBodySchema } from "../project.js";
import { HabitUpdateBodySchema } from "../habit.js";
import { CountdownUpdateBodySchema } from "../countdown.js";
import { PersonUpdateBodySchema } from "../person.js";

// A PATCH body carries ONLY the fields the client sent. The backend treats a
// present key as "overwrite this column", so a schema that fills in create-time
// defaults (quadrant → "unclassified", today → false, color → "green", …) would
// silently reset every column the client did not touch. Zod 4 applies
// `.default()` even inside `.partial()`, so these schemas must strip defaults.
const PATCH_SCHEMAS = [
  ["TaskUpdateBody", TaskUpdateBodySchema, { title: { en: "Renamed" } }],
  ["ProjectUpdateBody", ProjectUpdateBodySchema, { name: "Renamed" }],
  ["HabitUpdateBody", HabitUpdateBodySchema, { title: "Renamed" }],
  ["CountdownUpdateBody", CountdownUpdateBodySchema, { title: "Renamed" }],
  ["PersonUpdateBody", PersonUpdateBodySchema, { name: "Renamed" }],
] as const;

describe("PATCH body schemas never inject defaults", () => {
  for (const [name, schema, onlyField] of PATCH_SCHEMAS) {
    test(`${name}: an empty patch parses to an empty object`, () => {
      assert.deepEqual(schema.parse({}), {});
    });

    test(`${name}: a one-field patch carries only that field`, () => {
      assert.deepEqual(Object.keys(schema.parse(onlyField)), Object.keys(onlyField));
    });
  }

  test("TaskUpdateBody still de-duplicates tags when they are sent", () => {
    assert.deepEqual(TaskUpdateBodySchema.parse({ tags: ["a", "A", "b"] }).tags, ["a", "b"]);
  });

  test("TaskUpdateBody still validates a field that is sent", () => {
    assert.equal(TaskUpdateBodySchema.safeParse({ duration: 5000 }).success, false);
  });
});
