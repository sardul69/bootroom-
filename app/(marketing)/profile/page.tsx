
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Pass = {
  key: string;
  gameId: string;
  createdAt: string;
  serial: number | null;
  quantity: number;
  amount: number;
  paymentReference: string | null;
};

function passSerial(serial: number | string | null, createdAt: string) {
  const value = Number(serial);
  if (!Number.isSafeInteger(value) || value <= 0) return "Serial pending";

  return `TZ-${new Date(createdAt).getFullYear()}-${String(value).padStart(6, "0")}`;
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const [
    { data: slots, error: slotsError },
    { data: batches, error: batchesError },
    { data: players, error: playersError },
    { data: payments, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from("game_slot_bookings")
      .select(
        "id, game_id, payment_batch_id, booking_serial, created_at, status, slot_number"
      )
      .eq("payer_user_id", user.id)
      .eq("status", "CONFIRMED")
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("game_payment_batches")
      .select(
        "id, game_id, amount, status, provider_payment_id, created_at"
      )
      .eq("payer_user_id", user.id)
      .eq("status", "CAPTURED")
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("game_players")
      .select("id, game_id, booking_serial, created_at, status")
      .eq("user_id", user.id)
      .eq("status", "CONFIRMED")
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("game_payments")
      .select(
        "game_player_id, amount, status, provider_payment_id"
      )
      .eq("user_id", user.id)
      .eq("status", "CAPTURED")
      .limit(100),
  ]);

  if (slotsError || batchesError || playersError || paymentsError) {
    console.error("Booking Pass lookup failed:", {
      slots: slotsError?.message,
      batches: batchesError?.message,
      players: playersError?.message,
      payments: paymentsError?.message,
    });
  }

  const safeSlots = slots || [];
  const safeBatches = batches || [];
  const safePlayers = players || [];
  const safePayments = payments || [];

  const passes: Pass[] = [];
  const capturedBatchIds = new Set(safeBatches.map((b) => b.id));

  // One Booking Pass represents a multi-slot checkout.
  const slotsByBatch = new Map<string, typeof safeSlots>();

  for (const slot of safeSlots) {
    if (!capturedBatchIds.has(slot.payment_batch_id)) continue;

    const current = slotsByBatch.get(slot.payment_batch_id) || [];
    current.push(slot);
    slotsByBatch.set(slot.payment_batch_id, current);
  }

  for (const [batchId, batchSlots] of slotsByBatch) {
    const batch = safeBatches.find((item) => item.id === batchId);
    const firstSlot = [...batchSlots].sort(
      (a, b) => a.slot_number - b.slot_number
    )[0];

    if (!batch || !firstSlot) continue;

    passes.push({
      key: `batch-${batchId}`,
      gameId: batch.game_id,
      createdAt: firstSlot.created_at,
      serial: Number(firstSlot.booking_serial) || null,
      quantity: batchSlots.length,
      amount: Number(batch.amount),
      paymentReference: batch.provider_payment_id,
    });
  }

  // Preserve support for bookings made through the older single-player flow.
  for (const player of safePlayers) {
    const payment = safePayments.find(
      (item) => item.game_player_id === player.id
    );

    if (!payment) continue;

    passes.push({
      key: `player-${player.id}`,
      gameId: player.game_id,
      createdAt: player.created_at,
      serial: Number(player.booking_serial) || null,
      quantity: 1,
      amount: Number(payment.amount),
      paymentReference: payment.provider_payment_id,
    });
  }

  passes.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );

  const gameIds = [...new Set(passes.map((pass) => pass.gameId))];

  const { data: games, error: gamesError } = gameIds.length
    ? await supabase
        .from("games")
        .select("id, slot_start, slot_end, turfs(name, venues(name, locality))")
        .in("id", gameIds)
    : { data: [], error: null };

  if (gamesError) {
    console.error("Booking Pass game details lookup failed:", gamesError.message);
  }

  const gamesById = new Map<string, any>(
    (games || []).map((game: any) => [game.id, game])
  );

  const name =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "Football Player";

  const initial = name.charAt(0).toUpperCase();

  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ padding: "28px 0 18px" }}>
          <p className="label">TURFZY / PLAYER HUB</p>
          <h1 className="display" style={{ fontSize: "clamp(36px, 7vw, 58px)" }}>
            YOUR GAME.
            <br />
            YOUR IDENTITY.
          </h1>
          <p className="muted">Your football life, all in one place.</p>
        </header>

        <section
          className="panel"
          style={{
            padding: 24,
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Player avatar"
              width={88}
              height={88}
              style={{
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid #a3e635",
              }}
            />
          ) : (
            <div
              aria-label="Player avatar"
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "#a3e635",
                color: "#101010",
                fontSize: 36,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
          )}

          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <p className="label">PLAYER PROFILE</p>
            <h2 style={{ fontSize: 26, margin: "6px 0" }}>{name}</h2>
            <p className="muted" style={{ overflowWrap: "anywhere" }}>
              {user.email}
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              TURFZY MEMBER
            </p>
          </div>

          <Link className="btn green" href="/profile/edit/">
            EDIT PROFILE
          </Link>
        </section>

        <section style={{ marginTop: 32 }}>
          <p className="label">YOUR BOOKING PASSES</p>
          <h2 style={{ fontSize: 29, margin: "8px 0 6px" }}>
            Your confirmed games.
          </h2>
          <p className="muted" style={{ marginBottom: 18 }}>
            Your confirmed bookings stay here so you can return to your pass
            whenever you need it.
          </p>

          {passes.length === 0 ? (
            <div className="panel" style={{ padding: 22 }}>
              <h3 style={{ fontSize: 21, margin: "0 0 8px" }}>
                No Booking Passes yet
              </h3>
              <p className="muted">
                Once your payment is captured and your booking is confirmed,
                your pass will appear here.
              </p>
              <Link className="btn green" href="/matches" style={{ marginTop: 12 }}>
                FIND A GAME
              </Link>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {passes.map((pass) => {
                const game = gamesById.get(pass.gameId);
                const turf = game?.turfs;
                const venue = turf?.venues;
                const venueName = venue?.name || turf?.name || "Football venue";

                return (
                  <article
                    key={pass.key}
                    className="panel"
                    style={{
                      padding: 20,
                      border: "1px solid #a3e63566",
                      background: "linear-gradient(135deg, #111a14, #101010 70%)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: 12,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <p className="label">TURFZY · BOOKING PASS</p>
                        <h3 style={{ fontSize: 23, margin: "7px 0" }}>
                          {venueName}
                        </h3>
                        <p className="muted">
                          {venue?.locality || "Your booked match"}
                        </p>
                      </div>

                      <span
                        style={{
                          border: "1px solid #a3e635",
                          color: "#a3e635",
                          borderRadius: 99,
                          padding: "6px 10px",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        PAYMENT CAPTURED
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))",
                        gap: 12,
                        marginTop: 18,
                      }}
                    >
                      <div>
                        <p className="label">PASS SERIAL</p>
                        <strong style={{ color: "#f0d58a", overflowWrap: "anywhere" }}>
                          {passSerial(pass.serial, pass.createdAt)}
                        </strong>
                      </div>

                      <div>
                        <p className="label">MATCH DATE</p>
                        <strong>
                          {game?.slot_start
                            ? dateLabel(game.slot_start)
                            : "See game details"}
                        </strong>
                      </div>

                      <div>
                        <p className="label">KICK-OFF</p>
                        <strong>
                          {game?.slot_start
                            ? timeLabel(game.slot_start)
                            : "See game details"}
                        </strong>
                      </div>

                      <div>
                        <p className="label">PLAYER SLOTS</p>
                        <strong>{pass.quantity}</strong>
                      </div>

                      <div>
                        <p className="label">TOTAL PAID</p>
                        <strong>₹{pass.amount.toFixed(2)}</strong>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
                      <Link
                        className="btn green"
                        href={`/matches/${encodeURIComponent(pass.gameId)}`}
                      >
                        VIEW GAME
                      </Link>
                      {pass.paymentReference && (
                        <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
                          Payment reference saved
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section style={{ marginTop: 32 }}>
          <p className="label">DISCOVER</p>
          <h2 style={{ fontSize: 27, margin: "8px 0 18px" }}>
            The next match starts here.
          </h2>
          <Link
            href="/matches"
            className="panel"
            style={{ display: "block", padding: 22, textDecoration: "none" }}
          >
            <p className="label">FIND YOUR GAME</p>
            <h3 style={{ fontSize: 23, margin: "12px 0 8px" }}>Join the squad</h3>
            <p className="muted">
              Explore upcoming games and find your next team.
            </p>
          </Link>
        </section>

        <section className="panel" style={{ padding: 22, marginTop: 28 }}>
          <p className="label">ACCOUNT</p>
          <p style={{ margin: "10px 0" }}>Signed in as</p>
          <p className="muted" style={{ overflowWrap: "anywhere" }}>
            {user.email}
          </p>
          <form action="/auth/signout" method="post" style={{ marginTop: 18 }}>
            <button className="btn" type="submit">SIGN OUT</button>
          </form>
        </section>
      </div>
    </main>
  );
}
