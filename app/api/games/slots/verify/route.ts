import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyRazorpaySignature,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function respond(
  error: string,
  status: number,
  paymentVerified = false
) {
  return NextResponse.json(
    {
      ok: false,
      paymentVerified,
      bookingConfirmed: false,
      error,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let paymentVerified = false;

  try {
    const auth = await createClient();
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();

    if (authError || !user) {
      return respond("Please sign in first.", 401);
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return respond("Content-Type must be application/json.", 415);
    }

    const raw = await req.text();
    if (!raw || raw.length > 10000) {
      return respond("Invalid request body.", 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return respond("Invalid JSON.", 400);
    }

    if (!isRecord(body)) {
      return respond("Invalid payment details.", 400);
    }

    const {
      batchId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = body;

    if (
      typeof batchId !== "string" ||
      !UUID.test(batchId) ||
      typeof razorpayOrderId !== "string" ||
      !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId) ||
      typeof razorpayPaymentId !== "string" ||
      !/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId) ||
      typeof razorpaySignature !== "string" ||
      !/^[a-f0-9]{64}$/i.test(razorpaySignature)
    ) {
      return respond("Invalid payment details.", 400);
    }

    let signatureValid = false;
    try {
      signatureValid = verifyRazorpaySignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      );
    } catch (error) {
      console.error(
        "Razorpay configuration error:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return respond("Payment verification is unavailable.", 503);
    }

    if (!signatureValid) {
      return respond("Invalid payment signature.", 400);
    }

    const admin = createAdminClient();

    const { data: batch, error: batchError } = await admin
      .from("game_payment_batches")
      .select("*")
      .eq("id", batchId)
      .eq("payer_user_id", user.id)
      .maybeSingle();

    if (batchError) {
      console.error("Batch lookup failed:", batchError.message);
      return respond("Unable to look up the booking.", 500);
    }

    if (!batch) {
      return respond("Booking batch not found.", 404);
    }

    if (batch.provider_order_id !== razorpayOrderId) {
      return respond("Payment does not match this booking.", 409);
    }

    const amountRupees = Number(batch.amount);
    const expectedPaise = Math.round(amountRupees * 100);

    if (
      !Number.isFinite(amountRupees) ||
      amountRupees <= 0 ||
      !Number.isSafeInteger(expectedPaise) ||
      expectedPaise <= 0 ||
      Math.abs(amountRupees * 100 - expectedPaise) > 1e-7 ||
      batch.currency !== "INR"
    ) {
      return respond("Stored payment amount is invalid.", 500);
    }

    let order;
    let payment;

    try {
      [order, payment] = await Promise.all([
        fetchRazorpayOrder(razorpayOrderId),
        fetchRazorpayPayment(razorpayPaymentId),
      ]);
    } catch (error) {
      console.error(
        "Razorpay lookup failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return respond(
        "Payment status could not be confirmed. Do not pay again; retry verification later.",
        503
      );
    }

    if (
      order.id !== razorpayOrderId ||
      order.receipt !== batchId ||
      order.amount !== expectedPaise ||
      order.currency !== "INR" ||
      payment.id !== razorpayPaymentId ||
      payment.order_id !== razorpayOrderId ||
      payment.amount !== expectedPaise ||
      payment.currency !== "INR" ||
      payment.status !== "captured" ||
      payment.captured !== true
    ) {
      return respond(
        "Razorpay has not confirmed this payment as captured.",
        409
      );
    }

    paymentVerified = true;

    if (
      batch.status === "CAPTURED" &&
      (
        batch.provider_payment_id !== razorpayPaymentId ||
        batch.signature !== razorpaySignature
      )
    ) {
      return respond(
        "Payment records conflict. Do not pay again; support reconciliation is required.",
        409,
        true
      );
    }

    const { error: finalizeError } = await admin.rpc(
      "finalize_game_slot_batch",
      {
        p_batch_id: batchId,
        p_provider_order_id: razorpayOrderId,
        p_provider_payment_id: razorpayPaymentId,
        p_signature: razorpaySignature,
      }
    );

    if (finalizeError) {
      console.error(
        "Batch finalization failed:",
        finalizeError.message
      );
      return respond(
        "Payment was verified, but booking confirmation is pending. Do not pay again; support reconciliation is required.",
        500,
        true
      );
    }

    const { data: finalBatch, error: finalBatchError } =
      await admin
        .from("game_payment_batches")
        .select("id, game_id, status, provider_order_id, provider_payment_id")
        .eq("id", batchId)
        .eq("payer_user_id", user.id)
        .maybeSingle();

    if (
      finalBatchError ||
      !finalBatch ||
      finalBatch.status !== "CAPTURED" ||
      finalBatch.provider_order_id !== razorpayOrderId ||
      finalBatch.provider_payment_id !== razorpayPaymentId
    ) {
      return respond(
        "Payment was verified, but booking confirmation is pending. Do not pay again; support reconciliation is required.",
        500,
        true
      );
    }

    const { data: bookings, error: bookingsError } = await admin
      .from("game_slot_bookings")
      .select("id, public_reference, slot_number, participant_name, status")
      .eq("payment_batch_id", batchId)
      .eq("payer_user_id", user.id)
      .order("slot_number", { ascending: true });

    if (
      bookingsError ||
      !bookings ||
      bookings.length === 0 ||
      bookings.some((booking) => booking.status !== "CONFIRMED")
    ) {
      return respond(
        "Payment was verified, but booking confirmation is pending. Do not pay again; support reconciliation is required.",
        500,
        true
      );
    }

    return NextResponse.json(
      {
        ok: true,
        paymentVerified: true,
        bookingConfirmed: true,
        batchId,
        gameId: finalBatch.game_id,
        bookings,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(
      "Slot verification error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return respond(
      paymentVerified
        ? "Payment was verified, but booking confirmation is pending. Do not pay again; support reconciliation is required."
        : "Unable to verify payment. Do not pay again.",
      500,
      paymentVerified
    );
  }
}