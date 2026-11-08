import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAdminPassword } from "@/lib/admin-password";
import {
  issueAdminSession,
  ADMIN_SESSION_COOKIE,
} from "@/lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function response(
  body: { ok?: boolean; error?: string },
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: HEADERS,
  });
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return false;

  try {
    const parsed = new URL(origin);

    return (
      (parsed.protocol === "https:" ||
        parsed.protocol === "http:") &&
      parsed.host === host
    );
  } catch {
    return false;
  }
}

function createLimiter(prefix: string) {
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix,
    analytics: false,
  });
}

async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
) {
  const perPage = 1000;

  for (let page = 1; page <= 100; page++) {
    const { data, error } =
      await admin.auth.admin.listUsers({
        page,
        perPage,
      });

    if (error) throw error;

    const user = data.users.find(
      (item) => item.email?.toLowerCase() === email,
    );

    if (user) return user;

    if (data.users.length < perPage) break;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) {
      return response({ error: "Request rejected." }, 403);
    }

    const contentType =
      request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return response(
        { error: "Unsupported request format." },
        415,
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") ?? "0",
    );

    if (Number.isFinite(contentLength) && contentLength > 4096) {
      return response({ error: "Request too large." }, 413);
    }

    const body = await request.json().catch(() => null);

    const email =
      typeof body?.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body?.password === "string"
        ? body.password
        : "";

    if (
      !email ||
      email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !password ||
      password.length > 128
    ) {
      return response(
        { error: "Invalid email or password." },
        400,
      );
    }

    const ip =
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";

    let ipLimit;
    let emailLimit;

    try {
      const redis = Redis.fromEnv();

      const ipLimiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(10, "15 m"),
        prefix: "turfzy:admin-login:ip",
        analytics: false,
      });

      const emailLimiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(5, "15 m"),
        prefix: "turfzy:admin-login:email",
        analytics: false,
      });

      [ipLimit, emailLimit] = await Promise.all([
        ipLimiter.limit(ip),
        emailLimiter.limit(email),
      ]);
    } catch (error) {
      console.error("Admin rate limiter unavailable:", error);

      return response(
        { error: "Admin login is temporarily unavailable." },
        503,
      );
    }

    if (!ipLimit.success || !emailLimit.success) {
      const reset = Math.max(
        ipLimit.reset,
        emailLimit.reset,
      );

      const result = response(
        { error: "Too many attempts. Please try again later." },
        429,
      );

      result.headers.set(
        "Retry-After",
        String(Math.max(1, Math.ceil((reset - Date.now()) / 1000))),
      );

      return result;
    }

    const admin = createAdminClient();

    const user = await findAuthUserByEmail(admin, email);

    if (!user) {
      return response({ error: "Invalid email or password." }, 401);
    }

    const { data: role, error: roleError } = await admin
      .from("profile_roles")
      .select("role")
      .eq("profile_id", user.id)
      .eq("role", "ADMIN")
      .maybeSingle();

    if (roleError || !role) {
      return response({ error: "Invalid email or password." }, 401);
    }

    const { data: credential, error: credentialError } =
      await admin
        .from("admin_credentials")
        .select("password_hash")
        .eq("profile_id", user.id)
        .maybeSingle();

    if (
      credentialError ||
      !credential ||
      !(await verifyAdminPassword(
        password,
        credential.password_hash,
      ))
    ) {
      return response({ error: "Invalid email or password." }, 401);
    }

    const session = issueAdminSession(user.id);

    const result = response({ ok: true });

    result.cookies.set(
      ADMIN_SESSION_COOKIE,
      session.token,
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: session.maxAge,
      },
    );

    return result;
  } catch (error) {
    console.error("Admin login failed:", error);

    return response(
      { error: "Unable to log in. Please try again later." },
      500,
    );
  }
}
