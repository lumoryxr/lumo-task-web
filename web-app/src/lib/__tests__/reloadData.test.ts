import { describe, it, expect, vi, beforeEach } from "vitest";

const tasksLoad = vi.fn(async () => {});
const peopleLoad = vi.fn(async () => {});
const countdownLoad = vi.fn(async (_userId: string) => {});
const habitsLoad = vi.fn(async (_userId: string) => {});

vi.mock("@/store/useTasksStore", () => ({
  useTasksStore: { getState: () => ({ load: tasksLoad }) },
}));
vi.mock("@/store/usePeopleStore", () => ({
  usePeopleStore: { getState: () => ({ load: peopleLoad }) },
}));
vi.mock("@/store/useCountdownStore", () => ({
  useCountdownStore: { getState: () => ({ load: countdownLoad }) },
}));
vi.mock("@/store/useHabitsStore", () => ({
  useHabitsStore: { getState: () => ({ load: habitsLoad }) },
}));

import { reloadAllData } from "../reloadData";

beforeEach(() => {
  tasksLoad.mockClear();
  peopleLoad.mockClear();
  countdownLoad.mockClear();
  habitsLoad.mockClear();
});

describe("reloadAllData", () => {
  it("re-loads every data store, passing userId to the user-keyed ones", async () => {
    await reloadAllData("user-42");

    expect(tasksLoad).toHaveBeenCalledTimes(1);
    expect(peopleLoad).toHaveBeenCalledTimes(1);
    expect(countdownLoad).toHaveBeenCalledWith("user-42");
    expect(habitsLoad).toHaveBeenCalledWith("user-42");
  });
});
