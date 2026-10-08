import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRazorpaySignature } from "@/lib/payments/razorpay";

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

    const body = await req.json();

    const {
      gamePlayerId,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
    } = body;

    if (
      !gamePlayerId ||
      !razorpayPaymentId ||
      !razorpayOrderId ||
      !razorpaySignature
    ) {
      return NextResponse.json(
        { error: "Missing payment details" },
        { status: 400 }
      );
    }

    const validSignature = verifyRazorpaySignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!validSignature) {
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { data: gamePayment, error: paymentError } = await supabase
      .from("game_payments")
      .select("id, game_player_id, user_id, provider_order_id")
      .eq("game_player_id", gamePlayerId)
      .eq("user_id", user.id)
      .eq("provider_order_id", razorpayOrderId)
      .single();

    if (paymentError || !gamePayment) {
      return NextResponse.json(
        { error: "Game payment record not found" },
        { status: 404 }
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
      console.error("Game payment finalization failed:", finalizeError);

      return NextResponse.json(
        { error: "Unable to confirm game payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Game payment verification error:", error);

    return NextResponse.json(
      { error: "Payment verification failed" },
      { status: 500 }
    );
  }
}