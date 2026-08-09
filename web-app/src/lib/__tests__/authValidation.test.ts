import { describe, it, expect } from "vitest";
import {
  validateUsername,
  validatePassword,
  validateRegister,
  validateSignin,
} from "../authValidation";

describe("validateUsername", () => {
  it("accepts a valid username", () => {
    expect(validateUsername("alex")).toBeNull();
    expect(validateUsername("a_b-c9")).toBeNull();
  });
  it("rejects empty / too short / too long", () => {
    expect(validateUsername("")).toBe("auth.err.usernameRequired");
    expect(validateUsername("ab")).toBe("auth.err.usernameShort");
    expect(validateUsername("a".repeat(33))).toBe("auth.err.usernameLong");
  });
  it("rejects illegal characters and separator edges", () => {
    expect(validateUsername("alex!")).toBe("auth.err.usernameChars");
    expect(validateUsername("has space")).toBe("auth.err.usernameChars");
    expect(validateUsername("-alex")).toBe("auth.err.usernameEdges");
    expect(validateUsername("alex_")).toBe("auth.err.usernameEdges");
  });
  it("rejects reserved handles (case-insensitive)", () => {
    expect(validateUsername("admin")).toBe("auth.err.usernameReserved");
    expect(validateUsername("ROOT")).toBe("auth.err.usernameReserved");
  });
});

describe("validatePassword", () => {
  it("accepts a valid password", () => {
    expect(validatePassword("pass1234")).toBeNull();
  });
  it("rejects empty / short / no-complexity", () => {
    expect(validatePassword("")).toBe("auth.err.passwordRequired");
    expect(validatePassword("ab1")).toBe("auth.err.passwordShort");
    expect(validatePassword("a1" + "x".repeat(255))).toBe("auth.err.passwordLong");
    expect(validatePassword("abcdefgh")).toBe("auth.err.passwordComplexity");
    expect(validatePassword("12345678")).toBe("auth.err.passwordComplexity");
  });
});

describe("validateRegister", () => {
  it("returns no errors for a valid trio", () => {
    expect(validateRegister({ username: "alex", password: "pass1234", confirm: "pass1234" })).toEqual({});
  });
  it("flags a password mismatch (only once the password itself is valid)", () => {
    expect(validateRegister({ username: "alex", password: "pass1234", confirm: "nope1234" })).toEqual({
      confirm: "auth.err.confirmMismatch",
    });
    // A weak password takes precedence over the mismatch, to fix one thing at a time.
    expect(validateRegister({ username: "alex", password: "weak", confirm: "different" })).toEqual({
      password: "auth.err.passwordShort",
    });
  });
  it("collects username + password errors together", () => {
    const errs = validateRegister({ username: "", password: "", confirm: "" });
    expect(errs.username).toBe("auth.err.usernameRequired");
    expect(errs.password).toBe("auth.err.passwordRequired");
  });
});

describe("validateSignin", () => {
  it("requires both fields present", () => {
    expect(validateSignin({ username: "", password: "" })).toEqual({
      username: "auth.err.usernameRequired",
      password: "auth.err.passwordRequired",
    });
    expect(validateSignin({ username: "alex", password: "x" })).toEqual({});
  });
});
