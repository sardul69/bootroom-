import "server-only";
import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const ADMIN_SESSION_COOKIE = "turfzy_admin_session";

const SESSION_SECONDS = 8 * 60 * 60;

function signingSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "ADMIN_SESSION_SECRET must be at least 32 characters."
    );
  }

  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret())
    .update(payload)
    .digest("base64url");
}

export function issueAdminSession(userId: string) {
  const expiresAt =
    Math.floor(Date.now() / 1000) + SESSION_SECONDS;

  const nonce = randomBytes(16).toString("hex");
  const payload = `${userId}.${expiresAt}.${nonce}`;

  return {
    token: `${payload}.${sign(payload)}`,
    maxAge: SESSION_SECONDS,
  };
}

export function isValidAdminSession(
  token: string | undefined
): { userId: string } | null {
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;

  const [userId, expiryText, nonce, signature] = parts;

  if (
    !/^[0-9a-f-]{36}$/i.test(userId) ||
    !/^\d{10,}$/.test(expiryText) ||
    !/^[a-f0-9]{32}$/.test(nonce)
  ) {
    return null;
  }

  const expiry = Number(expiryText);

  if (
    !Number.isSafeInteger(expiry) ||
    expiry <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  try {
    const expected = Buffer.from(
      sign(`${userId}.${expiryText}.${nonce}`)
    );
    const actual = Buffer.from(signature);

    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }

    return { userId };
  } catch {
    return null;
  }
}
