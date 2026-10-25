
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
} from "@/lib/payments/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { ok: false, error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  let admin: ReturnType<typeof createAdminClient> | undefined;
  let bookingId: string | undefined;
  let userId: string | undefined;
  let requestKey: string | undefined;
  let orderCreated = false;
  let createdOrderId: string | undefined;

  try {
    const authClient = await createClient();
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !user) {
      return errorResponse("Sign in required.", 401);
    }

    userId = user.id;

    if (
      !(req.headers.get("content-type") ?? "")
        .toLowerCase()
        .includes("application/json")
    ) {
      return errorResponse("Content-Type must be application/json.", 415);
    }

    const rawBody = await req.text();

    if (!rawBody || rawBody.length > 5_000) {
      return errorResponse("Invalid request body.", 400);
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return errorResponse("Invalid JSON request.", 400);
    }

    if (!isRecord(body) || !isUuid(body.bookingId)) {
      return errorResponse("A valid bookingId is required.", 400);
    }

    bookingId = body.bookingId;
    admin = createAdminClient();

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, user_id, total_amount, status, hold_expires_at")
      .eq("id", bookingId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (bookingError) {
      console.error("Booking lookup failed.", {
        bookingId,
        message: bookingError.message,
      });
      return errorResponse("Unable to check this booking right now.", 500);
    }

    if (!booking) {
      return errorResponse("Booking not found.", 404);
    }

    if (!["HELD", "PAYMENT_PENDING"].includes(booking.status)) {
      return errorResponse("Booking is not payable.", 409);
    }

    if (
      booking.hold_expires_at &&
      new Date(booking.hold_expires_at).getTime() < Date.now()
    ) {
      return errorResponse("Booking hold has expired.", 409);
    }

    const amountPaise = amountInPaise(booking.total_amount);

    if (amountPaise === null) {
      console.error("Invalid booking amount.", { bookingId });
      return errorResponse("Booking amount is invalid.", 500);
    }

    const { data: claimRows, error: claimError } = await admin.rpc(
      "claim_razorpay_order_creation_v2",
      {
        p_booking_id: bookingId,
        p_user_id: user.id,
      }
    );

    if (claimError || !Array.isArray(claimRows) || claimRows.length !== 1) {
      console.error("Order claim failed.", {
        bookingId,
        message: claimError?.message,
      });
      return errorResponse("Unable to safely start checkout.", 500);
    }

    const claim = claimRows[0] as {
      claim_is_new: boolean;
      claim_state: string;
      claim_request_key: string;
      claim_order_id: string | null;
    };

    requestKey = claim.claim_request_key;

    if (claim.claim_state === "CREATED" && claim.claim_order_id) {
      const { data: existingPayment, error: existingPaymentError } =
        await admin
          .from("payments")
          .select(
            "booking_id, user_id, provider, provider_order_id, provider_payment_id, amount, status"
          )
          .eq("booking_id", bookingId)
          .maybeSingle();

      if (
        existingPaymentError ||
        !existingPayment ||
        existingPayment.user_id !== user.id ||
        existingPayment.provider !== "razorpay" ||
        existingPayment.provider_order_id !== claim.claim_order_id
      ) {
        console.error("Existing order association needs reconciliation.", {
          bookingId,
          message: existingPaymentError?.message,
        });
        return errorResponse(
          "Existing payment needs reconciliation. Do not pay again.",
          409
        );
      }

      if (
        existingPayment.status === "CAPTURED" ||
        existingPayment.provider_payment_id
      ) {
        return errorResponse(
          "A payment is already recorded for this booking. Check its status before retrying.",
          409
        );
      }

      const existingAmountPaise = amountInPaise(existingPayment.amount);

      if (existingAmountPaise !== amountPaise) {
        return errorResponse(
          "Existing payment amount mismatch. Contact support.",
          409
        );
      }

      let existingOrder;

      try {
        existingOrder = await fetchRazorpayOrder(claim.claim_order_id);
      } catch (error) {
        console.error("Existing Razorpay order lookup failed.", {
          bookingId,
          message: error instanceof Error ? error.message : "Unknown error",
        });

        return errorResponse(
          "Existing order status could not be verified. Do not pay again.",
          503
        );
      }

      if (
        existingOrder.id !== claim.claim_order_id ||
        existingOrder.receipt !== bookingId ||
        existingOrder.amount !== amountPaise ||
        existingOrder.currency !== "INR"
      ) {
        return errorResponse(
          "Existing Razorpay order does not match this booking.",
          409
        );
      }

      if (
        existingOrder.status === "paid" ||
        existingOrder.amount_due !== amountPaise
      ) {
        return errorResponse(
          "This order may already have a payment attempt. Verify its status before proceeding.",
          409
        );
      }

      const keyId = process.env.RAZORPAY_KEY_ID;

      if (!keyId) {
        return errorResponse("Checkout is temporarily unavailable.", 503);
      }

      return NextResponse.json(
        { ok: true, keyId, order: existingOrder, reused: true },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!claim.claim_is_new || claim.claim_state !== "CREATING") {
      return errorResponse(
        "An order creation is already in progress or needs reconciliation. Do not pay again.",
        409
      );
    }

    // Only the request that inserted the new claim reaches this point.
    // Any ambiguous failure after this point leaves the claim non-reusable.
    let order;

    try {
      order = await createRazorpayOrder({
        amount: amountPaise,
        receipt: bookingId,
        notes: {
          booking_id: bookingId,
          user_id: user.id,
        },
      });
      orderCreated = true;
      createdOrderId = order.id;
    } catch (error) {
      // A timeout or connection failure does not prove that Razorpay
      // failed to create the order. Mark the outcome uncertain.
      const { error: claimUpdateError } = await admin.rpc(
        "update_razorpay_order_claim",
        {
          p_booking_id: bookingId,
          p_user_id: user.id,
          p_request_key: requestKey,
          p_new_state: "UNCERTAIN",
          p_provider_order_id: null,
        }
      );

      console.error("Razorpay order creation outcome is uncertain.", {
        bookingId,
        claimUpdateError: claimUpdateError?.message,
        message: error instanceof Error ? error.message : "Unknown error",
      });

      return errorResponse(
        "Order creation could not be confirmed. Do not retry payment; support must reconcile the order.",
        503
      );
    }

    if (
      !order ||
      order.amount !== amountPaise ||
      order.currency !== "INR" ||
      order.receipt !== bookingId
    ) {
      const { error: claimUpdateError } = await admin.rpc(
        "update_razorpay_order_claim",
        {
          p_booking_id: bookingId,
          p_user_id: user.id,
          p_request_key: requestKey,
          p_new_state: "UNCERTAIN",
          p_provider_order_id: order?.id ?? null,
        }
      );

      console.error("Created Razorpay order failed validation.", {
        bookingId,
        orderId: order?.id,
        claimUpdateError: claimUpdateError?.message,
      });

      return errorResponse(
        "The created order could not be validated. Do not retry payment; contact support.",
        502
      );
    }

    const { data: latestBooking, error: latestBookingError } = await admin
      .from("bookings")
      .select("id, user_id, status, total_amount, hold_expires_at")
      .eq("id", bookingId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      latestBookingError ||
      !latestBooking ||
      !["HELD", "PAYMENT_PENDING"].includes(latestBooking.status) ||
      (latestBooking.hold_expires_at &&
        new Date(latestBooking.hold_expires_at).getTime() < Date.now()) ||
      amountInPaise(latestBooking.total_amount) !== amountPaise
    ) {
      const { error: claimUpdateError } = await admin.rpc(
        "update_razorpay_order_claim",
        {
          p_booking_id: bookingId,
          p_user_id: user.id,
          p_request_key: requestKey,
          p_new_state: "UNCERTAIN",
          p_provider_order_id: order.id,
        }
      );

      console.error("Booking changed while creating order.", {
        bookingId,
        orderId: order.id,
        claimUpdateError: claimUpdateError?.message,
      });

      return errorResponse(
        "Booking changed while creating the order. Do not pay; contact support.",
        409
      );
    }

    const { data: existingPayment, error: paymentLookupError } = await admin
      .from("payments")
      .select("id, status, provider_order_id, provider_payment_id")
      .eq("booking_id", bookingId)
      .maybeSingle();

    if (paymentLookupError) {
      const { error: claimUpdateError } = await admin.rpc(
        "update_razorpay_order_claim",
        {
          p_booking_id: bookingId,
          p_user_id: user.id,
          p_request_key: requestKey,
          p_new_state: "UNCERTAIN",
          p_provider_order_id: order.id,
        }
      );

      console.error("Could not inspect existing payment.", {
        bookingId,
        orderId: order.id,
        claimUpdateError: claimUpdateError?.message,
      });

      return errorResponse(
        "Order was created but its payment record needs reconciliation. Do not pay again.",
        500
      );
    }

    if (
      existingPayment?.status === "CAPTURED" ||
      existingPayment?.provider_payment_id
    ) {
      const { error: claimUpdateError } = await admin.rpc(
        "update_razorpay_order_claim",
        {
          p_booking_id: bookingId,
          p_user_id: user.id,
          p_request_key: requestKey,
          p_new_state: "UNCERTAIN",
          p_provider_order_id: order.id,
        }
      );

      console.error("Captured payment exists; new order not attached.", {
        bookingId,
        orderId: order.id,
        claimUpdateError: claimUpdateError?.message,
      });

      return errorResponse(
        "A payment is already recorded. The new order needs reconciliation; do not pay again.",
        409
      );
    }

    if (
      existingPayment?.provider_order_id &&
      existingPayment.provider_order_id !== order.id
    ) {
      const { error: claimUpdateError } = await admin.rpc(
        "update_razorpay_order_claim",
        {
          p_booking_id: bookingId,
          p_user_id: user.id,
          p_request_key: requestKey,
          p_new_state: "UNCERTAIN",
          p_provider_order_id: order.id,
        }
      );

      console.error("Another order is already attached to the booking.", {
        bookingId,
        newOrderId: order.id,
        existingOrderId: existingPayment.provider_order_id,
        claimUpdateError: claimUpdateError?.message,
      });

      return errorResponse(
        "A different order is already attached. Do not pay again; contact support.",
        409
      );
    }

    const { error: paymentSaveError } = await admin.from("payments").upsert(
      {
        booking_id: bookingId,
        user_id: user.id,
        provider: "razorpay",
        provider_order_id: order.id,
        amount: latestBooking.total_amount,
        status: "CREATED",
      },
      { onConflict: "booking_id" }
    );

    if (paymentSaveError) {
      const { error: claimUpdateError } = await admin.rpc(
        "update_razorpay_order_claim",
        {
          p_booking_id: bookingId,
          p_user_id: user.id,
          p_request_key: requestKey,
          p_new_state: "UNCERTAIN",
          p_provider_order_id: order.id,
        }
      );

      console.error("Order created but payment save failed.", {
        bookingId,
        orderId: order.id,
        paymentSaveError: paymentSaveError.message,
        claimUpdateError: claimUpdateError?.message,
      });

      return errorResponse(
        "Order was created but could not be safely attached. Do not pay again; contact support.",
        500
      );
    }

    const { error: claimUpdateError } = await admin.rpc(
      "update_razorpay_order_claim",
      {
        p_booking_id: bookingId,
        p_user_id: user.id,
        p_request_key: requestKey,
        p_new_state: "CREATED",
        p_provider_order_id: order.id,
      }
    );

    if (claimUpdateError) {
      console.error("Order saved but claim finalization failed.", {
        bookingId,
        orderId: order.id,
        message: claimUpdateError.message,
      });

      return errorResponse(
        "Order was created but its state needs reconciliation. Do not pay again.",
        500
      );
    }

    const { error: bookingUpdateError } = await admin
      .from("bookings")
      .update({ status: "PAYMENT_PENDING" })
      .eq("id", bookingId)
      .eq("user_id", user.id)
      .in("status", ["HELD", "PAYMENT_PENDING"]);

    if (bookingUpdateError) {
      console.error("Booking status update failed after order creation.", {
        bookingId,
        orderId: order.id,
        message: bookingUpdateError.message,
      });

      return errorResponse(
        "Order was created but booking state needs reconciliation. Do not pay again.",
        500
      );
    }

    const keyId = process.env.RAZORPAY_KEY_ID;

    if (!keyId) {
      return errorResponse(
        "Checkout is unavailable. The created order must be reconciled; do not retry payment.",
        503
      );
    }

    return NextResponse.json(
      { ok: true, keyId, order, reused: false },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Payment order route failed.", {
      bookingId,
      orderId: createdOrderId,
      orderCreated,
      message: error instanceof Error ? error.message : "Unknown error",
    });

    // Never reset or release a claim automatically here. The failure may
    // have occurred after Razorpay created the order.
    return errorResponse(
      "Payment order processing failed. Do not pay again until the order is reconciled.",
      500
    );
  }
}
