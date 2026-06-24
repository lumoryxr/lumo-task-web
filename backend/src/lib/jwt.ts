import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";

const MIN_SECRET_BYTES = 32;

const secret = () => {
  // Always require a real, high-entropy secret — no insecure default and no
  // weak-secret backdoor in any environment. HS256 security depends entirely on
  // the key, so reject anything below 32 bytes (256 bits).
  const s = process.env.LUMO_JWT_SECRET;
  if (!s) throw new Error("LUMO_JWT_SECRET must be set");
  if (Buffer.byteLength(s, "utf8") < MIN_SECRET_BYTES) {
    throw new Error(`LUMO_JWT_SECRET must be at least ${MIN_SECRET_BYTES} bytes`);
  }
  return new TextEncoder().encode(s);
};

export async function signToken(userId: string, sessionVersion = 0): Promise<string> {
  return new SignJWT({ sub: userId, sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime("7d")
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
