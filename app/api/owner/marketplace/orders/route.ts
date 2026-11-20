import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMarketplaceEmail } from "@/lib/marketplace-email";
import { isValidOwnerSession, OWNER_SESSION_COOKIE } from "@/lib/owner-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return response({ ok: false, error: "Authentication required." }, 401);
    }

    const { data: isOwner, error: ownerError } = await supabase.rpc(
      "current_user_is_owner"
    );

    if (ownerError || isOwner !== true) {
      return response({ ok: false, error: "Owner access required." }, 403);
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;

    if (!token || !isValidOwnerSession(token, user.id)) {
      return response({ ok: false, error: "Owner session expired." }, 401);
    }

    const admin = createAdminClient();
    const search = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
    const status = request.nextUrl.searchParams.get("status")?.trim() ?? "ALL";

    const allowedStatuses = [
      "ALL",
      "PENDING",
      "PAID",
      "EXPIRED",
      "RECONCILIATION_REQUIRED",
    ];

    if (!allowedStatuses.includes(status)) {
      return response({ ok: false, error: "Invalid status filter." }, 400);
    }

    let query = admin
      .from("marketplace_orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (status !== "ALL") query = query.eq("status", status);

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ").trim();

      if (safeSearch) {
        query = query.or(
          `order_number.ilike.%${safeSearch}%,customer_name.ilike.%${safeSearch}%,customer_email.ilike.%${safeSearch}%`
        );
      }
    }

    const { data: orders, error: ordersError } = await query;

    if (ordersError) {
      console.error("Owner marketplace order query failed:", ordersError.message);
      return response({ ok: false, error: "Could not load marketplace orders." }, 500);
    }

    const orderIds = (orders ?? [])
      .map((order) => order.id)
      .filter((id): id is string => typeof id === "string");

    let items: Record<string, unknown>[] = [];

    if (orderIds.length) {
      const { data, error } = await admin
        .from("marketplace_order_items")
        .select("*")
        .in("order_id", orderIds);

      if (error) {
        console.error("Owner marketplace item query failed:", error.message);
        return response({ ok: false, error: "Could not load order items." }, 500);
      }

      items = (data ?? []) as Record<string, unknown>[];
    }

    const itemsByOrder = new Map<string, Record<string, unknown>[]>();

    for (const item of items) {
      const orderId = String(item.order_id ?? "");
      const current = itemsByOrder.get(orderId) ?? [];
      current.push(item);
      itemsByOrder.set(orderId, current);
    }

    return response({
      ok: true,
      orders: (orders ?? []).map((order) => ({
        ...order,
        items: itemsByOrder.get(String(order.id)) ?? [],
      })),
    });
  } catch (error) {
    console.error(
      "Owner marketplace orders API failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return response({ ok: false, error: "Unable to load orders." }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");

    if (!origin || new URL(origin).origin !== request.nextUrl.origin) {
      return response({ ok: false, error: "Invalid request origin." }, 403);
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return response({ ok: false, error: "Authentication required." }, 401);
    }

    const { data: isOwner, error: ownerError } = await supabase.rpc(
      "current_user_is_owner"
    );

    if (ownerError || isOwner !== true) {
      return response({ ok: false, error: "Owner access required." }, 403);
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;

    if (!token || !isValidOwnerSession(token, user.id)) {
      return response({ ok: false, error: "Owner session expired." }, 401);
    }

    const body: unknown = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return response({ ok: false, error: "Invalid request." }, 400);
    }

    const input = body as Record<string, unknown>;
    const orderId = input.orderId;
    const nextStatus = input.nextStatus;
    const carrier = input.carrier;
    const trackingNumber = input.trackingNumber;

    if (
      typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
      typeof nextStatus !== "string" ||
      !["PROCESSING", "SHIPPED", "DELIVERED"].includes(nextStatus) ||
      (carrier !== undefined && typeof carrier !== "string") ||
      (trackingNumber !== undefined && typeof trackingNumber !== "string")
    ) {
      return response({ ok: false, error: "Invalid fulfilment details." }, 400);
    }

    if (
      (typeof carrier === "string" && carrier.length > 100) ||
      (typeof trackingNumber === "string" && trackingNumber.length > 150)
    ) {
      return response({ ok: false, error: "Shipping details are too long." }, 400);
    }

    const admin = createAdminClient();

    const { data, error } = await admin.rpc(
      "update_marketplace_fulfillment",
      {
        p_order_id: orderId,
        p_next_status: nextStatus,
        p_shipping_carrier: typeof carrier === "string" ? carrier.trim() : null,
        p_tracking_number:
          typeof trackingNumber === "string" ? trackingNumber.trim() : null,
      }
    );

    if (error) {
      console.error("Marketplace fulfilment update failed:", error.message);
      return response({ ok: false, error: "Could not update fulfilment." }, 500);
    }

    if (!data || data.ok !== true) {
      const reason = typeof data?.reason === "string" ? data.reason : "UNKNOWN";

      const messages: Record<string, string> = {
        ORDER_NOT_FOUND: "Order not found.",
        ORDER_NOT_PAID: "Only paid orders can be fulfilled.",
        INVALID_TRANSITION: "This fulfilment transition is not allowed.",
        SHIPPING_DETAILS_REQUIRED: "Enter the courier and tracking number first.",
        INVALID_INPUT: "Invalid fulfilment request.",
      };

      return response(
        { ok: false, error: messages[reason] ?? "Fulfilment update rejected." },
        409
      );
    }

    const alreadyUpdated = data.already_updated === true;

    // Notify the customer only after a newly confirmed database transition.
    if (!alreadyUpdated && (data.status === "SHIPPED" || data.status === "DELIVERED")) {
      const { data: order, error: orderError } = await admin
        .from("marketplace_orders")
        .select("id,order_number,customer_email")
        .eq("id", orderId)
        .maybeSingle();

      if (orderError) {
        console.error("Could not load customer fulfilment email details:", orderError.message);
      } else if (
        order &&
        typeof order.customer_email === "string" &&
        order.customer_email.includes("@")
      ) {
        const shipped = data.status === "SHIPPED";

        await sendMarketplaceEmail({
          to: order.customer_email,
          subject: shipped
            ? `BOOTROOM order ${order.order_number} dispatched`
            : `BOOTROOM order ${order.order_number} delivered`,
          heading: shipped ? "Your order is on its way." : "Your order has been delivered.",
          message: shipped
            ? `Your BOOTROOM order has been dispatched${typeof carrier === "string" && carrier.trim() ? ` through ${carrier.trim()}` : ""}. Use the tracking details below to follow your shipment.`
            : "Your BOOTROOM order has been marked as delivered. Thank you for shopping with us.",
          orderNumber: order.order_number,
          idempotencyKey: `marketplace-${shipped ? "shipped" : "delivered"}-${order.id}`,
          ...(shipped && typeof trackingNumber === "string" && trackingNumber.trim()
            ? { tracking: trackingNumber.trim() }
            : {}),
        });
      }
    }

    return response({
      ok: true,
      status: data.status,
      alreadyUpdated,
    });
  } catch (error) {
    console.error(
      "Marketplace fulfilment API failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return response({ ok: false, error: "Unable to update fulfilment." }, 500);
  }
}
