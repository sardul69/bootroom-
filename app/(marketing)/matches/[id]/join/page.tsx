
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import GamePayButton from "@/components/GamePayButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type JoinPageProps = {
  params: Promise<{ id: string }>;
};

export default async function JoinGamePage({ params }: JoinPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/matches/${id}/join`)}`);
  }

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select(`
      id,
      slot_start,
      slot_end,
      player_capacity,
      player_fee,
      booking_amount,
      status,
      turfs (
        name,
        format,
        venues (
          name,
          locality,
          address
        )
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (gameError) {
    console.error("Join page game lookup failed:", gameError.message);
    throw new Error("Unable to load this game. Please try again.");
  }

  if (!game) notFound();

  const start = new Date(game.slot_start);
  const end = new Date(game.slot_end);
  const capacity = Number(game.player_capacity);
  const playerFee = Number(game.player_fee);
  const bookingAmount =
    game.booking_amount == null ? undefined : Number(game.booking_amount);

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime() ||
    !Number.isSafeInteger(capacity) ||
    capacity < 2 ||
    !Number.isFinite(playerFee) ||
    playerFee <= 0 ||
    (bookingAmount !== undefined &&
      (!Number.isFinite(bookingAmount) ||
        bookingAmount <= 0 ||
        bookingAmount > playerFee))
  ) {
    console.error("Invalid game booking information:", { gameId: id });
    throw new Error("This game's booking information is invalid.");
  }

  const { data: occupiedCount, error: countError } =
    await supabase.rpc("get_combined_player_count", {
      p_game_id: id,
    });

  if (
    countError ||
    occupiedCount === null ||
    occupiedCount === undefined ||
    !Number.isSafeInteger(Number(occupiedCount)) ||
    Number(occupiedCount) < 0
  ) {
    console.error("Join page availability lookup failed:", {
      gameId: id,
      error: countError?.message,
    });

    throw new Error(
      "Player availability is temporarily unavailable. Please try again."
    );
  }

  const occupiedPlayers = Number(occupiedCount);
  const spotsLeft = Math.max(capacity - occupiedPlayers, 0);
  const isFull = game.status === "FULL" || occupiedPlayers >= capacity;

  const canJoin =
    game.status === "OPEN" &&
    !isFull &&
    start.getTime() > Date.now();

  const turf = game.turfs as any;
  const venue = turf?.venues as any;

  const date = start.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const startTime = start.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });

  const endTime = end.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <main className="page">
      <div className="container">
        <Link className="btn" href={`/matches/${game.id}`}>
          BACK TO GAME
        </Link>

        <div className="label" style={{ marginTop: 24 }}>
          TURFZY · JOIN GAME
        </div>

        <h1 className="display">
          {venue?.name || "Football Venue"}
        </h1>

        <p className="muted">
          {turf?.name || "Football Turf"}
          {venue?.locality ? ` · ${venue.locality}` : ""}
        </p>

        <div className="detailGrid" style={{ marginTop: 24 }}>
          <section className="panel">
            <div className="label">YOUR GAME</div>

            <h2>{date}</h2>

            <h2 className="gold">
              {startTime} – {endTime}
            </h2>

            <p className="muted" style={{ marginTop: 12 }}>
              {turf?.format || "Football"}
            </p>

            <div className="meta">
              <span className="tag">
                {Math.min(occupiedPlayers, capacity)}/{capacity} players
              </span>

              <span className="tag">
                {isFull ? "FULL" : `${spotsLeft} spots left`}
              </span>
            </div>

            {venue?.address && (
              <p className="muted" style={{ marginTop: 16 }}>
                {venue.address}
              </p>
            )}
          </section>

          <section className="panel">
            <div className="label">PLAYER PAYMENT</div>

            {canJoin ? (
              <>
                <h2>Choose your slots</h2>

                <p className="muted" style={{ marginTop: 8 }}>
                  Pay per player. Your requested slots are checked again
                  securely when your booking is reserved.
                </p>

                <div style={{ marginTop: 20 }}>
                  <GamePayButton
                    gameId={game.id}
                    amount={playerFee}
                    bookingAmount={bookingAmount}
                    maxQuantity={spotsLeft}
                  />
                </div>

                <p className="muted" style={{ marginTop: 12 }}>
                  Payment confirmation is required before your booking is
                  confirmed. Do not retry payment if a previous payment may
                  have been captured.
                </p>
              </>
            ) : (
              <>
                <h2>{isFull ? "Game full" : "Joining unavailable"}</h2>

                <p className="muted" style={{ marginTop: 8 }}>
                  {isFull
                    ? "All player slots are currently occupied."
                    : "This game is closed or has already started."}
                </p>

                <Link
                  className="btn"
                  href={`/matches/${game.id}`}
                  style={{ marginTop: 16 }}
                >
                  RETURN TO GAME
                </Link>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
