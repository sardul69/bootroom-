import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isValidOwnerSession,
  OWNER_SESSION_COOKIE,
} from "@/lib/owner-session";
import OwnerConsole from "./OwnerConsole";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Royal Owner Console | BOOTROOM",
  description: "Private BOOTROOM Owner Command Centre.",
};

export default async function OwnerPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const {
    data: isOwner,
    error,
  } = await supabase.rpc("current_user_is_owner");

  if (error || isOwner !== true) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const token =
    cookieStore.get(OWNER_SESSION_COOKIE)?.value;

  if (!isValidOwnerSession(token, user.id)) {
    redirect("/owner/unlock");
  }

  return (
    <OwnerConsole
      email={user.email ?? "Verified Owner"}
    />
  );
}