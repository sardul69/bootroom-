
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function respond(
  message: string,
  status: number,
  code: string,
  requestId: string,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json(
    { ok: false, error: message, code, requestId, ...extra },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function logFailure(
  stage: string,
  requestId: string,
  error?: unknown,
  details: Record<string, string | number | boolean | null> = {}
) {
  console.error(
    JSON.stringify({
      event: "turfzy_checkout_start",
      stage,
      requestId,
      error:
        error instanceof Error
          ? error.message
          : error == null
            ? undefined
            : String(error),
      ...details,
    })
  );
}

function getPaymentKeyId(): string | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const mode = process.env.RAZORPAY_EXPECTED_MODE?.trim();

  if (
    !keyId ||
    !secret ||
    (mode !== "test" && mode !== "live") ||
    !keyId.startsWith(`rzp_${mode}_`)
  ) {
    return null;
  }

  return keyId;
}

function toPaise(value: unknown): number | null {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const paise = Math.round(amount * 100);

  if (
    !Number.isSafeInteger(paise) ||
    paise <= 0 ||
    Math.abs(amount * 100 - paise) > 1e-7
  ) {
    return null;
  }

  return paise;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  let reservedBatchId: string | undefined;

  try {
    // 1. Authenticate the payer.
    let authClient;

    try {
      authClient = await createClient();
    } catch (error) {
      logFailure("AUTH_CLIENT", requestId, error);

      return respond(
        "Unable to check your sign-in session. Please try again.",
        503,
        "AUTH_UNAVAILABLE",
        requestId
      );
    }

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return respond(
        "Please sign in before joining this game.",
        401,
        "AUTH_REQUIRED",
        requestId
      );
    }

    // 2. Validate request content type and body.
    if (
      !(req.headers.get("content-type") ?? "")
        .toLowerCase()
        .includes("application/json")
    ) {
      return respond(
        "The request must use JSON.",
        415,
        "INVALID_CONTENT_TYPE",
        requestId
      );
    }

    const rawBody = await req.text();

    if (!rawBody || rawBody.length > 10_000) {
      return respond(
        "The request body is missing or too large.",
        400,
        "INVALID_BODY",
        requestId
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return respond(
        "The request contains invalid JSON.",
        400,
        "INVALID_JSON",
        requestId
      );
    }

    if (
      !isRecord(body) ||
      typeof body.gameId !== "string" ||
      !UUID.test(body.gameId)
    ) {
      return respond(
        "A valid game ID is required.",
        400,
        "INVALID_GAME_ID",
        requestId
      );
    }

    const gameId = body.gameId;
    const quantity = body.quantity === undefined ? 1 : body.quantity;

    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      return respond(
        "Select between 1 and 10 player slots.",
        400,
        "INVALID_QUANTITY",
        requestId
      );
    }

    const paymentMode =
      body.paymentMode === undefined ? "FULL" : body.paymentMode;

    if (paymentMode !== "FULL" && paymentMode !== "PARTIAL") {
      return respond(
        "Choose full payment or fixed booking amount.",
        400,
        "INVALID_PAYMENT_MODE",
        requestId
      );
    }

    // 3. Validate Razorpay configuration.
    const keyId = getPaymentKeyId();

    if (!keyId) {
      logFailure("PAYMENT_CONFIGURATION", requestId);

      return respond(
        "Payments are temporarily unavailable. Please try again later.",
        503,
        "PAYMENT_CONFIGURATION",
        requestId
      );
    }

    // 4. Load authoritative prices from the database.
    let admin;

    try {
      admin = createAdminClient();
    } catch (error) {
      logFailure("ADMIN_CLIENT", requestId, error);

      return respond(
        "The booking service is temporarily unavailable.",
        503,
        "BOOKING_SERVICE_UNAVAILABLE",
        requestId
      );
    }

    const { data: game, error: gameError } = await admin
      .from("games")
      .select(
        "id, player_fee, booking_amount, player_capacity, status, slot_start"
      )
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      logFailure("GAME_LOOKUP", requestId, gameError, { gameId });

      return respond(
        "Unable to load this game.",
        500,
        "GAME_LOOKUP_FAILED",
        requestId
      );
    }

    if (!game) {
      return respond(
        "This game could not be found.",
        404,
        "GAME_NOT_FOUND",
        requestId
      );
    }

    const startTime = game.slot_start
      ? new Date(game.slot_start).getTime()
      : NaN;

    if (
      game.status !== "OPEN" ||
      !Number.isFinite(startTime) ||
      startTime <= Date.now()
    ) {
      return respond(
        "This game is no longer available to join.",
        409,
        "GAME_UNAVAILABLE",
        requestId
      );
    }

    const feeInPaise = toPaise(game.player_fee);
    const bookingFeeInPaise = toPaise(game.booking_amount);

    if (
      feeInPaise === null ||
      !Number.isSafeInteger(feeInPaise * quantity)
    ) {
      logFailure("INVALID_FEE", requestId, undefined, { gameId });

      return respond(
        "The player fee is invalid. Please contact support.",
        500,
        "INVALID_PLAYER_FEE",
        requestId
      );
    }

    // PARTIAL must be a genuine deposit, strictly less than the full fee.
    // Legacy games with booking_amount equal to player_fee can still use FULL.
    if (
      paymentMode === "PARTIAL" &&
      (
        bookingFeeInPaise === null ||
        bookingFeeInPaise >= feeInPaise
      )
    ) {
      return respond(
        "A valid fixed booking amount has not been configured for this game. Please choose full payment or contact support.",
        409,
        "INVALID_BOOKING_AMOUNT",
        requestId
      );
    }

    const totalDueInPaise = feeInPaise * quantity;

    // PARTIAL charges the fixed booking amount per player, not a percentage.
    const expectedPayNowInPaise =
      paymentMode === "PARTIAL"
        ? bookingFeeInPaise! * quantity
        : totalDueInPaise;

    if (
      !Number.isSafeInteger(expectedPayNowInPaise) ||
      expectedPayNowInPaise <= 0 ||
      expectedPayNowInPaise > totalDueInPaise
    ) {
      return respond(
        "The payment amount is invalid.",
        500,
        "INVALID_PAYMENT_AMOUNT",
        requestId
      );
    }

    // 5. Reserve slots atomically in the database.
    const { data: reservation, error: reservationError } =
      await admin.rpc("reserve_game_slot_batch_v2", {
        p_game_id: gameId,
        p_quantity: quantity,
        p_payer_user_id: user.id,
        p_participant_names: null,
        p_payment_mode: paymentMode,
      });

    if (reservationError) {
      logFailure("RESERVATION", requestId, reservationError, {
        gameId,
        quantity,
        paymentMode,
      });

      const detail = reservationError.message.toLowerCase();

      if (
        detail.includes("not enough available slots") ||
        detail.includes("not available to join") ||
        detail.includes("game is full") ||
        detail.includes("game not found")
      ) {
        return respond(
          "There are not enough available slots for this booking.",
          409,
          "SLOTS_UNAVAILABLE",
          requestId
        );
      }

      return respond(
        "The booking service could not reserve these slots. Please contact support if this continues.",
        503,
        "BATCH_RESERVATION_UNAVAILABLE",
        requestId
      );
    }

    const batch = Array.isArray(reservation)
      ? reservation[0]
      : reservation;

    if (
      !isRecord(batch) ||
      typeof batch.batchId !== "string" ||
      !UUID.test(batch.batchId) ||
      batch.gameId !== gameId ||
      Number(batch.quantity) !== quantity ||
      batch.paymentMode !== paymentMode ||
      !Number.isFinite(Number(batch.amount)) ||
      !Number.isFinite(Number(batch.totalDue))
    ) {
      logFailure("RESERVATION_VALIDATION", requestId, undefined, {
        gameId,
        quantity,
        paymentMode,
      });

      return respond(
        "The reservation could not be validated. Contact support before retrying.",
        500,
        "RESERVATION_INVALID",
        requestId
      );
    }

    const batchId = batch.batchId;
    reservedBatchId = batchId;

    const amountInPaise = toPaise(batch.amount);
    const totalDueInPaiseFromDb = toPaise(batch.totalDue);

    // Never proceed if the database reservation disagrees with the prices.
    if (
      amountInPaise === null ||
      totalDueInPaiseFromDb === null ||
      amountInPaise !== expectedPayNowInPaise ||
      totalDueInPaiseFromDb !== totalDueInPaise ||
      amountInPaise > totalDueInPaiseFromDb
    ) {
      logFailure("RESERVATION_AMOUNT_MISMATCH", requestId, undefined, {
        gameId,
        batchId,
        paymentMode,
        amountInPaise,
        expectedPayNowInPaise,
        totalDueInPaiseFromDb,
        totalDueInPaise,
      });

      return respond(
        "The reserved payment amount did not match the expected amount. Do not retry; contact support.",
        500,
        "RESERVATION_AMOUNT_MISMATCH",
        requestId,
        { batchId }
      );
    }

    // 6. Create the Razorpay order for the verified amount.
    let order;

    try {
      order = await createRazorpayOrder({
        amount: amountInPaise,
        receipt: batchId,
        notes: {
          booking_type: "multi_slot",
          batch_id: batchId,
          game_id: gameId,
          payer_user_id: user.id,
          quantity: String(quantity),
          payment_mode: paymentMode,
          total_due: (totalDueInPaiseFromDb / 100).toFixed(2),
          booking_amount_per_player:
            bookingFeeInPaise === null
              ? ""
              : (bookingFeeInPaise / 100).toFixed(2),
        },
      });
    } catch (error) {
      logFailure("ORDER_CREATION", requestId, error, {
        gameId,
        batchId,
        quantity,
        paymentMode,
      });

      return respond(
        "Payment setup could not be completed. Do not retry repeatedly; contact support if this continues.",
        502,
        "ORDER_CREATION_FAILED",
        requestId,
        { batchId }
      );
    }

    if (
      !order?.id ||
      order.amount !== amountInPaise ||
      order.currency !== "INR" ||
      order.receipt !== batchId
    ) {
      logFailure("ORDER_VALIDATION", requestId, undefined, {
        gameId,
        batchId,
      });

      return respond(
        "The payment provider returned an unexpected order. Contact support before retrying.",
        502,
        "ORDER_VALIDATION_FAILED",
        requestId,
        { batchId }
      );
    }

    // 7. Attach the order to the reserved batch before exposing checkout.
    const { error: attachError } = await admin.rpc(
      "attach_game_slot_order",
      {
        p_batch_id: batchId,
        p_order_id: order.id,
      }
    );

    if (attachError) {
      logFailure("ORDER_ATTACHMENT", requestId, attachError, {
        gameId,
        batchId,
        orderId: order.id,
      });

      return respond(
        "Payment setup needs support review. Do not attempt another payment.",
        503,
        "ORDER_ATTACHMENT_FAILED",
        requestId,
        { batchId }
      );
    }

    // 8. Return the server-created order and authoritative totals.
    return NextResponse.json(
      {
        ok: true,
        keyId,
        gameId,
        batchId,
        quantity,
        playerFee: feeInPaise / 100,
        bookingAmount:
          bookingFeeInPaise === null
            ? null
            : bookingFeeInPaise / 100,
        paymentMode,
        totalDue: totalDueInPaiseFromDb / 100,
        totalAmount: amountInPaise / 100,
        outstandingBalance:
          (totalDueInPaiseFromDb - amountInPaise) / 100,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
        },
        requestId,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (error) {
    logFailure("UNEXPECTED", requestId, error, {
      batchId: reservedBatchId ?? null,
    });

    return respond(
      "An unexpected error occurred. Check your booking status before retrying.",
      500,
      "UNEXPECTED_ERROR",
      requestId,
      reservedBatchId ? { batchId: reservedBatchId } : {}
    );
  }
}
