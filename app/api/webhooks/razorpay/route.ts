
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  verifyRazorpayWebhook,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_LENGTH = 1_000_000;

function webhookResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isRazorpayOrderId(value: unknown): value is string {
  return typeof value === "string" && /^order_[A-Za-z0-9]+$/.test(value);
}

function isRazorpayPaymentId(value: unknown): value is string {
  return typeof value === "string" && /^pay_[A-Za-z0-9]+$/.test(value);
}

function amountInPaise(value: unknown): number | null {
  const rupees = Number(value);

  if (!Number.isFinite(rupees) || rupees <= 0) return null;

  const paise = Math.round(rupees * 100);

  if (
    !Number.isSafeInteger(paise) ||
    paise <= 0 ||
    Math.abs(rupees * 100 - paise) > 0.000001
  ) {
    return null;
  }

  return paise;
}

function logFailure(
  message: string,
  details: Record<string, unknown>
) {
  console.error(message, details);
}

export async function POST(req: Request) {
  try {
    const raw = await req.text();

    if (!raw || raw.length > MAX_BODY_LENGTH) {
      return webhookResponse({ error: "Invalid webhook body." }, 400);
    }

    const signature = req.headers.get("x-razorpay-signature") ?? "";
    let signatureValid: boolean;

    try {
      signatureValid = verifyRazorpayWebhook(raw, signature);
    } catch (error) {
      logFailure("Razorpay webhook verification unavailable.", {
        message: error instanceof Error ? error.message : "Unknown error",
      });

      return webhookResponse(
        { error: "Webhook verification unavailable; retry delivery." },
        503
      );
    }

    if (!signatureValid) {
      return webhookResponse({ error: "Invalid webhook signature." }, 400);
    }

    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch {
      return webhookResponse({ error: "Invalid JSON payload." }, 400);
    }

    if (
      !isRecord(payload) ||
      typeof payload.event !== "string" ||
      payload.event.length === 0
    ) {
      return webhookResponse({ error: "Invalid event payload." }, 400);
    }

    const eventType = payload.event;
    const suppliedEventId = req.headers
      .get("x-razorpay-event-id")
      ?.trim();

    if (suppliedEventId && suppliedEventId.length > 255) {
      return webhookResponse({ error: "Invalid event ID." }, 400);
    }

    const eventId =
      suppliedEventId ||
      `sha256_${createHash("sha256").update(raw).digest("hex")}`;

    const admin = createAdminClient();

    const { error: insertError } = await admin
      .from("payment_events")
      .insert({
        provider: "razorpay",
        provider_event_id: eventId,
        event_type: eventType,
        payload,
      });

    if (
      insertError &&
      !/duplicate|unique constraint/i.test(insertError.message)
    ) {
      logFailure("Could not persist Razorpay webhook event.", {
        eventId,
        eventType,
        message: insertError.message,
      });

      return webhookResponse(
        { error: "Could not persist event; retry delivery." },
        500
      );
    }

    if (
      eventType !== "payment.captured" &&
      eventType !== "payment.failed"
    ) {
      return webhookResponse({ ok: true, ignored: true });
    }

    const eventPayload = isRecord(payload.payload) ? payload.payload : null;
    const paymentWrapper =
      eventPayload && isRecord(eventPayload.payment)
        ? eventPayload.payment
        : null;
    const eventPayment =
      paymentWrapper && isRecord(paymentWrapper.entity)
        ? paymentWrapper.entity
        : null;

    if (
      !eventPayment ||
      !isRazorpayPaymentId(eventPayment.id) ||
      !isRazorpayOrderId(eventPayment.order_id)
    ) {
      logFailure("Malformed Razorpay payment event.", { eventId, eventType });
      return webhookResponse(
        { error: "Payment event data is incomplete." },
        400
      );
    }

    const paymentId = eventPayment.id;
    const orderId = eventPayment.order_id;

    if (eventType === "payment.failed") {
      return webhookResponse({
        ok: true,
        recorded: true,
        ignored: true,
        reason: "Failed attempt recorded; payment record unchanged.",
      });
    }

    let livePayment;
    let liveOrder;

    try {
      [livePayment, liveOrder] = await Promise.all([
        fetchRazorpayPayment(paymentId),
        fetchRazorpayOrder(orderId),
      ]);
    } catch (error) {
      logFailure("Could not verify captured payment with Razorpay.", {
        eventId,
        orderId,
        paymentId,
        message: error instanceof Error ? error.message : "Unknown error",
      });

      return webhookResponse(
        { error: "Live payment verification failed; retry delivery." },
        503
      );
    }

    if (
      livePayment.id !== paymentId ||
      livePayment.order_id !== orderId ||
      livePayment.status !== "captured" ||
      livePayment.captured !== true ||
      livePayment.currency !== "INR"
    ) {
      logFailure("Razorpay payment is not a matching captured payment.", {
        eventId,
        orderId,
        paymentId,
        liveStatus: livePayment.status,
        liveCurrency: livePayment.currency,
        liveCaptured: livePayment.captured,
      });

      return webhookResponse(
        { error: "Payment is not verified as captured." },
        409
      );
    }

    if (
      liveOrder.id !== orderId ||
      typeof liveOrder.receipt !== "string" ||
      liveOrder.receipt.length === 0 ||
      liveOrder.currency !== "INR"
    ) {
      logFailure("Razorpay order identity or currency mismatch.", {
        eventId,
        orderId,
        paymentId,
      });

      return webhookResponse({ error: "Order verification failed." }, 409);
    }

    const {
      data: paymentRecord,
      error: paymentLookupError,
    } = await admin
      .from("payments")
      .select(
        "booking_id, user_id, provider, provider_order_id, provider_payment_id, amount, status"
      )
      .eq("provider", "razorpay")
      .eq("provider_order_id", orderId)
      .maybeSingle();

    if (paymentLookupError) {
      logFailure("Webhook payment-record lookup failed.", {
        eventId,
        orderId,
        message: paymentLookupError.message,
      });

      return webhookResponse(
        { error: "Could not look up payment; retry delivery." },
        500
      );
    }

    if (!paymentRecord) {
      logFailure("Payment record not found for captured order.", {
        eventId,
        orderId,
        paymentId,
      });

      return webhookResponse(
        { error: "Payment record not found; retry delivery." },
        500
      );
    }

    if (
      paymentRecord.provider !== "razorpay" ||
      paymentRecord.provider_order_id !== orderId ||
      typeof paymentRecord.booking_id !== "string" ||
      typeof paymentRecord.user_id !== "string"
    ) {
      logFailure("Stored payment identity is inconsistent.", {
        eventId,
        orderId,
        paymentId,
      });

      return webhookResponse(
        { error: "Stored payment identity mismatch." },
        409
      );
    }

    const {
      data: booking,
      error: bookingLookupError,
    } = await admin
      .from("bookings")
      .select("id, user_id, total_amount, status")
      .eq("id", paymentRecord.booking_id)
      .maybeSingle();

    if (bookingLookupError) {
      logFailure("Webhook booking lookup failed.", {
        eventId,
        orderId,
        bookingId: paymentRecord.booking_id,
        message: bookingLookupError.message,
      });

      return webhookResponse(
        { error: "Could not look up booking; retry delivery." },
        500
      );
    }

    if (
      !booking ||
      booking.id !== paymentRecord.booking_id ||
      booking.user_id !== paymentRecord.user_id ||
      liveOrder.receipt !== booking.id
    ) {
      logFailure("Booking ownership or order receipt mismatch.", {
        eventId,
        orderId,
        bookingId: paymentRecord.booking_id,
      });

      return webhookResponse(
        { error: "Booking and payment do not match." },
        409
      );
    }

    const expectedPaymentPaise = amountInPaise(paymentRecord.amount);
    const bookingAmountPaise = amountInPaise(booking.total_amount);

    if (
      expectedPaymentPaise === null ||
      bookingAmountPaise === null ||
      expectedPaymentPaise !== bookingAmountPaise ||
      livePayment.amount !== expectedPaymentPaise ||
      liveOrder.amount !== expectedPaymentPaise
    ) {
      logFailure("Captured payment amount does not match booking.", {
        eventId,
        orderId,
        paymentId,
        expectedPaymentPaise,
        bookingAmountPaise,
        livePaymentPaise: livePayment.amount,
        liveOrderPaise: liveOrder.amount,
      });

      return webhookResponse(
        { error: "Payment amount mismatch; manual review required." },
        409
      );
    }

    // Pass validated booking details explicitly to avoid nullable closure errors.
    async function recordReconciliation(
      bookingId: string,
      userId: string,
      bookingAmount: number,
      reason: string
    ): Promise<boolean> {
      const { error } = await admin.rpc(
        "record_booking_payment_reconciliation",
        {
          p_booking_id: bookingId,
          p_user_id: userId,
          p_provider_order_id: orderId,
          p_provider_payment_id: paymentId,
          p_amount: bookingAmount,
          p_reason: reason,
        }
      );

      if (error) {
        logFailure("Webhook reconciliation recording failed.", {
          eventId,
          orderId,
          paymentId,
          bookingId,
          message: error.message,
        });
        return false;
      }

      return true;
    }

    if (
      paymentRecord.status === "CAPTURED" &&
      paymentRecord.provider_payment_id !== paymentId
    ) {
      logFailure("Captured payment ID conflicts with stored payment.", {
        eventId,
        orderId,
        paymentId,
        storedPaymentId: paymentRecord.provider_payment_id,
      });

      return webhookResponse(
        { error: "Payment ID conflict; manual review required." },
        409
      );
    }

    if (
      paymentRecord.provider_payment_id != null &&
      paymentRecord.provider_payment_id !== paymentId &&
      paymentRecord.status !== "FAILED" &&
      paymentRecord.status !== "CAPTURED"
    ) {
      logFailure("Payment ID conflicts with an existing attempt.", {
        eventId,
        orderId,
        paymentId,
        storedPaymentId: paymentRecord.provider_payment_id,
        storedStatus: paymentRecord.status,
      });

      return webhookResponse(
        { error: "Payment ID conflict; manual review required." },
        409
      );
    }

    const alreadyFinalized =
      paymentRecord.status === "CAPTURED" &&
      paymentRecord.provider_payment_id === paymentId;

    if (!alreadyFinalized) {
      const { error: finalizeError } = await admin.rpc(
        "finalize_paid_booking",
        {
          p_booking_id: booking.id,
          p_provider_payment_id: paymentId,
          p_signature: null,
        }
      );

      if (finalizeError) {
        const recorded = await recordReconciliation(
          booking.id,
          booking.user_id,
          Number(booking.total_amount),
          `Webhook booking finalization failed: ${finalizeError.message}`
        );

        logFailure("Webhook booking finalization failed.", {
          eventId,
          orderId,
          paymentId,
          bookingId: booking.id,
          finalizationError: finalizeError.message,
          reconciliationRecorded: recorded,
        });

        return recorded
          ? webhookResponse({
              ok: true,
              reconciliationRequired: true,
              bookingId: booking.id,
            })
          : webhookResponse(
              { error: "Reconciliation recording failed; retry delivery." },
              500
            );
      }
    }

    const [
      { data: finalBooking, error: finalBookingError },
      { data: finalPayment, error: finalPaymentError },
    ] = await Promise.all([
      admin
        .from("bookings")
        .select("id, user_id, total_amount, status")
        .eq("id", booking.id)
        .maybeSingle(),
      admin
        .from("payments")
        .select(
          "booking_id, user_id, provider, provider_order_id, provider_payment_id, amount, status"
        )
        .eq("booking_id", booking.id)
        .maybeSingle(),
    ]);

    const finalAmountPaise = finalPayment
      ? amountInPaise(finalPayment.amount)
      : null;

    if (
      finalBookingError ||
      finalPaymentError ||
      !finalBooking ||
      !finalPayment ||
      finalBooking.id !== booking.id ||
      finalBooking.user_id !== booking.user_id ||
      finalBooking.status !== "CONFIRMED" ||
      finalPayment.booking_id !== booking.id ||
      finalPayment.user_id !== booking.user_id ||
      finalPayment.provider !== "razorpay" ||
      finalPayment.provider_order_id !== orderId ||
      finalPayment.provider_payment_id !== paymentId ||
      finalPayment.status !== "CAPTURED" ||
      finalAmountPaise !== expectedPaymentPaise
    ) {
      const recorded = await recordReconciliation(
        booking.id,
        booking.user_id,
        Number(booking.total_amount),
        "Webhook final booking/payment state could not be verified."
      );

      logFailure("Captured payment final state requires reconciliation.", {
        eventId,
        orderId,
        paymentId,
        bookingId: booking.id,
        bookingStatus: finalBooking?.status,
        paymentStatus: finalPayment?.status,
        finalPaymentId: finalPayment?.provider_payment_id,
        bookingLookupFailed: Boolean(finalBookingError),
        paymentLookupFailed: Boolean(finalPaymentError),
        reconciliationRecorded: recorded,
      });

      return recorded
        ? webhookResponse({
            ok: true,
            reconciliationRequired: true,
            bookingId: booking.id,
          })
        : webhookResponse(
            {
              error:
                "Payment was verified, but reconciliation recording failed; retry delivery.",
            },
            500
          );
    }

    return webhookResponse({
      ok: true,
      paymentVerified: true,
      bookingConfirmed: true,
      bookingId: booking.id,
    });
  } catch (error) {
    logFailure("Razorpay webhook processing failed.", {
      message:
        error instanceof Error ? error.message : "Unknown error",
    });

    return webhookResponse(
      { error: "Webhook processing failed; retry delivery." },
      500
    );
  }
}
