import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRazorpayOrder } from "@/lib/payments/razorpay";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();
    if (authError || !user) {
      return errorResponse("Please sign in to join this game.", 401);
    }
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return errorResponse("Content-Type must be application/json.", 415);
    }
    const raw = await req.text();
    if (!raw || raw.length > 10_000) {
      return errorResponse("Invalid request body.", 400);
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return errorResponse("Invalid JSON request.", 400);
    }
    if (
      !isRecord(body) ||
      typeof body.gameId !== "string" ||
      !UUID.test(body.gameId) ||
      !Number.isInteger(body.quantity) ||
      (body.quantity as number) < 1 ||
      (body.quantity as number) > 10
    ) {
      return errorResponse("A valid game ID and quantity from 1 to 10 are required.", 400);
    }
    let participantNames: string[] | null = null;
    if (body.participantNames !== undefined) {
      if (
        !Array.isArray(body.participantNames) ||
        body.participantNames.length > (body.quantity as number) ||
        !body.participantNames.every(
          (name) =>
            typeof name === "string" &&
            name.trim().length <= 100
        )
      ) {
        return errorResponse("Participant names are invalid.", 400);
      }
      participantNames = body.participantNames.map((name) => name.trim());
    }
    const keyId = process.env.RAZORPAY_KEY_ID?.trim();
    const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
    const expectedMode = process.env.RAZORPAY_EXPECTED_MODE?.trim();
    if (
      !keyId ||
      !keySecret ||
      (expectedMode !== "live" && expectedMode !== "test") ||
      !keyId.startsWith(`rzp_${expectedMode}_`)
    ) {
      return errorResponse("Payments are temporarily unavailable.", 503);
    }
    const admin = createAdminClient();
    // The database function locks the game row and reserves capacity atomically.
    // The trusted server supplies the authenticated payer ID.
    const { data: reservation, error: reserveError } = await admin.rpc(
      "reserve_game_slot_batch",
      {
        p_game_id: body.gameId,
        p_quantity: body.quantity,
        p_participant_names: participantNames,
        p_payer_user_id: user.id,
      }
    );
    if (reserveError || !isRecord(reservation)) {
      console.error("Slot reservation failed:", reserveError?.message);
      return errorResponse(
        "Unable to reserve these places. The game may be full or unavailable.",
        409
      );
    }
    const batchId = reservation.batchId;
    const amount = Number(reservation.amount);
    const amountInPaise = Math.round(amount * 100);
    if (
      typeof batchId !== "string" ||
      !UUID.test(batchId) ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(amountInPaise) ||
      Math.abs(amount * 100 - amountInPaise) > 1e-7
    ) {
      console.error("Invalid reservation response:", { batchId, amount });
      return errorResponse("The reservation could not be processed safely.", 500);
    }
    // Do not trust a client-supplied price; use the amount returned by SQL.
    const order = await createRazorpayOrder({
      amount: amountInPaise,
      
      receipt: batchId,
    });
    if (
      !order ||
      typeof order.id !== "string" ||
      !order.id.startsWith("order_") ||
      order.amount !== amountInPaise ||
      order.currency !== "INR"
    ) {
      console.error("Razorpay returned an invalid order for batch:", batchId);
      return errorResponse(
        "The payment order could not be validated. Contact support before retrying.",
        502
      );
    }
    const { error: attachError } = await admin.rpc("attach_game_slot_order", {
      p_batch_id: batchId,
      p_order_id: order.id,
    });
    if (attachError) {
      console.error("Unable to attach Razorpay order:", {
        batchId,
        orderId: order.id,
        error: attachError.message,
      });
      // An order may already exist at Razorpay. Do not silently create another.
      return errorResponse(
        "The payment order needs reconciliation. Do not retry payment; contact support.",
        503
      );
    }
    return NextResponse.json(
      {
        ok: true,
        batchId,
        gameId: body.gameId,
        quantity: body.quantity,
        amount,
        currency: "INR",
        razorpayOrderId: order.id,
        razorpayKeyId: keyId,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error(
      "Multi-slot booking start failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return errorResponse("Unable to start this booking. Please contact support if an order may have been created.", 500);
  }
}