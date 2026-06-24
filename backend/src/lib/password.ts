import bcrypt from "bcryptjs";

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// A valid throwaway hash (random secret, cost 12) used to spend the same bcrypt
// time when an account does not exist, so sign-in latency can't reveal whether
// an email is registered. Computed once at startup; the plaintext is never used.
const DUMMY_HASH = bcrypt.hashSync(bcrypt.genSaltSync(4) + "::timing", 12);

/** Run an equivalent bcrypt comparison for the no-such-user path. Always false. */
export async function dummyVerify(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}
