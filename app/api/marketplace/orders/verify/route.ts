import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMarketplaceEmail } from "@/lib/marketplace-email";
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  verifyRazorpaySignature,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reply(error: string, status: number, paymentVerified = false) {
  return NextResponse.json(
    { ok: false, paymentVerified, orderConfirmed: false, error },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

async function sendPrivateOrderEmail(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string
): Promise<void> {
  const recipient = process.env.MARKETPLACE_ORDER_EMAIL?.trim();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!recipient || !apiKey || !from) {
    console.error("Marketplace email configuration is incomplete.");
    return;
  }

  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_marketplace_order_notification",
    { p_order_id: orderId }
  );

  if (claimError || claimed !== true) return;

  const { data: order, error: orderError } = await admin
    .from("marketplace_orders")
    .select("*")
    .eq("id", orderId)
    .eq("status", "PAID")
    .maybeSingle();

  const { data: items, error: itemsError } = await admin
    .from("marketplace_order_items")
    .select("product_name,selected_size,quantity,line_total_paise")
    .eq("order_id", orderId)
    .order("created_at");

  if (orderError || itemsError || !order || !items?.length) {
    console.error("Marketplace notification data could not be loaded.");
    return;
  }

  const rows = items.map((item) => `
    <tr>
      <td style="padding:13px;border-bottom:1px solid #303830;color:#f4f1e8">
        ${escapeHtml(item.product_name)}
        ${item.selected_size ? `<div style="color:#9da39c;font-size:12px">Size: ${escapeHtml(item.selected_size)}</div>` : ""}
      </td>
      <td style="padding:13px;text-align:center;border-bottom:1px solid #303830;color:#f4f1e8">${Number(item.quantity)}</td>
      <td style="padding:13px;text-align:right;border-bottom:1px solid #303830;color:#f4f1e8">₹${(Number(item.line_total_paise) / 100).toFixed(2)}</td>
    </tr>
  `).join("");

  const html = `
  <div style="background:#090b0a;padding:30px 12px;font-family:Arial,sans-serif;color:#f4f1e8">
    <div style="max-width:680px;margin:auto;background:#111512;border:1px solid #343a32">
      <div style="padding:28px;border-bottom:1px solid #343a32">
        <div style="font-size:12px;letter-spacing:4px;color:#c9a45b;font-weight:bold">BOOTROOM / MARKETPLACE</div>
        <h1 style="font-size:26px;margin:18px 0 6px;color:#fff">New order received</h1>
        <p style="color:#9da39c;font-size:13px">Razorpay payment verified and captured.</p>
      </div>
      <div style="padding:28px">
        <div style="color:#c9a45b;font-size:11px;letter-spacing:2px">ORDER REFERENCE</div>
        <div style="font-size:23px;font-weight:bold;margin:8px 0 25px">${escapeHtml(order.order_number)}</div>

        <h2 style="font-size:13px;letter-spacing:1px;color:#c9a45b">CUSTOMER</h2>
        <p style="line-height:1.8">
          <strong>${escapeHtml(order.customer_name)}</strong><br>
          ${escapeHtml(order.customer_phone)}<br>
          ${escapeHtml(order.customer_email)}
        </p>

        <h2 style="font-size:13px;letter-spacing:1px;color:#c9a45b;margin-top:25px">DELIVERY ADDRESS</h2>
        <p style="line-height:1.8">
          ${escapeHtml(order.delivery_address)}<br>
          ${escapeHtml(order.delivery_city)}, ${escapeHtml(order.delivery_state)}
          ${escapeHtml(order.delivery_postal_code)}<br>
          ${escapeHtml(order.delivery_country)}
        </p>
        ${order.delivery_note ? `<p style="color:#b7bcb5;font-size:13px">Note: ${escapeHtml(order.delivery_note)}</p>` : ""}

        <h2 style="font-size:13px;letter-spacing:1px;color:#c9a45b;margin-top:28px">ORDER ITEMS</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:12px">
          <thead><tr>
            <th style="text-align:left;padding:10px;color:#9da39c;font-size:11px">PRODUCT</th>
            <th style="text-align:center;padding:10px;color:#9da39c;font-size:11px">QTY</th>
            <th style="text-align:right;padding:10px;color:#9da39c;font-size:11px">TOTAL</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="margin-top:22px;padding-top:18px;border-top:1px solid #343a32;text-align:right">
          <div style="color:#9da39c;font-size:12px">Subtotal: ₹${(Number(order.subtotal_paise) / 100).toFixed(2)}</div>
          <div style="color:#9da39c;font-size:12px;margin-top:5px">Shipping: ₹${(Number(order.shipping_paise) / 100).toFixed(2)}</div>
          <div style="font-size:25px;color:#d5b36c;font-weight:bold;margin-top:12px">₹${(Number(order.total_paise) / 100).toFixed(2)}</div>
        </div>
        <p style="font-size:11px;color:#9da39c;margin-top:25px">Razorpay payment ID: ${escapeHtml(order.razorpay_payment_id)}</p>
      </div>
    </div>
  </div>`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const result = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: `BOOTROOM order ${order.order_number} — payment received`,
        html,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!result.ok) {
      console.error("Marketplace email delivery failed:", result.status);
      return;
    }

    const { error: sentError } = await admin.rpc(
      "mark_marketplace_order_notification_sent",
      { p_order_id: orderId }
    );

    if (sentError) {
      console.error("Email sent but notification state update failed:", sentError.message);
    }
  } catch (error) {
    console.error("Marketplace email request failed:", error instanceof Error ? error.message : "Unknown error");
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  let paymentVerified = false;

  try {
    if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return reply("Content-Type must be application/json.", 415);
    }

    const raw = await req.text();
    if (!raw || raw.length > 8000) return reply("Invalid request body.", 400);

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply("Invalid JSON.", 400);
    }

    if (
      !isRecord(body) ||
      typeof body.orderId !== "string" || !UUID.test(body.orderId) ||
      typeof body.razorpayOrderId !== "string" || !/^order_[A-Za-z0-9]+$/.test(body.razorpayOrderId) ||
      typeof body.razorpayPaymentId !== "string" || !/^pay_[A-Za-z0-9]+$/.test(body.razorpayPaymentId) ||
      typeof body.razorpaySignature !== "string" || !/^[a-f0-9]{64}$/i.test(body.razorpaySignature)
    ) {
      return reply("Invalid payment verification details.", 400);
    }

    let validSignature = false;
    try {
      validSignature = verifyRazorpaySignature(
        body.razorpayOrderId,
        body.razorpayPaymentId,
        body.razorpaySignature
      );
    } catch (error) {
      console.error("Razorpay configuration error:", error instanceof Error ? error.message : "Unknown error");
      return reply("Payment verification is temporarily unavailable.", 503);
    }

    if (!validSignature) return reply("Invalid payment signature.", 400);

    const admin = createAdminClient();
    const { data: order, error: lookupError } = await admin
      .from("marketplace_orders")
      .select("id,order_number,total_paise,currency,status,razorpay_order_id,razorpay_payment_id")
      .eq("id", body.orderId)
      .maybeSingle();

    if (lookupError || !order) {
      console.error("Marketplace order lookup failed:", lookupError?.message ?? "Not found");
      return reply("Order could not be found.", 404);
    }

    if (order.razorpay_order_id !== body.razorpayOrderId) {
      return reply("Payment does not match this order.", 409);
    }

    const amount = Number(order.total_paise);
    if (!Number.isSafeInteger(amount) || amount <= 0 || order.currency !== "INR") {
      return reply("Stored order amount is invalid.", 500);
    }

    let providerOrder;
    let providerPayment;

    try {
      [providerOrder, providerPayment] = await Promise.all([
        fetchRazorpayOrder(body.razorpayOrderId),
        fetchRazorpayPayment(body.razorpayPaymentId),
      ]);
    } catch (error) {
      console.error("Razorpay lookup failed:", error instanceof Error ? error.message : "Unknown error");
      return reply("Payment status could not be confirmed. Do not pay again; retry verification later.", 503);
    }

    const receipt = body.orderId.replace(/-/g, "");

    if (
      providerOrder.id !== body.razorpayOrderId ||
      providerOrder.receipt !== receipt ||
      providerOrder.amount !== amount ||
      providerOrder.currency !== "INR" ||
      providerPayment.id !== body.razorpayPaymentId ||
      providerPayment.order_id !== body.razorpayOrderId ||
      providerPayment.amount !== amount ||
      providerPayment.currency !== "INR" ||
      providerPayment.status !== "captured" ||
      providerPayment.captured !== true
    ) {
      return reply("Razorpay has not confirmed this payment as captured.", 409);
    }

    paymentVerified = true;

    if (order.status === "PAID" && order.razorpay_payment_id !== body.razorpayPaymentId) {
      return reply("Payment record conflict. Contact support; do not pay again.", 409, true);
    }

    const { data: finalized, error: finalizeError } = await admin.rpc(
      "finalize_marketplace_order_payment",
      {
        p_order_id: body.orderId,
        p_razorpay_order_id: body.razorpayOrderId,
        p_razorpay_payment_id: body.razorpayPaymentId,
        p_razorpay_signature: body.razorpaySignature,
      }
    );

    if (finalizeError || !isRecord(finalized) || finalized.ok !== true) {
      console.error("Marketplace finalization failed:", finalizeError?.message ?? (isRecord(finalized) ? String(finalized.reason) : "Invalid RPC response"));

      return reply(
        isRecord(finalized) && finalized.reason === "STOCK_RECONCILIATION_REQUIRED"
          ? "Payment was captured, but stock needs manual reconciliation. Do not pay again; contact BOOTROOM."
          : "Payment was verified, but order confirmation is pending. Do not pay again; contact BOOTROOM.",
        409,
        true
      );
    }

    const { data: confirmed, error: confirmError } = await admin
      .from("marketplace_orders")
      .select("id,order_number,status,razorpay_payment_id,total_paise,customer_email")
      .eq("id", body.orderId)
      .maybeSingle();

    if (
      confirmError || !confirmed ||
      confirmed.status !== "PAID" ||
      confirmed.razorpay_payment_id !== body.razorpayPaymentId
    ) {
      console.error("Marketplace confirmation check failed:", confirmError?.message ?? "Order not confirmed");
      return reply("Payment was verified, but order confirmation is pending. Do not pay again; contact BOOTROOM.", 500, true);
    }

    await sendPrivateOrderEmail(admin, body.orderId);

    if (typeof confirmed.customer_email === "string" && confirmed.customer_email.includes("@")) {
      await sendMarketplaceEmail({
        to: confirmed.customer_email,
        subject: `BOOTROOM order ${confirmed.order_number} confirmed`,
        heading: "Your order is confirmed.",
        message: "Your payment has been successfully verified. BOOTROOM has received your order and will update you when it is dispatched.",
        orderNumber: confirmed.order_number,
        idempotencyKey: `marketplace-paid-${confirmed.id}`,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        paymentVerified: true,
        orderConfirmed: true,
        orderId: confirmed.id,
        orderNumber: confirmed.order_number,
        amount: Number(confirmed.total_paise),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Marketplace verification failed:", error instanceof Error ? error.message : "Unknown error");
    return reply(
      paymentVerified
        ? "Payment was verified, but order confirmation is pending. Do not pay again; contact BOOTROOM."
        : "Unable to verify payment. Do not pay again until the status is checked.",
      500,
      paymentVerified
    );
  }
}
