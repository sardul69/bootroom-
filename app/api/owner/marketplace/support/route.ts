import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidOwnerSession, OWNER_SESSION_COOKIE } from "@/lib/owner-session";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function owner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc("current_user_is_owner");
  if (data !== true) return false;
  const jar = await cookies();
  const token = jar.get(OWNER_SESSION_COOKIE)?.value;
  return !!token && isValidOwnerSession(token, user.id);
}

export async function GET() {
  try {
    if (!(await owner())) return reply({ ok: false, error: "Owner access required." }, 403);
    const admin = createAdminClient();
    const { data: orders, error } = await admin.from("marketplace_orders")
      .select("id,order_number,customer_name,customer_email,status,fulfillment_status,created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    const ids = (orders ?? []).map(o => o.id);
    if (!ids.length) return reply({ ok: true, orders: [] });
    const { data: messages, error: msgError } = await admin.from("marketplace_order_messages")
      .select("id,order_id,author_role,message,created_at").in("order_id", ids)
      .order("created_at", { ascending: true });
    if (msgError) throw msgError;
    return reply({ ok: true, orders: (orders ?? []).map(o => ({
      ...o, messages: (messages ?? []).filter(m => m.order_id === o.id)
    })) });
  } catch (e) {
    console.error("Owner marketplace support:", e);
    return reply({ ok: false, error: "Unable to load support inbox." }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get("origin") || new URL(req.headers.get("origin")!).origin !== req.nextUrl.origin)
      return reply({ ok: false, error: "Invalid request origin." }, 403);
    if (!(await owner())) return reply({ ok: false, error: "Owner access required." }, 403);
    const body = await req.json();
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!UUID.test(orderId) || !message || message.length > 2000)
      return reply({ ok: false, error: "Enter a message of 1–2,000 characters." }, 400);

    const admin = createAdminClient();
    const { data: order, error: lookupError } = await admin.from("marketplace_orders")
      .select("id").eq("id", orderId).maybeSingle();
    if (lookupError || !order) return reply({ ok: false, error: "Order not found." }, 404);

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await admin.from("marketplace_order_messages").insert({
      order_id: orderId, author_user_id: user?.id ?? null, author_role: "STAFF", message
    });
    if (error) throw error;
    return reply({ ok: true });
  } catch (e) {
    console.error("Owner support reply:", e);
    return reply({ ok: false, error: "Reply could not be sent." }, 500);
  }
}
