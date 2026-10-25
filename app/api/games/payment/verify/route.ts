
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

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function response(body: JsonRecord, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorResponse(message: string, status: number) {
  return response(
    {
      ok: false,
      paymentVerified: false,
      bookingConfirmed: false,
      error: message,
    },
    status
  );
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function isRazorpayId(
  value: unknown,
  prefix: "order" | "pay"
): value is string {
  return (
    typeof value === "string" &&
    new RegExp(`^${prefix}_[A-Za-z0-9]+$`).test(value)
  );
}

function isSignature(value: unknown): value is string {
  return typeof value === "string" && /^[a-fA-F0-9]{64}$/.test(value);
}

function amountInPaise(value: unknown): number | null {
  const amount = Number(value);
  const paise = Math.round(amount * 100);

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !Number.isSafeInteger(paise) ||
    paise <= 0 ||
    Math.abs(amount * 100 - paise) > 1e-7
  ) {
    return null;
  }

  return paise;
}

function pendingReconciliation(message: string) {
  return response(
    {
      ok: false,
      paymentVerified: true,
      bookingConfirmed: false,
      reconciliationRequired: true,
      error: message,
      instruction: "Do not pay again. Keep your payment details for support.",
    },
    202
  );
}

export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return errorResponse("Please sign in to verify this payment.", 401);
    }

    if (
      !(req.headers.get("content-type") ?? "")
        .toLowerCase()
        .includes("application/json")
    ) {
      return errorResponse("Content-Type must be application/json.", 415);
    }

    const rawBody = await req.text();

    if (!rawBody || rawBody.length > 10_000) {
      return errorResponse("Invalid request body.", 400);
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse("Invalid JSON request.", 400);
    }

    if (!isRecord(body)) {
      return errorResponse("Invalid payment details.", 400);
    }

    const {
      gamePlayerId,
      batchId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = body;

    const isBatch = batchId !== undefined;

    if (
      (isBatch && (!isUuid(batchId) || gamePlayerId !== undefined)) ||
      (!isBatch && !isUuid(gamePlayerId)) ||
      !isRazorpayId(razorpayPaymentId, "pay") ||
      !isRazorpayId(razorpayOrderId, "order") ||
      !isSignature(razorpaySignature)
    ) {
      return errorResponse("Missing or invalid payment details.", 400);
    }

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

      return errorResponse(
        "Payment verification is temporarily unavailable.",
        503
      );
    }

    if (!signatureValid) {
      return errorResponse("Invalid payment signature.", 400);
    }

    const supabase = createAdminClient();

    let expectedAmount: number | null = null;
    let expectedReceipt: string;
    let gameId: string;
    let payerUserId: string;
    let existingStatus: string;
    let storedPaymentId: string | null;
    let storedSignature: string | null;

    if (isBatch) {
      const { data: batch, error: batchError } = await supabase
        .from("game_payment_batches")
        .select(
          "id, game_id, payer_user_id, provider, provider_order_id, provider_payment_id, amount, status, signature, currency"
        )
        .eq("id", batchId)
        .eq("payer_user_id", user.id)
        .maybeSingle();

      if (batchError) {
        console.error("Batch lookup failed:", batchError.message);
        return errorResponse("Unable to verify this booking payment.", 500);
      }

      if (!batch) {
        return errorResponse("Matching payment batch not found.", 404);
      }

      if (
        batch.provider !== "razorpay" ||
        batch.currency !== "INR" ||
        batch.provider_order_id !== razorpayOrderId
      ) {
        return errorResponse("Payment does not match this booking.", 409);
      }

      expectedAmount = amountInPaise(batch.amount);
      expectedReceipt = batch.id;
      gameId = batch.game_id;
      payerUserId = batch.payer_user_id;
      existingStatus = batch.status;
      storedPaymentId = batch.provider_payment_id;
      storedSignature = batch.signature;

      if (storedPaymentId && storedPaymentId !== razorpayPaymentId) {
        return errorResponse(
          "A different payment is already recorded for this order.",
          409
        );
      }
    } else {
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
        return errorResponse("Unable to verify this booking payment.", 500);
      }

      if (!paymentRecord) {
        return errorResponse("Matching payment record not found.", 404);
      }

      if (paymentRecord.provider !== "razorpay") {
        return errorResponse("Unsupported payment provider.", 409);
      }

      const { data: player, error: playerError } = await supabase
        .from("game_players")
        .select("id, game_id, user_id, status")
        .eq("id", gamePlayerId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (playerError) {
        console.error("Player lookup failed:", playerError.message);
        return errorResponse("Unable to verify the booking.", 500);
      }

      if (!player) {
        return errorResponse("Matching player record not found.", 404);
      }

      expectedAmount = amountInPaise(paymentRecord.amount);
      expectedReceipt = player.id;
      gameId = player.game_id;
      payerUserId = player.user_id;
      existingStatus = paymentRecord.status;
      storedPaymentId = paymentRecord.provider_payment_id;
      storedSignature = paymentRecord.signature;

      if (storedPaymentId && storedPaymentId !== razorpayPaymentId) {
        return errorResponse(
          "A different payment is already recorded for this booking.",
          409
        );
      }
    }

    if (expectedAmount === null) {
      console.error("Invalid stored payment amount.", {
        gameId,
        orderId: razorpayOrderId,
        isBatch,
      });

      return errorResponse("Stored payment amount is invalid.", 500);
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
        "Razorpay API verification failed:",
        error instanceof Error ? error.message : "Unknown error"
      );

      return response(
        {
          ok: false,
          paymentVerified: false,
          bookingConfirmed: false,
          error:
            "Payment status could not be confirmed. Do not pay again; retry verification later.",
        },
        503
      );
    }

    if (
      order.id !== razorpayOrderId ||
      order.receipt !== expectedReceipt ||
      order.amount !== expectedAmount ||
      order.currency !== "INR" ||
      payment.id !== razorpayPaymentId ||
      payment.order_id !== razorpayOrderId ||
      payment.amount !== expectedAmount ||
      payment.currency !== "INR" ||
      payment.status !== "captured" ||
      payment.captured !== true
    ) {
      console.warn("Razorpay verification checks failed.", {
        gameId,
        orderId: razorpayOrderId,
        paymentId: razorpayPaymentId,
        orderStatus: order.status,
        paymentStatus: payment.status,
      });

      return errorResponse(
        "Razorpay has not confirmed this payment as captured. Do not pay again while checking its status.",
        409
      );
    }

    if (
      existingStatus === "CAPTURED" &&
      storedSignature &&
      storedSignature !== razorpaySignature
    ) {
      console.error("Signature mismatch for an already captured payment.", {
        gameId,
        orderId: razorpayOrderId,
      });

      return pendingReconciliation(
        "Payment is captured but the stored verification details conflict. Support reconciliation is required."
      );
    }

    // Retry safely: success is returned only when every slot in this batch
    // is confirmed, never merely because one confirmed slot exists.
    if (
      isBatch &&
      existingStatus === "CAPTURED" &&
      storedPaymentId === razorpayPaymentId
    ) {
      const { data: allBatchSlots, error: slotsError } = await supabase
        .from("game_slot_bookings")
        .select("id, public_reference, status")
        .eq("payment_batch_id", batchId)
        .eq("payer_user_id", user.id);

      if (slotsError || !allBatchSlots?.length) {
        console.error("Batch retry slot lookup failed.", {
          batchId,
          message: slotsError?.message,
        });

        return pendingReconciliation(
          "Payment is captured. Booking confirmation is being checked; do not pay again."
        );
      }

      if (allBatchSlots.every((slot) => slot.status === "CONFIRMED")) {
        return response({
          ok: true,
          paymentVerified: true,
          bookingConfirmed: true,
          batchId,
          quantity: allBatchSlots.length,
          bookingReferences: allBatchSlots.map(
            (slot) => slot.public_reference
          ),
        });
      }

      return pendingReconciliation(
        "Payment is captured, but not all booking slots are confirmed. Do not pay again."
      );
    }

    if (
      !isBatch &&
      existingStatus === "CAPTURED" &&
      storedPaymentId === razorpayPaymentId
    ) {
      const { data: player, error: playerError } = await supabase
        .from("game_players")
        .select("status")
        .eq("id", gamePlayerId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (playerError) {
        console.error("Player retry lookup failed:", playerError.message);
        return pendingReconciliation(
          "Payment is captured. Booking confirmation is being checked; do not pay again."
        );
      }

      if (player?.status === "CONFIRMED") {
        return response({
          ok: true,
          paymentVerified: true,
          bookingConfirmed: true,
          gamePlayerId,
        });
      }
    }

    // The database RPC remains the only authority for booking confirmation.
    const rpcName = isBatch
      ? "finalize_game_slot_batch"
      : "finalize_game_payment";

    const rpcArgs = isBatch
      ? {
          p_batch_id: batchId,
          p_provider_order_id: razorpayOrderId,
          p_provider_payment_id: razorpayPaymentId,
          p_signature: razorpaySignature,
        }
      : {
          p_game_player_id: gamePlayerId,
          p_provider_order_id: razorpayOrderId,
          p_provider_payment_id: razorpayPaymentId,
          p_signature: razorpaySignature,
        };

    const { data: finalizeResult, error: finalizeError } =
      await supabase.rpc(rpcName, rpcArgs);

    if (finalizeError) {
      console.error("Payment finalization RPC failed.", {
        kind: isBatch ? "BATCH" : "SINGLE",
        gameId,
        orderId: razorpayOrderId,
        message: finalizeError.message,
      });

      return pendingReconciliation(
        "Razorpay payment is verified, but the booking has not been confirmed. Do not pay again; support reconciliation is required."
      );
    }

    if (
      isRecord(finalizeResult) &&
      finalizeResult.reconciliationRequired === true
    ) {
      return pendingReconciliation(
        "Payment was captured, but the booking needs reconciliation. Do not pay again."
      );
    }

    if (isRecord(finalizeResult) && finalizeResult.ok === false) {
      return pendingReconciliation(
        "Payment was captured, but booking finalization needs review. Do not pay again."
      );
    }

    if (isBatch) {
      const { data: batchAfter, error: batchAfterError } = await supabase
        .from("game_payment_batches")
        .select("status, provider_order_id, provider_payment_id")
        .eq("id", batchId)
        .eq("payer_user_id", payerUserId)
        .maybeSingle();

      const { data: slotsAfter, error: slotsAfterError } = await supabase
        .from("game_slot_bookings")
        .select("id, public_reference, status")
        .eq("payment_batch_id", batchId)
        .eq("payer_user_id", payerUserId);

      if (
        batchAfterError ||
        slotsAfterError ||
        !batchAfter ||
        batchAfter.status !== "CAPTURED" ||
        batchAfter.provider_order_id !== razorpayOrderId ||
        batchAfter.provider_payment_id !== razorpayPaymentId ||
        !slotsAfter?.length ||
        slotsAfter.some((slot) => slot.status !== "CONFIRMED")
      ) {
        console.error("Batch finalization state requires reconciliation.", {
          batchId,
          gameId,
        });

        return pendingReconciliation(
          "Payment is verified, but all booking slots are not confirmed. Do not pay again."
        );
      }

      return response({
        ok: true,
        paymentVerified: true,
        bookingConfirmed: true,
        batchId,
        quantity: slotsAfter.length,
        bookingReferences: slotsAfter.map(
          (slot) => slot.public_reference
        ),
      });
    }

    const { data: finalPayment, error: finalPaymentError } = await supabase
      .from("game_payments")
      .select("status, provider_order_id, provider_payment_id")
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
      return pendingReconciliation(
        "Payment is verified, but booking confirmation is not complete. Do not pay again."
      );
    }

    return response({
      ok: true,
      paymentVerified: true,
      bookingConfirmed: true,
      gamePlayerId,
    });
  } catch (error) {
    console.error(
      "Unexpected payment verification error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return errorResponse(
      "Unable to verify payment right now. Do not pay again.",
      500
    );
  }
}
