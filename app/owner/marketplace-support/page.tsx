import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isValidOwnerSession, OWNER_SESSION_COOKIE } from "@/lib/owner-session";
import OrderHistory from "@/components/marketplace/OrderHistory";

export const dynamic = "force-dynamic";
export default async function MarketplaceSupportPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isOwner } = await supabase.rpc("current_user_is_owner");
  const jar = await cookies();
  const token = jar.get(OWNER_SESSION_COOKIE)?.value;
  if (isOwner !== true || !token || !isValidOwnerSession(token, user.id)) redirect("/owner");
  return <OrderHistory owner />;
}
