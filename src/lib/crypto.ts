/**
 * Password and token primitives. Deliberately free of "server-only" so
 * scripts (seeding, migrations, CLI tooling) can use them — it holds no
 * request state and reads no cookies.
 */
import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/** scrypt with a per-password salt. Format: scrypt$<salt hex>$<key hex>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Opaque, high-entropy, URL-safe. Only ever stored hashed. */
export const newToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
