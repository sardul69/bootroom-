
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRazorpayPayment } from "@/lib/payments/razorpay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = {
  gamePlayerId?: string;
  gameId?: string;
};

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { gamePlayerId, gameId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!gamePlayerId || !gameId) redirect("/matches");

  const admin = createAdminClient();

  const [
    { data: player, error: playerError },
    { data: payment, error: paymentError },
  ] = await Promise.all([
    admin
      .from("game_players")
      .select("id, status, game_id")
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
    !payment ||
    player.game_id !== gameId
  ) {
    redirect(`/matches/${encodeURIComponent(gameId)}`);
  }

  // Never trust the database status alone to prove that money
  // was captured by Razorpay.
  let razorpayCaptured = false;

  if (
    payment.provider === "razorpay" &&
    payment.status === "CAPTURED" &&
    payment.provider_order_id &&
    payment.provider_payment_id
  ) {
    try {
      const providerPayment = await fetchRazorpayPayment(
        payment.provider_payment_id
      );

      const expectedPaise = Math.round(Number(payment.amount) * 100);

      razorpayCaptured =
        Number.isSafeInteger(expectedPaise) &&
        expectedPaise > 0 &&
        providerPayment.id === payment.provider_payment_id &&
        providerPayment.order_id === payment.provider_order_id &&
        providerPayment.amount === expectedPaise &&
        providerPayment.currency === "INR" &&
        providerPayment.status === "captured" &&
        providerPayment.captured === true;
    } catch (error) {
      // A temporary API error is not proof of a failed payment.
      // Keep the page in the pending state and never claim success.
      console.error(
        "Live Razorpay confirmation check failed:",
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }

  const confirmed =
    razorpayCaptured &&
    player.status === "CONFIRMED";

  const displayedStatus = confirmed
    ? "CONFIRMED"
    : "PENDING VERIFICATION";

  const paymentReference = confirmed
    ? payment.provider_payment_id
    : payment.provider_order_id;

  return (
    <main className="page">
      <div
        className="container"
        style={{ maxWidth: 720, margin: "0 auto" }}
      >
        <section className="panel" style={{ padding: 28 }}>
          <div className="label">
            TURFZY · PAYMENT CONFIRMATION
          </div>

          <h1 className="display">
            {confirmed
              ? "You're in. Game on."
              : "Your payment is being verified"}
          </h1>

          <p className="muted">
            {confirmed
              ? "Razorpay confirms your payment was captured, and your place in this game is confirmed."
              : "We could not fully confirm your payment yet. Please do not pay again. Your booking may need verification."}
          </p>

          <div style={{ margin: "24px 0" }}>
            <p className="label">PAYMENT STATUS</p>
            <h2>{displayedStatus}</h2>

            <p className="label">PLAYER FEE</p>
            <h2>
              ₹{Number(payment.amount).toFixed(2)}
            </h2>

            <p className="label">BOOKING REFERENCE</p>
            <p style={{ overflowWrap: "anywhere" }}>
              {player.id}
            </p>

            <p className="label">PAYMENT REFERENCE</p>
            <p style={{ overflowWrap: "anywhere" }}>
              {paymentReference || "Awaiting payment reference"}
            </p>
          </div>

          <Link
            className="btn green"
            href={`/matches/${encodeURIComponent(gameId)}`}
          >
            VIEW GAME DETAILS
          </Link>

          {!confirmed && (
            <p className="muted" style={{ marginTop: 16 }}>
              If money has left your account, do not retry the payment.
              Contact Turfzy support with your booking reference.
            </p>
          )}

          <p
            className="muted"
            style={{ marginTop: 20, fontSize: 13 }}
          >
            Keep this reference for your records. This confirmation
            page is not a tax invoice.
          </p>
        </section>
      </div>
    </main>
  );
}
