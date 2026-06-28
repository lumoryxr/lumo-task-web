import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { assertStrongSecret } from "./secret-policy.js";

const secret = () => {
  // Always require a real, high-entropy secret — no insecure default and no
  // weak/blank/placeholder backdoor in any environment (see lib/secret-policy).
  return new TextEncoder().encode(assertStrongSecret("LUMO_JWT_SECRET", process.env.LUMO_JWT_SECRET));
};

// Short-lived access token: clients transparently rotate it via the refresh
// token (POST /v1/auth/refresh). Override with LUMO_ACCESS_TTL (a jose duration
// string, e.g. "15m" / "1h"); defaults to 30 minutes.
const ACCESS_TTL = process.env.LUMO_ACCESS_TTL?.trim() || "30m";

export async function signToken(userId: string, sessionVersion = 0): Promise<string> {
  return new SignJWT({ sub: userId, sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(ACCESS_TTL)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<{ userId: string; jti: string; sv: number }> {
  // Pin the algorithm to HS256 (the only algorithm we sign with) so a token
  // cannot be replayed under a different HS* variant.
  const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
  if (!payload.sub || !payload.jti) throw new Error("invalid token");
  // Legacy tokens minted before session versioning carry no sv → treat as 0.
  const sv = typeof payload.sv === "number" ? payload.sv : 0;
  return { userId: payload.sub, jti: payload.jti, sv };
}
