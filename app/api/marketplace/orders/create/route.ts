import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(error: string, status: number) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= max ? result : null;
}

export async function POST(req: Request) {
  try {
    // Verify request origin when the browser supplies one.
    const origin = req.headers.get("origin");

    if (origin) {
      try {
        if (new URL(origin).origin !== new URL(req.url).origin) {
          return reply("Invalid request origin.", 403);
        }
      } catch {
        return reply("Invalid request origin.", 403);
      }
    }

    if (
      !(req.headers.get("content-type") ?? "")
        .toLowerCase()
        .includes("application/json")
    ) {
      return reply("Content-Type must be application/json.", 415);
    }

    // Payment configuration must be available before reserving inventory.
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      console.error("Marketplace checkout unavailable: Razorpay credentials missing.");
      return reply(
        "Payment checkout is temporarily unavailable. Please try again later.",
        503
      );
    }

    const raw = await req.text();

    if (!raw || raw.length > 20000) {
      return reply("Invalid request body.", 400);
    }

    let body: unknown;

    try {
      body = JSON.parse(raw);
    } catch {
      return reply("Invalid JSON.", 400);
    }

    if (
      !record(body) ||
      !record(body.customer) ||
      !record(body.delivery) ||
      !Array.isArray(body.items)
    ) {
      return reply("Incomplete checkout details.", 400);
    }

    const name = field(body.customer.name, 100);
    const email = field(body.customer.email, 254)?.toLowerCase();
    const phone = field(body.customer.phone, 20);
    const address = field(body.delivery.address, 500);
    const city = field(body.delivery.city, 100);
    const state = field(body.delivery.state, 100);
    const postalCode = field(body.delivery.postalCode, 20);

    const note =
      typeof body.delivery.note === "string"
        ? body.delivery.note.trim().slice(0, 500)
        : "";

    if (
      !name ||
      name.length < 2 ||
      !email ||
      !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email) ||
      !phone ||
      !/^[+0-9()\-\s]{7,20}$/.test(phone) ||
      !address ||
      address.length < 5 ||
      !city ||
      city.length < 2 ||
      !state ||
      state.length < 2 ||
      !postalCode ||
      postalCode.length < 3
    ) {
      return reply("Please check your contact and delivery details.", 400);
    }

    if (body.items.length < 1 || body.items.length > 20) {
      return reply("Your cart must contain between 1 and 20 items.", 400);
    }

    const items: {
      productId: string;
      quantity: number;
      size: string;
    }[] = [];

    const seen = new Set<string>();

    for (const item of body.items) {
      if (
        !record(item) ||
        typeof item.productId !== "string" ||
        !UUID.test(item.productId)
      ) {
        return reply("A cart item is invalid.", 400);
      }

      if (
        !Number.isInteger(item.quantity) ||
        Number(item.quantity) < 1 ||
        Number(item.quantity) > 10
      ) {
        return reply(
          "Each item quantity must be between 1 and 10.",
          400
        );
      }

      const size =
        typeof item.size === "string"
          ? item.size.trim().slice(0, 40)
          : "";

      const cartKey = `${item.productId}:${size}`;

      if (seen.has(cartKey)) {
        return reply(
          "Please combine duplicate products of the same size in your cart.",
          400
        );
      }

      seen.add(cartKey);

      items.push({
        productId: item.productId,
        quantity: Number(item.quantity),
        size,
      });
    }

    const admin = createAdminClient();

    const orderNumber =
      `BR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

    // Reserve inventory atomically through the database RPC.
    const { data: created, error: createError } = await admin.rpc(
      "create_marketplace_order",
      {
        p_order_number: orderNumber,
        p_customer_name: name,
        p_customer_email: email,
        p_customer_phone: phone,
        p_delivery_address: address,
        p_delivery_city: city,
        p_delivery_state: state,
        p_delivery_postal_code: postalCode,
        p_delivery_note: note,
        p_items: items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          size: item.size,
        })),
      }
    );

    if (createError || !record(created) || created.ok !== true) {
      console.error(
        "Marketplace order creation failed:",
        createError?.message ?? "Invalid RPC response"
      );

      return reply(
        createError?.message?.includes("Insufficient stock")
          ? "One or more items no longer have enough stock. Refresh your cart."
          : "We could not reserve your items. Please refresh and try again.",
        409
      );
    }

    const orderId =
      typeof created.order_id === "string" ? created.order_id : "";

    const amount = Number(created.total_paise);
    const receipt = orderId.replace(/-/g, "");

    if (
      !UUID.test(orderId) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      receipt.length > 40
    ) {
      console.error("Marketplace order RPC returned invalid data.");

      return reply(
        "Order could not be prepared safely. Contact support.",
        500
      );
    }

    // Create the corresponding Razorpay order.
    let razorpayOrder;

    try {
      razorpayOrder = await createRazorpayOrder({
        amount,
        receipt,
        notes: {
          marketplace_order_id: orderId,
          marketplace_order_number: orderNumber,
        },
      });
    } catch (error) {
      console.error(
        "Marketplace Razorpay creation failed:",
        error instanceof Error ? error.message : "Unknown error"
      );

      return reply(
        "Payment checkout is temporarily unavailable. Your reservation will expire automatically.",
        503
      );
    }

    // Never attach an unverified Razorpay order to our database order.
    if (
      razorpayOrder.amount !== amount ||
      razorpayOrder.currency !== "INR" ||
      razorpayOrder.receipt !== receipt
    ) {
      console.error("Marketplace Razorpay order validation failed.");

      return reply(
        "Payment order could not be validated. Contact support.",
        502
      );
    }

    const { data: attached, error: attachError } = await admin.rpc(
      "attach_marketplace_razorpay_order",
      {
        p_order_id: orderId,
        p_razorpay_order_id: razorpayOrder.id,
      }
    );

    if (attachError || attached !== true) {
      console.error(
        "Marketplace order attachment failed:",
        attachError?.message ?? "Order state changed"
      );

      return reply(
        "Payment order needs reconciliation. Do not retry payment; contact support.",
        409
      );
    }

    return NextResponse.json(
      {
        ok: true,
        orderId,
        orderNumber,
        amount,
        currency: "INR",
        keyId,
        razorpayOrderId: razorpayOrder.id,
        customer: { name, email, phone },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "Marketplace create-order failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return reply("Unable to start checkout. Please try again.", 500);
  }
}
