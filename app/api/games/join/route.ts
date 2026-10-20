
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respond(
  message: string,
  status: number,
  code: string,
  requestId: string,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      code,
      requestId,
      ...extra,
    },
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

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

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

    // 2. Validate the request.
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

    const gameId = body.gameId;

    // 3. Validate the Razorpay environment.
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

    // 4. Read the authoritative game price.
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
      .select("id, player_fee, player_capacity, status, slot_start")
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

    if (
      game.status !== "OPEN" ||
      !game.slot_start ||
      !Number.isFinite(new Date(game.slot_start).getTime()) ||
      new Date(game.slot_start).getTime() <= Date.now()
    ) {
      return respond(
        "This game is no longer available to join.",
        409,
        "GAME_UNAVAILABLE",
        requestId
      );
    }

    const fee = Number(game.player_fee);
    const feeInPaise = Math.round(fee * 100);
    const totalInPaise = feeInPaise * quantity;

    if (
      !Number.isFinite(fee) ||
      fee <= 0 ||
      !Number.isSafeInteger(feeInPaise) ||
      feeInPaise <= 0 ||
      Math.abs(fee * 100 - feeInPaise) > 1e-7 ||
      !Number.isSafeInteger(totalInPaise) ||
      totalInPaise <= 0
    ) {
      logFailure("INVALID_FEE", requestId, undefined, { gameId });

      return respond(
        "The player fee is invalid. Please contact support.",
        500,
        "INVALID_PLAYER_FEE",
        requestId
      );
    }

    // 5. Reserve the requested slots atomically.
    // The RPC must check capacity while locking the game row.
    const { data: reservation, error: reservationError } = await admin.rpc(
      "reserve_game_slot_batch",
      {
        p_game_id: gameId,
        p_quantity: quantity,
        p_payer_user_id: user.id,
        p_participant_names: null,
      }
    );

    if (reservationError) {
      logFailure("RESERVATION", requestId, reservationError, {
        gameId,
        quantity,
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

      // A missing migration/function is a server setup issue, not a reason
      // to silently fall back to the legacy single-player payment flow.
      return respond(
        "Multi-player booking is not ready yet. Please contact support.",
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
      Math.round(Number(batch.amount) * 100) !== totalInPaise
    ) {
      logFailure("RESERVATION_VALIDATION", requestId, undefined, {
        gameId,
        quantity,
      });

      return respond(
        "The reservation could not be validated. Contact support before retrying.",
        500,
        "RESERVATION_INVALID",
        requestId
      );
    }

    const batchId = batch.batchId;

    // 6. Create one provider order for the full batch.
    let order;

    try {
      order = await createRazorpayOrder({
        amount: totalInPaise,
        receipt: batchId,
        notes: {
          booking_type: "multi_slot",
          batch_id: batchId,
          game_id: gameId,
          payer_user_id: user.id,
          quantity: String(quantity),
        },
      });
    } catch (error) {
      logFailure("ORDER_CREATION", requestId, error, {
        gameId,
        batchId,
        quantity,
      });

      // The batch may still have a live hold. Do not automatically create
      // another batch/order; resolve this reservation before retrying.
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
      order.amount !== totalInPaise ||
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

    // 7. Persist the order-to-batch association before returning it.
    const { error: attachError } = await admin.rpc("attach_game_slot_order", {
      p_batch_id: batchId,
      p_order_id: order.id,
    });

    if (attachError) {
      logFailure("ORDER_ATTACHMENT", requestId, attachError, {
        gameId,
        batchId,
        orderId: order.id,
      });

      // Do not expose an order whose association was not persisted.
      // The order and batch need reconciliation rather than a second charge.
      return respond(
        "Payment setup needs support review. Do not attempt another payment.",
        503,
        "ORDER_ATTACHMENT_FAILED",
        requestId,
        { batchId }
      );
    }

    // 8. Return the verified server-created order.
    return NextResponse.json(
      {
        ok: true,
        keyId,
        gameId,
        batchId,
        quantity,
        playerFee: fee,
        totalAmount: totalInPaise / 100,
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
    logFailure("UNEXPECTED", requestId, error);

    return respond(
      "An unexpected error occurred. Check your booking status before retrying.",
      500,
      "UNEXPECTED_ERROR",
      requestId
    );
  }
}
