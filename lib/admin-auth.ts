import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ADMIN_SESSION_COOKIE,
  isValidAdminSession,
} from "@/lib/admin-session";

export type AdminCapability =
  | "games.create"
  | "games.manage"
  | "players.ratings"
  | "players.stats"
  | "tournaments.manage"
  | "venues.manage"
  | "finance.view"
  | "reports.review";

export async function authorizeAdmin(
  requiredCapability?: AdminCapability,
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  const session = isValidAdminSession(token);

  if (!session) {
    return {
      ok: false as const,
      status: 401,
      error: "Admin login required.",
    };
  }

  const admin = createAdminClient();

  // Check that the account is still an administrator.
  const { data: role, error: roleError } = await admin
    .from("profile_roles")
    .select("role")
    .eq("profile_id", session.userId)
    .eq("role", "ADMIN")
    .maybeSingle();

  if (roleError || !role) {
    return {
      ok: false as const,
      status: 403,
      error: "Administrator access has been revoked.",
    };
  }

  // Check the specific permission required by this operation.
  if (requiredCapability) {
    const { data: permission, error: permissionError } =
      await admin
        .from("admin_permissions")
        .select("capability")
        .eq("profile_id", session.userId)
        .eq("capability", requiredCapability)
        .maybeSingle();

    if (permissionError || !permission) {
      return {
        ok: false as const,
        status: 403,
        error: "You do not have permission for this operation.",
      };
    }
  }

  return {
    ok: true as const,
    userId: session.userId,
    admin,
  };
}
