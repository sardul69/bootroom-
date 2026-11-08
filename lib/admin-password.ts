import "server-only";
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashAdminPassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    throw new Error("Admin password must be 12–128 characters.");
  }

  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyAdminPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const [algorithm, salt, hash] = stored.split("$");

    if (
      algorithm !== "scrypt" ||
      !/^[a-f0-9]{32}$/.test(salt) ||
      !/^[a-f0-9]{128}$/.test(hash) ||
      password.length > 128
    ) {
      return false;
    }

    const expected = Buffer.from(hash, "hex");
    const actual = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
