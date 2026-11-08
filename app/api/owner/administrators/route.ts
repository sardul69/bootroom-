import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidOwnerSession,
  OWNER_SESSION_COOKIE,
} from "@/lib/owner-session";
import { hashAdminPassword } from "@/lib/admin-password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: HEADERS,
  });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return false;

  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.host === host
    );
  } catch {
    return false;
  }
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

async function authorize(request: NextRequest) {
  if (request.method !== "GET" && !sameOrigin(request)) {
    return { response: json({ error: "Request rejected." }, 403) };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { response: json({ error: "Please sign in again." }, 401) };
  }

  const { data: isOwner, error: ownerError } =
    await supabase.rpc("current_user_is_owner");

  if (ownerError || isOwner !== true) {
    return {
      response: json({ error: "Owner privileges required." }, 403),
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;

  if (!isValidOwnerSession(token, user.id)) {
    return {
      response: json({ error: "Unlock the Owner Console first." }, 401),
    };
  }

  return { user, supabase };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;

    const admin = createAdminClient();
    const accounts: Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      created_at: string;
    }> = [];

    const pageSize = 1000;

    for (let page = 1; ; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: pageSize,
      });

      if (error) {
        console.error("Administrator account listing failed:", error);
        return json({ error: "Unable to load registered accounts." }, 500);
      }

      const users = data.users ?? [];

      accounts.push(
        ...users.map((user) => ({
          id: user.id,
          email: user.email ?? null,
          full_name:
            typeof user.user_metadata?.full_name === "string"
              ? user.user_metadata.full_name
              : null,
          created_at: user.created_at,
        }))
      );

      if (users.length < pageSize) break;
    }

    const administratorIds = new Set<string>();
    const ownerIds = new Set<string>();

    for (let i = 0; i < accounts.length; i += 500) {
      const ids = accounts.slice(i, i + 500).map((account) => account.id);

      if (ids.length === 0) continue;

      const { data: roles, error } = await admin
        .from("profile_roles")
        .select("profile_id,role")
        .in("profile_id", ids);

      if (error) {
        console.error("Account role lookup failed:", error);
        return json({ error: "Unable to load account permissions." }, 500);
      }

      for (const role of roles ?? []) {
        if (role.role === "ADMIN") administratorIds.add(role.profile_id);
        if (role.role === "OWNER") ownerIds.add(role.profile_id);
      }
    }

    return json({
      accounts: accounts.map((account) => ({
        ...account,
        is_admin: administratorIds.has(account.id),
        is_owner: ownerIds.has(account.id),
      })),
    });
  } catch (error) {
    console.error("Administrator listing failed:", error);
    return json({ error: "Unable to load administrator accounts." }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Unsupported request format." }, 415);
    }

    const contentLength = Number(
      request.headers.get("content-length") ?? "0"
    );

    if (Number.isFinite(contentLength) && contentLength > 4096) {
      return json({ error: "Request too large." }, 413);
    }

    const body = await request.json().catch(() => null);

    const profileId = body?.profileId;
    const password =
      typeof body?.password === "string" ? body.password : "";
    const confirmPassword =
      typeof body?.confirmPassword === "string"
        ? body.confirmPassword
        : "";

    if (!validUuid(profileId)) {
      return json({ error: "Select a valid registered account." }, 400);
    }

    if (profileId === auth.user.id) {
      return json({ error: "You cannot promote your own account." }, 400);
    }

    if (!password || password !== confirmPassword) {
      return json({ error: "The passwords do not match." }, 400);
    }

    let passwordHash: string;

    try {
      passwordHash = await hashAdminPassword(password);
    } catch (error) {
      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid administrator password.",
        },
        400
      );
    }

    const { error } = await auth.supabase.rpc("owner_promote_admin", {
      p_profile_id: profileId,
      p_password_hash: passwordHash,
    });

    if (error) {
      console.error("Administrator promotion failed:", error);
      return json(
        { error: "Unable to promote this account. " + error.message },
        400
      );
    }

    return json({ ok: true });
  } catch (error) {
    console.error("Administrator promotion failed:", error);
    return json({ error: "Unable to promote this account." }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("response" in auth) return auth.response;

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Unsupported request format." }, 415);
    }

    const body = await request.json().catch(() => null);
    const profileId = body?.profileId;

    if (!validUuid(profileId) || profileId === auth.user.id) {
      return json({ error: "Invalid administrator account." }, 400);
    }

    const { error } = await auth.supabase.rpc("owner_revoke_admin", {
      p_profile_id: profileId,
    });

    if (error) {
      console.error("Administrator revocation failed:", error);
      return json(
        { error: "Unable to revoke administrator access. " + error.message },
        400
      );
    }

    return json({ ok: true });
  } catch (error) {
    console.error("Administrator revocation failed:", error);
    return json({ error: "Unable to revoke administrator access." }, 500);
  }
}
