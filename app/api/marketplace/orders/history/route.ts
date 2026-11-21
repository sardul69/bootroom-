import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function customer() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email || !user.email_confirmed_at) return null;
  return { user, email: user.email.toLowerCase() };
}

export async function GET() {
  try {
    const auth = await customer();
    if (!auth) return reply({ ok: false, error: "Sign in with your verified checkout email to view orders." }, 401);

    const admin = createAdminClient();
    const { data: orders, error } = await admin.from("marketplace_orders")
      .select("id,order_number,customer_email,subtotal_paise,shipping_paise,total_paise,currency,status,created_at,paid_at,fulfillment_status,shipping_carrier,tracking_number,shipped_at,delivered_at")
      .eq("customer_email", auth.email).order("created_at", { ascending: false }).limit(100);

    if (error) throw error;
    const ids = (orders ?? []).map(o => o.id);
    if (!ids.length) return reply({ ok: true, orders: [] });

    const [{ data: items, error: itemError }, { data: messages, error: messageError }] = await Promise.all([
      admin.from("marketplace_order_items").select("id,order_id,product_name,product_image_url,selected_size,quantity,unit_price_paise,line_total_paise").in("order_id", ids),
      admin.from("marketplace_order_messages").select("id,order_id,author_role,message,created_at").in("order_id", ids).order("created_at", { ascending: true })
    ]);
    if (itemError || messageError) throw itemError ?? messageError;

    return reply({ ok: true, orders: (orders ?? []).map(o => ({
      ...o, items: (items ?? []).filter(i => i.order_id === o.id),
      messages: (messages ?? []).filter(m => m.order_id === o.id)
    })) });
  } catch (e) {
    console.error("Marketplace history:", e);
    return reply({ ok: false, error: "Unable to load your orders." }, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get("origin") || new URL(req.headers.get("origin")!).origin !== req.nextUrl.origin)
      return reply({ ok: false, error: "Invalid request origin." }, 403);

    const auth = await customer();
    if (!auth) return reply({ ok: false, error: "Sign in with your verified checkout email first." }, 401);

    const body = await req.json();
    const orderId = typeof body.orderId === "string" ? body.orderId : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!UUID.test(orderId) || !message || message.length > 2000)
      return reply({ ok: false, error: "Enter a message of 1–2,000 characters." }, 400);

    const admin = createAdminClient();
    const { data: order, error: lookupError } = await admin.from("marketplace_orders")
      .select("id").eq("id", orderId).eq("customer_email", auth.email).maybeSingle();
    if (lookupError || !order) return reply({ ok: false, error: "Order not found." }, 404);

    const { error } = await admin.from("marketplace_order_messages").insert({
      order_id: orderId, author_user_id: auth.user.id, author_role: "CUSTOMER", message
    });
    if (error) throw error;
    return reply({ ok: true });
  } catch (e) {
    console.error("Marketplace customer message:", e);
    return reply({ ok: false, error: "Message could not be sent." }, 500);
  }
}
