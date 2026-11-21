import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderHistory from "@/components/marketplace/OrderHistory";

export const dynamic = "force-dynamic";
export default async function MyOrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/login");
  return <OrderHistory />;
}
