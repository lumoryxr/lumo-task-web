import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";

const secret = () => {
  // Always require a real secret — no insecure default in any environment.
  const s = process.env.LUMO_JWT_SECRET;
  if (!s) throw new Error("LUMO_JWT_SECRET must be set");
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
  const { payload } = await jwtVerify(token, secret());
  if (!payload.sub || !payload.jti) throw new Error("invalid token");
  // Legacy tokens minted before session versioning carry no sv → treat as 0.
  const sv = typeof payload.sv === "number" ? payload.sv : 0;
  return { userId: payload.sub, jti: payload.jti, sv };
}
