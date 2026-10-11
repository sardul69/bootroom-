
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyRazorpaySignature,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Sign in required" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);

    const {
      gamePlayerId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = body ?? {};

    if (
      typeof gamePlayerId !== "string" ||
      typeof razorpayPaymentId !== "string" ||
      typeof razorpayOrderId !== "string" ||
      typeof razorpaySignature !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing or invalid payment details" },
        { status: 400 }
      );
    }

    if (
      !verifyRazorpaySignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      )
    ) {
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: paymentRecord, error: recordError } =
      await supabase
        .from("game_payments")
        .select(
          "id, game_player_id, user_id, provider_order_id, amount, status"
        )
        .eq("game_player_id", gamePlayerId)
        .eq("user_id", user.id)
        .eq("provider_order_id", razorpayOrderId)
        .maybeSingle();

    if (recordError || !paymentRecord) {
      return NextResponse.json(
        { error: "Matching payment record not found" },
        { status: 404 }
      );
    }

    const { data: player, error: playerError } =
      await supabase
        .from("game_players")
        .select("id, game_id, user_id, status")
        .eq("id", gamePlayerId)
        .eq("user_id", user.id)
        .maybeSingle();

    if (playerError || !player) {
      return NextResponse.json(
        { error: "Matching player record not found" },
        { status: 404 }
      );
    }

    const [order, payment] = await Promise.all([
      fetchRazorpayOrder(razorpayOrderId),
      fetchRazorpayPayment(razorpayPaymentId),
    ]);

    const expectedAmount = Math.round(
      Number(paymentRecord.amount) * 100
    );

    if (
      !Number.isSafeInteger(expectedAmount) ||
      expectedAmount <= 0 ||
      order.id !== razorpayOrderId ||
      order.amount !== expectedAmount ||
      order.currency !== "INR" ||
      payment.id !== razorpayPaymentId ||
      payment.order_id !== razorpayOrderId ||
      payment.amount !== expectedAmount ||
      payment.currency !== "INR" ||
      payment.status !== "captured" ||
      payment.captured !== true
    ) {
      return NextResponse.json(
        { error: "Payment does not match the expected captured order" },
        { status: 409 }
      );
    }

    const { error: finalizeError } = await supabase.rpc(
      "finalize_game_payment",
      {
        p_game_player_id: gamePlayerId,
        p_provider_payment_id: razorpayPaymentId,
        p_signature: razorpaySignature,
      }
    );

    if (finalizeError) {
      console.error(
        "Game payment finalization failed:",
        finalizeError.message
      );

      return NextResponse.json(
        {
          error:
            "Payment was verified, but confirmation is pending. Do not pay again.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(
      "Game payment verification failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      {
        error:
          "Unable to verify payment right now. Do not pay again.",
      },
      { status: 500 }
    );
  }
}
