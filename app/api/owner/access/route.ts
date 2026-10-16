import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createClient } from "@/lib/supabase/server";
import {
  issueOwnerSession,
  OWNER_SESSION_COOKIE,
} from "@/lib/owner-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(
  body: { ok?: boolean; error?: string },
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function constantTimeMatch(
  input: string,
  expected: string,
): boolean {
  const inputBuffer = Buffer.from(input, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    inputBuffer.length === expectedBuffer.length &&
    timingSafeEqual(inputBuffer, expectedBuffer)
  );
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);

    return (
      (parsedOrigin.protocol === "https:" ||
        parsedOrigin.protocol === "http:") &&
      parsedOrigin.host === host
    );
  } catch {
    return false;
  }
}

function createOwnerRateLimiter() {
  const redis = Redis.fromEnv();

  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "bootroom:owner-unlock",
    analytics: false,
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      return jsonResponse(
        { error: "Request rejected." },
        403,
      );
    }

    const contentType =
      request.headers.get("content-type") ?? "";

    if (
      !contentType
        .toLowerCase()
        .includes("application/json")
    ) {
      return jsonResponse(
        { error: "Unsupported request format." },
        415,
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") ?? "0",
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > 4096
    ) {
      return jsonResponse(
        { error: "Request too large." },
        413,
      );
    }

    // Verify the authenticated BOOTROOM account first.
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonResponse(
        {
          error:
            "Sign in to your BOOTROOM account first.",
        },
        401,
      );
    }

    // Confirm that this authenticated account is an Owner.
    const {
      data: isOwner,
      error: ownerError,
    } = await supabase.rpc("current_user_is_owner");

    if (ownerError || isOwner !== true) {
      return jsonResponse(
        {
          error:
            "This account does not have Owner privileges.",
        },
        403,
      );
    }

    // Fail closed if the shared rate limiter is unavailable.
    let rateLimit;

    try {
      rateLimit = await createOwnerRateLimiter().limit(
        user.id,
      );
    } catch (error) {
      console.error(
        "Owner rate limiter unavailable:",
        error,
      );

      return jsonResponse(
        {
          error:
            "Owner access is temporarily unavailable. Please try again later.",
        },
        503,
      );
    }

    if (!rateLimit.success) {
      const retryAfter = Math.max(
        1,
        Math.ceil(
          (rateLimit.reset - Date.now()) / 1000,
        ),
      );

      const response = jsonResponse(
        {
          error:
            "Too many unlock attempts. Please wait before trying again.",
        },
        429,
      );

      response.headers.set(
        "Retry-After",
        String(retryAfter),
      );

      return response;
    }

    const expectedPassword =
      process.env.OWNER_CONSOLE_PASSWORD;

    if (
      !expectedPassword ||
      expectedPassword.length < 16
    ) {
      return jsonResponse(
        {
          error:
            "Owner access is not configured correctly.",
        },
        503,
      );
    }

    const body = await request
      .json()
      .catch(() => null);

    const password =
      typeof body?.password === "string"
        ? body.password
        : "";

    if (
      !password ||
      password.length > 512 ||
      !constantTimeMatch(password, expectedPassword)
    ) {
      return jsonResponse(
        {
          error:
            "Access denied. Check your password and try again.",
        },
        401,
      );
    }

    // Issue a signed, short-lived, HTTP-only session.
    const session = issueOwnerSession(user.id);

    const response = jsonResponse({ ok: true });

    response.cookies.set(
      OWNER_SESSION_COOKIE,
      session.token,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/owner",
        maxAge: session.maxAge,
      },
    );

    return response;
  } catch (error) {
    console.error("Owner access failed:", error);

    return jsonResponse(
      {
        error:
          "Unable to unlock Owner Console. Check server configuration.",
      },
      500,
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      return jsonResponse(
        { error: "Request rejected." },
        403,
      );
    }

    const response = jsonResponse({ ok: true });

    response.cookies.set(
      OWNER_SESSION_COOKIE,
      "",
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/owner",
        maxAge: 0,
      },
    );

    return response;
  } catch (error) {
    console.error("Owner logout failed:", error);

    return jsonResponse(
      { error: "Unable to lock Owner Console." },
      500,
    );
  }
}