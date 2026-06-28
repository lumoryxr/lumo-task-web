import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { usePetStore } from "../usePetStore";

beforeEach(() => {
  usePetStore.setState({ activeMsg: null, mood: "idle" });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("usePetStore — celebrate", () => {
  it("sets mood to excited and activeMsg to the given key", () => {
    usePetStore.getState().celebrate("pet.celebrate.q1");
    expect(usePetStore.getState().mood).toBe("excited");
    expect(usePetStore.getState().activeMsg).toBe("pet.celebrate.q1");
  });

  it("resets mood and message after the duration", () => {
    usePetStore.getState().celebrate("pet.celebrate.q1", 8000);
    vi.advanceTimersByTime(8000);
    expect(usePetStore.getState().mood).toBe("idle");
    expect(usePetStore.getState().activeMsg).toBeNull();
  });

  it("does not reset before the duration elapses", () => {
    usePetStore.getState().celebrate("pet.celebrate.q1", 8000);
    vi.advanceTimersByTime(7999);
    expect(usePetStore.getState().mood).toBe("excited");
  });
});

describe("usePetStore — react (lightweight pulse)", () => {
  it("briefly sets excited mood with no message, then settles to idle", () => {
    usePetStore.getState().react(1300);
    expect(usePetStore.getState().mood).toBe("excited");
    expect(usePetStore.getState().activeMsg).toBeNull(); // message-less

    vi.advanceTimersByTime(1299);
    expect(usePetStore.getState().mood).toBe("excited");
    vi.advanceTimersByTime(1);
    expect(usePetStore.getState().mood).toBe("idle");
  });

  it("does not clobber an in-flight celebration", () => {
    usePetStore.getState().celebrate("pet.celebrate.q1", 8000);
    usePetStore.getState().react(); // should be a no-op while a message shows
    expect(usePetStore.getState().activeMsg).toBe("pet.celebrate.q1");
    expect(usePetStore.getState().mood).toBe("excited");
  });

  it("a rapid second react resets the shared timer (last pulse wins)", () => {
    usePetStore.getState().react(1300);
    vi.advanceTimersByTime(1000);
    usePetStore.getState().react(1300); // reset
    vi.advanceTimersByTime(1000); // 2000 since first, but only 1000 since reset
    expect(usePetStore.getState().mood).toBe("excited");
    vi.advanceTimersByTime(300);
    expect(usePetStore.getState().mood).toBe("idle");
  });

  it("if a celebration starts during the pulse, react's timer leaves the message intact", () => {
    usePetStore.getState().react(1300);
    usePetStore.setState({ activeMsg: "pet.celebrate.q1", mood: "excited" });
    vi.advanceTimersByTime(1300);
    // react's settle must not wipe the message that appeared mid-pulse
    expect(usePetStore.getState().activeMsg).toBe("pet.celebrate.q1");
    expect(usePetStore.getState().mood).toBe("excited");
  });
});
