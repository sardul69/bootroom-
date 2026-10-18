
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

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { ok: false, paymentVerified: false, bookingConfirmed: false, error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export async function POST(req: Request) {
  try {
    // Authenticate the caller.
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return jsonError("Please sign in to verify this payment.", 401);
    }

    // Reject malformed or unexpectedly large request bodies.
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonError("Content-Type must be application/json.", 415);
    }

    const rawBody = await req.text();
    if (!rawBody || rawBody.length > 10_000) {
      return jsonError("Invalid request body.", 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError("Invalid JSON request.", 400);
    }

    if (!isRecord(body)) {
      return jsonError("Invalid payment details.", 400);
    }

    const {
      gamePlayerId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = body;

    if (
      typeof gamePlayerId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        gamePlayerId
      ) ||
      typeof razorpayPaymentId !== "string" ||
      !/^pay_[A-Za-z0-9]+$/.test(razorpayPaymentId) ||
      typeof razorpayOrderId !== "string" ||
      !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId) ||
      typeof razorpaySignature !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(razorpaySignature)
    ) {
      return jsonError("Missing or invalid payment details.", 400);
    }

    // Verify the checkout signature using the Razorpay secret.
    let signatureValid: boolean;
    try {
      signatureValid = verifyRazorpaySignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      );
    } catch (error) {
      console.error(
        "Razorpay signature configuration error:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return jsonError("Payment verification is temporarily unavailable.", 503);
    }

    if (!signatureValid) {
      return jsonError("Invalid payment signature.", 400);
    }

    const supabase = createAdminClient();

    // Ensure the supplied order belongs to this user and player entry.
    const { data: paymentRecord, error: recordError } = await supabase
      .from("game_payments")
      .select(
        "id, game_player_id, user_id, provider, provider_order_id, provider_payment_id, amount, status, signature"
      )
      .eq("game_player_id", gamePlayerId)
      .eq("user_id", user.id)
      .eq("provider_order_id", razorpayOrderId)
      .maybeSingle();

    if (recordError) {
      console.error("Payment record lookup failed:", recordError.message);
      return jsonError("Unable to verify the booking payment.", 500);
    }

    if (!paymentRecord) {
      return jsonError("Matching payment record not found.", 404);
    }

    if (
      paymentRecord.provider !== "razorpay" ||
      paymentRecord.user_id !== user.id ||
      paymentRecord.game_player_id !== gamePlayerId
    ) {
      return jsonError("Payment does not match this booking.", 409);
    }

    // Verify that the player entry belongs to the authenticated user.
    const { data: player, error: playerError } = await supabase
      .from("game_players")
      .select("id, game_id, user_id, status")
      .eq("id", gamePlayerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (playerError) {
      console.error("Player lookup failed:", playerError.message);
      return jsonError("Unable to verify the booking.", 500);
    }

    if (!player) {
      return jsonError("Matching player record not found.", 404);
    }

    const numericAmount = Number(paymentRecord.amount);
    const expectedAmount = Math.round(numericAmount * 100);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !Number.isSafeInteger(expectedAmount) ||
      expectedAmount <= 0 ||
      Math.abs(numericAmount * 100 - expectedAmount) > 1e-7
    ) {
      console.error("Invalid stored payment amount.", {
        gamePlayerId,
        orderId: razorpayOrderId,
      });
      return jsonError("Stored payment amount is invalid.", 500);
    }

    // Fetch authoritative records directly from Razorpay.
    let order;
    let payment;

    try {
      [order, payment] = await Promise.all([
        fetchRazorpayOrder(razorpayOrderId),
        fetchRazorpayPayment(razorpayPaymentId),
      ]);
    } catch (error) {
      console.error(
        "Razorpay API verification failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
      return jsonError(
        "Payment status could not be confirmed. Do not pay again; retry verification later.",
        503
      );
    }

    // Never finalize unless the provider records match this exact order.
    if (
      order.id !== razorpayOrderId ||
      order.receipt !== gamePlayerId ||
      order.amount !== expectedAmount ||
      order.currency !== "INR" ||
      payment.id !== razorpayPaymentId ||
      payment.order_id !== razorpayOrderId ||
      payment.amount !== expectedAmount ||
      payment.currency !== "INR" ||
      payment.status !== "captured" ||
      payment.captured !== true
    ) {
      console.warn("Razorpay payment verification checks failed.", {
        gamePlayerId,
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        orderStatus: order.status,
        paymentStatus: payment.status,
      });

      return jsonError(
        "Razorpay has not confirmed this payment as captured. Your booking is not confirmed as paid.",
        409
      );
    }

    // Reject a conflicting payment already recorded against this order.
    if (
      paymentRecord.status === "CAPTURED" &&
      (
        paymentRecord.provider_payment_id !== razorpayPaymentId ||
        paymentRecord.signature !== razorpaySignature
      )
    ) {
      console.error("Conflicting payment data for a captured order.", {
        gamePlayerId,
        orderId: razorpayOrderId,
      });
      return jsonError(
        "Payment records conflict. Support reconciliation is required.",
        409
      );
    }

    // Only the server's service-role client may execute the finalization RPC.
    const { error: finalizeError } = await supabase.rpc(
      "finalize_game_payment",
      {
        p_game_player_id: gamePlayerId,
        p_provider_order_id: razorpayOrderId,
        p_provider_payment_id: razorpayPaymentId,
        p_signature: razorpaySignature,
      }
    );

    if (finalizeError) {
      console.error("Payment finalization failed:", finalizeError.message);

      return NextResponse.json(
        {
          ok: false,
          paymentVerified: true,
          bookingConfirmed: false,
          error:
            "Razorpay payment was verified, but booking confirmation is pending. Do not pay again; support reconciliation may be required.",
        },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    // Confirm that the database now reflects the finalization.
    const { data: finalPayment, error: finalPaymentError } = await supabase
      .from("game_payments")
      .select("status, provider_payment_id, provider_order_id")
      .eq("game_player_id", gamePlayerId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: finalPlayer, error: finalPlayerError } = await supabase
      .from("game_players")
      .select("status")
      .eq("id", gamePlayerId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      finalPaymentError ||
      finalPlayerError ||
      !finalPayment ||
      !finalPlayer ||
      finalPayment.status !== "CAPTURED" ||
      finalPayment.provider_order_id !== razorpayOrderId ||
      finalPayment.provider_payment_id !== razorpayPaymentId ||
      finalPlayer.status !== "CONFIRMED"
    ) {
      console.error("Finalization state did not match expected values.", {
        gamePlayerId,
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
      });

      return NextResponse.json(
        {
          ok: false,
          paymentVerified: true,
          bookingConfirmed: false,
          error:
            "Payment was verified, but the booking status could not be confirmed. Do not pay again; support reconciliation is required.",
        },
        {
          status: 500,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        paymentVerified: true,
        bookingConfirmed: true,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    console.error(
      "Unexpected payment verification error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return jsonError(
      "Unable to verify payment right now. Do not pay again.",
      500
    );
  }
}
