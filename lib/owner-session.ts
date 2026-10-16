import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const OWNER_SESSION_COOKIE = "bootroom_owner_session";

const SESSION_SECONDS = 30 * 60;

function signingSecret(): string {
  const secret = process.env.OWNER_CONSOLE_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "OWNER_CONSOLE_SESSION_SECRET must be at least 32 characters."
    );
  }

  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url");
}

export function issueOwnerSession(userId: string) {
  const expiresAt =
    Math.floor(Date.now() / 1000) + SESSION_SECONDS;

  const payload = `${userId}.${expiresAt}`;

  return {
    token: `${payload}.${sign(payload)}`,
    maxAge: SESSION_SECONDS,
  };
}

export function isValidOwnerSession(
  token: string | undefined,
  userId: string
): boolean {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [subject, expiryText, signature] = parts;

  if (subject !== userId || !/^\d{10,}$/.test(expiryText)) {
    return false;
  }

  const expiry = Number(expiryText);

  if (
    !Number.isSafeInteger(expiry) ||
    expiry <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  try {
    const expected = Buffer.from(
      sign(`${subject}.${expiryText}`)
    );
    const actual = Buffer.from(signature);

    return (
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}