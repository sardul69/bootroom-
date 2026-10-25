
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

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return errorResponse("Sign in required.", 401);
    }

    let body: {
      razorpay_order_id?: unknown;
      razorpay_payment_id?: unknown;
      razorpay_signature?: unknown;
    };

    try {
      body = await req.json();
    } catch {
      return errorResponse("Invalid request body.", 400);
    }

    const orderId = body.razorpay_order_id;
    const paymentId = body.razorpay_payment_id;
    const signature = body.razorpay_signature;

    if (
      typeof orderId !== "string" ||
      typeof paymentId !== "string" ||
      typeof signature !== "string"
    ) {
      return errorResponse("Payment details are incomplete.", 400);
    }

    if (!verifyRazorpaySignature(orderId, paymentId, signature)) {
      return errorResponse("Invalid payment signature.", 400);
    }

    const admin = createAdminClient();

    const { data: paymentRecord, error: paymentError } = await admin
      .from("payments")
      .select(
        "booking_id, user_id, provider, provider_order_id, provider_payment_id, amount, status"
      )
      .eq("provider_order_id", orderId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (paymentError) {
      console.error("Legacy payment lookup failed:", paymentError.message);
      return errorResponse("Unable to verify payment right now.", 500);
    }

    if (!paymentRecord) {
      return errorResponse("Payment record not found.", 404);
    }

    if (
      paymentRecord.provider !== "razorpay" ||
      paymentRecord.provider_order_id !== orderId ||
      !paymentRecord.booking_id ||
      paymentRecord.user_id !== user.id
    ) {
      return errorResponse("Payment record does not match this order.", 409);
    }

    const amount = Number(paymentRecord.amount);
    const expectedPaise = Math.round(amount * 100);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(expectedPaise) ||
      Math.abs(amount * 100 - expectedPaise) > 1e-7
    ) {
      console.error("Invalid stored legacy payment amount.", {
        bookingId: paymentRecord.booking_id,
      });
      return errorResponse("Stored payment amount is invalid.", 500);
    }

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, user_id, total_amount, status")
      .eq("id", paymentRecord.booking_id)
      .maybeSingle();

    if (bookingError) {
      console.error("Legacy booking lookup failed:", bookingError.message);
      return errorResponse("Unable to verify booking right now.", 500);
    }

    if (!booking || booking.user_id !== user.id) {
      return errorResponse("Booking not found.", 404);
    }

    const bookingAmount = Number(booking.total_amount);
    const bookingPaise = Math.round(bookingAmount * 100);

    if (
      !Number.isFinite(bookingAmount) ||
      bookingAmount <= 0 ||
      !Number.isSafeInteger(bookingPaise) ||
      Math.abs(bookingAmount * 100 - bookingPaise) > 1e-7 ||
      bookingPaise !== expectedPaise
    ) {
      return errorResponse(
        "The payment amount does not match the booking.",
        409
      );
    }

    const [order, razorpayPayment] = await Promise.all([
      fetchRazorpayOrder(orderId),
      fetchRazorpayPayment(paymentId),
    ]);

    if (
      order.id !== orderId ||
      order.receipt !== booking.id ||
      order.amount !== expectedPaise ||
      order.currency !== "INR" ||
      razorpayPayment.id !== paymentId ||
      razorpayPayment.order_id !== orderId ||
      razorpayPayment.amount !== expectedPaise ||
      razorpayPayment.currency !== "INR" ||
      razorpayPayment.status !== "captured" ||
      razorpayPayment.captured !== true
    ) {
      return errorResponse(
        "Razorpay has not confirmed a matching captured payment. Do not pay again; contact support if money was deducted.",
        409
      );
    }

    // Record a verified captured payment if booking confirmation cannot
    // be completed or the final database state cannot be verified.
    async function recordReconciliation(
      bookingId: string,
      userId: string,
      amountToRecord: number,
      reason: string
    ): Promise<boolean> {
      const { error } = await admin.rpc(
        "record_booking_payment_reconciliation",
        {
          p_booking_id: bookingId,
          p_user_id: userId,
          p_provider_order_id: orderId,
          p_provider_payment_id: paymentId,
          p_amount: amountToRecord,
          p_reason: reason,
        }
      );

      if (error) {
        console.error("Booking payment reconciliation recording failed:", {
          bookingId,
          orderId,
          paymentId,
          message: error.message,
        });
      }

      return !error;
    }

    if (booking.status === "CONFIRMED") {
      if (
        paymentRecord.status === "CAPTURED" &&
        paymentRecord.provider_payment_id === paymentId
      ) {
        return NextResponse.json({ ok: true });
      }

      const recorded = await recordReconciliation(
        booking.id,
        user.id,
        bookingAmount,
        "Booking is confirmed, but the stored payment does not match the verified captured payment."
      );

      return errorResponse(
        recorded
          ? "This booking is confirmed, but its payment record needs reconciliation. Do not pay again; contact support."
          : "This booking is confirmed, but reconciliation recording failed. Do not pay again; contact support.",
        409
      );
    }

    if (!["HELD", "PAYMENT_PENDING"].includes(booking.status)) {
      const recorded = await recordReconciliation(
        booking.id,
        user.id,
        bookingAmount,
        `Captured payment for non-payable booking status: ${booking.status}`
      );

      return errorResponse(
        recorded
          ? "Payment was captured, but booking confirmation needs reconciliation. Do not pay again; contact support."
          : "Payment was captured, but reconciliation recording failed. Do not pay again; contact support.",
        409
      );
    }

    const { error: finalizeError } = await admin.rpc(
      "finalize_paid_booking",
      {
        p_booking_id: booking.id,
        p_provider_payment_id: paymentId,
        p_signature: signature,
      }
    );

    if (finalizeError) {
      const recorded = await recordReconciliation(
        booking.id,
        user.id,
        bookingAmount,
        `Booking finalization failed: ${finalizeError.message}`
      );

      console.error("Legacy booking finalization failed:", {
        bookingId: booking.id,
        orderId,
        paymentId,
        finalizationError: finalizeError.message,
        reconciliationRecorded: recorded,
      });

      return errorResponse(
        recorded
          ? "Payment was captured, but booking confirmation needs reconciliation. Do not pay again; contact support."
          : "Payment was captured, but reconciliation recording failed. Do not pay again; contact support.",
        409
      );
    }

    const [
      { data: finalBooking, error: finalBookingError },
      { data: finalPayment, error: finalPaymentError },
    ] = await Promise.all([
      admin
        .from("bookings")
        .select("id, user_id, status")
        .eq("id", booking.id)
        .maybeSingle(),
      admin
        .from("payments")
        .select("status, provider_order_id, provider_payment_id")
        .eq("booking_id", booking.id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (
      finalBookingError ||
      finalPaymentError ||
      finalBooking?.user_id !== user.id ||
      finalBooking?.status !== "CONFIRMED" ||
      finalPayment?.status !== "CAPTURED" ||
      finalPayment?.provider_order_id !== orderId ||
      finalPayment?.provider_payment_id !== paymentId
    ) {
      const recorded = await recordReconciliation(
        booking.id,
        user.id,
        bookingAmount,
        "Final booking/payment state could not be verified after finalization."
      );

      console.error("Legacy booking finalization requires reconciliation.", {
        bookingId: booking.id,
        bookingConfirmed: finalBooking?.status === "CONFIRMED",
        paymentCaptured: finalPayment?.status === "CAPTURED",
        reconciliationRecorded: recorded,
      });

      return errorResponse(
        recorded
          ? "Payment was captured, but booking confirmation could not be verified. Do not pay again; contact support."
          : "Payment was captured, but reconciliation recording failed. Do not pay again; contact support.",
        409
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Legacy payment verification failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return errorResponse(
      "Unable to verify payment right now. If money was deducted, do not pay again; contact support.",
      500
    );
  }
}
