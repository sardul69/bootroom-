import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    gamePlayerId?: string;
    gameId?: string;
  }>;
}) {
  const { gamePlayerId, gameId } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!gamePlayerId || !gameId) redirect("/matches");

  // Server-side reads, with ownership checks below.
  const admin = createAdminClient();

  const { data: player, error: playerError } = await admin
    .from("game_players")
    .select("id, status, game_id")
    .eq("id", gamePlayerId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: payment, error: paymentError } = await admin
    .from("game_payments")
    .select("status, amount, provider_order_id, provider_payment_id")
    .eq("game_player_id", gamePlayerId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (playerError || paymentError || !player || !payment ||
      player.game_id !== gameId) {
    redirect(`/matches/${gameId}`);
  }

  const confirmed =
    payment.status === "CAPTURED" &&
    player.status === "CONFIRMED";

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 720, margin: "0 auto" }}>
        <section className="panel" style={{ padding: 28 }}>
          <div className="label">TURFZY · PAYMENT CONFIRMATION</div>

          <h1 className="display">
            {confirmed
              ? "You're in. Game on."
              : "Payment is being verified"}
          </h1>

          <p className="muted">
            {confirmed
              ? "Your payment is verified and your place in this game is confirmed."
              : "Please don't pay again. Your payment is not yet fully confirmed."}
          </p>

          <div style={{ margin: "24px 0" }}>
            <p className="label">PAYMENT STATUS</p>
            <h2>{confirmed ? "CONFIRMED" : payment.status}</h2>

            <p className="label">PLAYER FEE</p>
            <h2>₹{Number(payment.amount).toFixed(2)}</h2>

            <p className="label">BOOKING REFERENCE</p>
            <p style={{ overflowWrap: "anywhere" }}>{player.id}</p>

            <p className="label">PAYMENT REFERENCE</p>
            <p style={{ overflowWrap: "anywhere" }}>
              {payment.provider_payment_id || payment.provider_order_id}
            </p>
          </div>

          <Link className="btn green" href={`/matches/${gameId}`}>
            VIEW GAME DETAILS
          </Link>

          <p className="muted" style={{ marginTop: 20, fontSize: 13 }}>
            Keep this reference for your records. This confirmation page is
            not a tax invoice.
          </p>
        </section>
      </div>
    </main>
  );
}
