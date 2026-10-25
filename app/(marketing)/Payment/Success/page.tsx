import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchRazorpayOrder,
  fetchRazorpayPayment,
} from "@/lib/payments/razorpay";
import GoldenTicket from "@/components/GoldenTicket";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type SearchParams = {
  gamePlayerId?: string;
  batchId?: string;
  gameId?: string;
};

type TicketData = {
  serial: number;
  createdAt: string;
  quantity: number;
  playerFee: number;
};

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { gamePlayerId, batchId, gameId } = await searchParams;

  const hasBatchId = Boolean(batchId);
  const hasPlayerId = Boolean(gamePlayerId);

  if (
    !gameId ||
    hasBatchId === hasPlayerId ||
    (hasBatchId && !isUuid(batchId)) ||
    (hasPlayerId && !isUuid(gamePlayerId)) ||
    !isUuid(gameId)
  ) {
    redirect("/matches");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/Payment/Success?${new URLSearchParams({
      gameId,
      ...(batchId ? { batchId } : {}),
      ...(gamePlayerId ? { gamePlayerId } : {}),
    }).toString()}`;

    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const admin = createAdminClient();

  let confirmed = false;
  let paymentAmount = 0;
  let totalDue = 0;
  let paymentMode: "FULL" | "PARTIAL" | null = null;
  let paymentReference: string | null = null;
  let bookingReference = "";
  let playerCount = 1;
  let ticket: TicketData | null = null;

  if (batchId) {
    const [
      { data: batch, error: batchError },
      { data: slots, error: slotsError },
    ] = await Promise.all([
      admin
        .from("game_payment_batches")
        .select(
          "id, game_id, payer_user_id, provider, provider_order_id, provider_payment_id, amount, total_due, payment_mode, status, currency"
        )
        .eq("id", batchId)
        .eq("payer_user_id", user.id)
        .maybeSingle(),

      admin
        .from("game_slot_bookings")
        .select(
          "id, booking_serial, created_at, status, slot_number, amount_due_now, amount_paid"
        )
        .eq("payment_batch_id", batchId)
        .eq("payer_user_id", user.id)
        .order("slot_number", { ascending: true }),
    ]);

    if (batchError || slotsError || !batch || !slots?.length) {
      redirect(`/matches/${encodeURIComponent(gameId)}`);
    }

    if (batch.game_id !== gameId) {
      redirect("/matches");
    }

    paymentAmount = Number(batch.amount);
    totalDue = Number(batch.total_due);
    paymentMode =
      batch.payment_mode === "PARTIAL" ? "PARTIAL" : "FULL";
    paymentReference = batch.provider_payment_id;
    bookingReference = batch.id;
    playerCount = slots.length;

    const validBatchAmounts =
      Number.isFinite(paymentAmount) &&
      paymentAmount > 0 &&
      Number.isFinite(totalDue) &&
      totalDue >= paymentAmount &&
      slots.every(
        (slot) =>
          Number.isFinite(Number(slot.amount_due_now)) &&
          Number(slot.amount_due_now) >= 0 &&
          Number.isFinite(Number(slot.amount_paid)) &&
          Number(slot.amount_paid) >= 0
      );

    if (
      validBatchAmounts &&
      batch.provider === "razorpay" &&
      batch.currency === "INR" &&
      batch.status === "CAPTURED" &&
      batch.provider_order_id &&
      batch.provider_payment_id &&
      slots.every((slot) => slot.status === "CONFIRMED")
    ) {
      try {
        const [order, payment] = await Promise.all([
          fetchRazorpayOrder(batch.provider_order_id),
          fetchRazorpayPayment(batch.provider_payment_id),
        ]);

        const expectedPaise = Math.round(paymentAmount * 100);

        confirmed =
          Number.isSafeInteger(expectedPaise) &&
          expectedPaise > 0 &&
          order.id === batch.provider_order_id &&
          order.receipt === batch.id &&
          order.amount === expectedPaise &&
          order.currency === "INR" &&
          payment.id === batch.provider_payment_id &&
          payment.order_id === batch.provider_order_id &&
          payment.amount === expectedPaise &&
          payment.currency === "INR" &&
          payment.status === "captured" &&
          payment.captured === true;

        if (confirmed) {
          const firstSlot = slots[0];

          if (
            firstSlot &&
            Number.isSafeInteger(Number(firstSlot.booking_serial)) &&
            Number(firstSlot.booking_serial) > 0
          ) {
            ticket = {
              serial: Number(firstSlot.booking_serial),
              createdAt: firstSlot.created_at,
              quantity: slots.length,
              // The ticket shows the full per-player fee,
              // not just the deposit paid today.
              playerFee: totalDue / slots.length,
            };
          }
        }
      } catch (error) {
        console.error(
          "Live Razorpay batch confirmation failed:",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  } else if (gamePlayerId) {
    const [
      { data: player, error: playerError },
      { data: paymentRecord, error: paymentError },
    ] = await Promise.all([
      admin
        .from("game_players")
        .select("id, status, game_id, booking_serial, created_at")
        .eq("id", gamePlayerId)
        .eq("user_id", user.id)
        .maybeSingle(),

      admin
        .from("game_payments")
        .select(
          "status, amount, provider, provider_order_id, provider_payment_id"
        )
        .eq("game_player_id", gamePlayerId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (
      playerError ||
      paymentError ||
      !player ||
      !paymentRecord ||
      player.game_id !== gameId
    ) {
      redirect(`/matches/${encodeURIComponent(gameId)}`);
    }

    paymentAmount = Number(paymentRecord.amount);
    totalDue = paymentAmount;
    paymentReference = paymentRecord.provider_payment_id;
    bookingReference = player.id;

    if (
      paymentRecord.provider === "razorpay" &&
      paymentRecord.status === "CAPTURED" &&
      paymentRecord.provider_order_id &&
      paymentRecord.provider_payment_id
    ) {
      try {
        const [order, payment] = await Promise.all([
          fetchRazorpayOrder(paymentRecord.provider_order_id),
          fetchRazorpayPayment(paymentRecord.provider_payment_id),
        ]);

        const expectedPaise = Math.round(paymentAmount * 100);

        confirmed =
          Number.isSafeInteger(expectedPaise) &&
          expectedPaise > 0 &&
          order.id === paymentRecord.provider_order_id &&
          order.receipt === player.id &&
          order.amount === expectedPaise &&
          order.currency === "INR" &&
          payment.id === paymentRecord.provider_payment_id &&
          payment.order_id === paymentRecord.provider_order_id &&
          payment.amount === expectedPaise &&
          payment.currency === "INR" &&
          payment.status === "captured" &&
          payment.captured === true &&
          player.status === "CONFIRMED";

        if (
          confirmed &&
          Number.isSafeInteger(Number(player.booking_serial)) &&
          Number(player.booking_serial) > 0
        ) {
          ticket = {
            serial: Number(player.booking_serial),
            createdAt: player.created_at,
            quantity: 1,
            playerFee: paymentAmount,
          };
        }
      } catch (error) {
        console.error(
          "Live Razorpay confirmation failed:",
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  }

  const validAmount =
    Number.isFinite(paymentAmount) && paymentAmount > 0;

  const validTotalDue =
    Number.isFinite(totalDue) && totalDue >= paymentAmount;

  const outstandingBalance = validTotalDue
    ? Math.max(0, totalDue - paymentAmount)
    : 0;

  const displayedStatus = confirmed
    ? "CONFIRMED"
    : "PENDING VERIFICATION";

  const formatRupees = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 900, margin: "0 auto" }}>
        <section className="panel" style={{ padding: 28 }}>
          <div className="label">TURFZY · PAYMENT CONFIRMATION</div>

          <h1 className="display">
            {confirmed
              ? "You're in. Game on."
              : "Your payment is being verified"}
          </h1>

          <p className="muted">
            {confirmed
              ? outstandingBalance > 0
                ? "Your payment has been verified and your booking is confirmed. The remaining balance has not been collected."
                : "Razorpay confirms your payment was captured, and your booking is confirmed."
              : "We could not fully confirm your payment and booking yet. Do not pay again while the status is being checked."}
          </p>

          <div style={{ margin: "24px 0" }}>
            <p className="label">BOOKING STATUS</p>
            <h2>{displayedStatus}</h2>

            {batchId && (
              <>
                <p className="label">PAYMENT MODE</p>
                <h2>
                  {paymentMode === "PARTIAL"
                    ? "FIXED BOOKING AMOUNT"
                    : "FULL PAYMENT"}
                </h2>

                <p className="label">TOTAL BOOKING FEE</p>
                <h2>
                  {validTotalDue
                    ? formatRupees(totalDue)
                    : "Unavailable"}
                </h2>

                <p className="label">AMOUNT PAID NOW</p>
                <h2>
                  {validAmount
                    ? formatRupees(paymentAmount)
                    : "Unavailable"}
                </h2>

                <p className="label">BALANCE REMAINING</p>
                <h2>
                  {validTotalDue
                    ? formatRupees(outstandingBalance)
                    : "Unavailable"}
                </h2>

                <p className="label">PLAYER SLOTS</p>
                <h2>{playerCount}</h2>
              </>
            )}

            {!batchId && (
              <>
                <p className="label">PLAYER FEE</p>
                <h2>
                  {validAmount
                    ? formatRupees(paymentAmount)
                    : "Unavailable"}
                </h2>
              </>
            )}

            <p className="label">BOOKING REFERENCE</p>
            <p style={{ overflowWrap: "anywhere" }}>
              {bookingReference}
            </p>

            <p className="label">PAYMENT REFERENCE</p>
            <p style={{ overflowWrap: "anywhere" }}>
              {paymentReference || "Awaiting payment reference"}
            </p>
          </div>

          {confirmed && ticket && (
            <section style={{ marginTop: 32 }}>
              <div className="label">YOUR OFFICIAL BOOKING TICKET</div>

              <GoldenTicket
                bookingId={`TZ-${new Date(ticket.createdAt).getFullYear()}-${String(
                  ticket.serial
                ).padStart(6, "0")}`}
                bookingDate={ticket.createdAt}
                matchTitle="TURFZY MATCH DAY"
                venue="SEE MATCH DETAILS"
                playerFee={ticket.playerFee}
                quantity={ticket.quantity}
                status="CONFIRMED"
              />
            </section>
          )}

          {confirmed && !ticket && (
            <p className="muted" style={{ marginTop: 16 }}>
              Your payment is verified and your booking is confirmed.
              The ticket serial is not available yet. Keep your booking
              reference; do not pay again.
            </p>
          )}

          <Link
            className="btn green"
            href={`/matches/${encodeURIComponent(gameId)}`}
          >
            VIEW GAME DETAILS
          </Link>

          <Link
            className="btn"
            href="/profile"
            style={{ marginTop: 12 }}
          >
            VIEW MY PROFILE
          </Link>

          {!confirmed && (
            <p className="muted" style={{ marginTop: 16 }}>
              If money has left your account, do not retry the payment.
              Keep your payment reference and contact TURFZY support.
            </p>
          )}

          <p className="muted" style={{ marginTop: 20, fontSize: 13 }}>
            Keep this reference for your records. This confirmation page
            is not a tax invoice.
          </p>
        </section>
      </div>
    </main>
  );
}

function isUuid(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}