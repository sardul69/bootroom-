
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder } from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FailureStage =
  | "AUTH"
  | "REQUEST"
  | "CONFIG"
  | "GAME_LOOKUP"
  | "GAME_VALIDATION"
  | "JOIN_GAME"
  | "PAYMENT_LOOKUP"
  | "ORDER_CREATION"
  | "ORDER_VALIDATION"
  | "PAYMENT_PERSISTENCE"
  | "UNEXPECTED";

function jsonError(
  stage: FailureStage,
  message: string,
  status: number,
  requestId: string
) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      diagnosticCode: stage,
      requestId,
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function logFailure(
  stage: FailureStage,
  requestId: string,
  error?: unknown,
  extra: Record<string, string | number | boolean | null> = {}
) {
  // Never log secrets, request bodies, signatures, or payment credentials.
  console.error(
    JSON.stringify({
      event: "turfzy_payment_start_failure",
      stage,
      requestId,
      error:
        error instanceof Error
          ? error.message
          : error == null
            ? undefined
            : String(error),
      ...extra,
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  try {
    // 1. Authenticate the player.
    let authClient;

    try {
      authClient = await createClient();
    } catch (error) {
      logFailure("AUTH", requestId, error);
      return jsonError(
        "AUTH",
        "Unable to check your sign-in session.",
        503,
        requestId
      );
    }

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      if (authError) logFailure("AUTH", requestId, authError);
      return jsonError(
        "AUTH",
        "Please sign in to join this game.",
        401,
        requestId
      );
    }

    // 2. Validate the request.
    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return jsonError(
        "REQUEST",
        "Invalid JSON request.",
        400,
        requestId
      );
    }

    if (
      !isRecord(body) ||
      typeof body.gameId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.gameId
      )
    ) {
      return jsonError(
        "REQUEST",
        "A valid game ID is required.",
        400,
        requestId
      );
    }

    const gameId = body.gameId;

    // 3. Check the expected Razorpay environment.
    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const expectedMode = process.env.RAZORPAY_EXPECTED_MODE?.trim();

    if (
      !keyId ||
      !process.env.RAZORPAY_KEY_SECRET?.trim() ||
      (expectedMode !== "live" && expectedMode !== "test") ||
      !keyId.startsWith(`rzp_${expectedMode}_`)
    ) {
      logFailure("CONFIG", requestId, undefined, {
        keyIdPresent: Boolean(keyId),
        keySecretPresent: Boolean(process.env.RAZORPAY_KEY_SECRET?.trim()),
        expectedModeValid: expectedMode === "live" || expectedMode === "test",
        keyModeMatches:
          Boolean(keyId) &&
          (expectedMode === "live" || expectedMode === "test") &&
          keyId!.startsWith(`rzp_${expectedMode}_`),
      });

      return jsonError(
        "CONFIG",
        "Payments are temporarily unavailable because the payment configuration is invalid.",
        503,
        requestId
      );
    }

    let supabase;

    try {
      supabase = createAdminClient();
    } catch (error) {
      logFailure("GAME_LOOKUP", requestId, error);
      return jsonError(
        "GAME_LOOKUP",
        "Unable to load this game.",
        503,
        requestId
      );
    }

    // 4. Read the authoritative game fee.
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, player_fee, status")
      .eq("id", gameId)
      .maybeSingle();

    if (gameError) {
      logFailure("GAME_LOOKUP", requestId, gameError);
      return jsonError(
        "GAME_LOOKUP",
        "Unable to load this game.",
        500,
        requestId
      );
    }

    if (!game) {
      return jsonError("GAME_LOOKUP", "Game not found.", 404, requestId);
    }

    if (game.status !== "OPEN") {
      return jsonError(
        "GAME_VALIDATION",
        "This game is no longer open.",
        409,
        requestId
      );
    }

    const amount = Number(game.player_fee);
    const amountInPaise = Math.round(amount * 100);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(amountInPaise) ||
      amountInPaise <= 0 ||
      Math.abs(amount * 100 - amountInPaise) > 1e-7
    ) {
      logFailure("GAME_VALIDATION", requestId, undefined, { gameId });
      return jsonError(
        "GAME_VALIDATION",
        "This game's player fee is invalid.",
        500,
        requestId
      );
    }

    // 5. Create or retrieve the pending player entry.
    const { data: playerResult, error: joinError } =
      await authClient.rpc("join_game", {
        p_game_id: game.id,
        p_user_id: user.id,
      });

    if (joinError || !playerResult) {
      logFailure("JOIN_GAME", requestId, joinError, { gameId });
      return jsonError(
        "JOIN_GAME",
        "Unable to reserve your place in this game.",
        409,
        requestId
      );
    }

    const playerRow = Array.isArray(playerResult)
      ? playerResult[0]
      : playerResult;

    if (!playerRow?.id || typeof playerRow.id !== "string") {
      logFailure("JOIN_GAME", requestId, undefined, { gameId });
      return jsonError(
        "JOIN_GAME",
        "Unable to prepare your game entry.",
        500,
        requestId
      );
    }

    // 6. Check the existing payment before creating any new order.
    const { data: existingPayment, error: paymentLookupError } =
      await supabase
        .from("game_payments")
        .select("id, user_id, provider, provider_order_id, amount, status")
        .eq("game_player_id", playerRow.id)
        .maybeSingle();

    if (paymentLookupError) {
      logFailure("PAYMENT_LOOKUP", requestId, paymentLookupError, {
        gamePlayerId: playerRow.id,
      });
      return jsonError(
        "PAYMENT_LOOKUP",
        "Unable to check your existing payment.",
        500,
        requestId
      );
    }

    if (existingPayment) {
      if (
        existingPayment.user_id !== user.id ||
        existingPayment.provider !== "razorpay"
      ) {
        return jsonError(
          "PAYMENT_LOOKUP",
          "Payment record does not match this player.",
          409,
          requestId
        );
      }

      if (existingPayment.status === "CAPTURED") {
        return NextResponse.json(
          {
            ok: false,
            error: "Payment is already recorded. Check your booking.",
            paymentCaptured: true,
            requestId,
          },
          {
            status: 409,
            headers: { "Cache-Control": "no-store" },
          }
        );
      }

      if (
        existingPayment.provider_order_id &&
        existingPayment.status === "CREATED"
      ) {
        const storedPaise = Math.round(Number(existingPayment.amount) * 100);

        if (
          !Number.isSafeInteger(storedPaise) ||
          storedPaise !== amountInPaise
        ) {
          logFailure("PAYMENT_LOOKUP", requestId, undefined, {
            gamePlayerId: playerRow.id,
          });
          return jsonError(
            "PAYMENT_LOOKUP",
            "Your existing payment needs support review.",
            409,
            requestId
          );
        }

        return NextResponse.json(
          {
            keyId,
            order: {
              id: existingPayment.provider_order_id,
              amount: storedPaise,
              currency: "INR",
            },
            gamePlayerId: playerRow.id,
            requestId,
          },
          { headers: { "Cache-Control": "no-store" } }
        );
      }

      return jsonError(
        "PAYMENT_LOOKUP",
        "Your previous payment needs verification before retrying.",
        409,
        requestId
      );
    }

    // 7. Create the Razorpay order.
    let order;

    try {
      order = await createRazorpayOrder({
        amount: amountInPaise,
        receipt: playerRow.id,
        notes: {
          game_id: game.id,
          game_player_id: playerRow.id,
          user_id: user.id,
        },
      });
    } catch (error) {
      logFailure("ORDER_CREATION", requestId, error, {
        gameId,
        gamePlayerId: playerRow.id,
      });

      return jsonError(
        "ORDER_CREATION",
        "Unable to start payment. Please contact support if this continues.",
        502,
        requestId
      );
    }

    if (
      !order?.id ||
      order.amount !== amountInPaise ||
      order.currency !== "INR" ||
      order.receipt !== playerRow.id
    ) {
      logFailure("ORDER_VALIDATION", requestId, undefined, {
        gameId,
        gamePlayerId: playerRow.id,
      });

      return jsonError(
        "ORDER_VALIDATION",
        "The payment provider returned an unexpected order.",
        502,
        requestId
      );
    }

    // 8. Persist the order before making it available to the browser.
    const { error: insertError } = await supabase
      .from("game_payments")
      .insert({
        game_player_id: playerRow.id,
        user_id: user.id,
        provider: "razorpay",
        provider_order_id: order.id,
        amount,
        status: "CREATED",
      });

    if (insertError) {
      // Do not create another order automatically. Reconciliation is required.
      logFailure("PAYMENT_PERSISTENCE", requestId, insertError, {
        gameId,
        gamePlayerId: playerRow.id,
        orderId: order.id,
      });

      return jsonError(
        "PAYMENT_PERSISTENCE",
        "Payment setup needs support review. Do not retry repeatedly.",
        500,
        requestId
      );
    }

    return NextResponse.json(
      {
        keyId,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
        },
        gamePlayerId: playerRow.id,
        requestId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logFailure("UNEXPECTED", requestId, error);

    return jsonError(
      "UNEXPECTED",
      "An unexpected error occurred while preparing payment.",
      500,
      requestId
    );
  }
}
