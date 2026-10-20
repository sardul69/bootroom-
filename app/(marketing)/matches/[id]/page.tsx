
import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type GamePageProps = {
  params: Promise<{ id: string }>;
};

export default async function GamePage({ params }: GamePageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select(`
      id,
      slot_start,
      slot_end,
      player_capacity,
      player_fee,
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
    console.error("Game page lookup failed:", gameError.message);
    throw new Error("Unable to load this game. Please try again.");
  }

  if (!game) {
    notFound();
  }

  const start = new Date(game.slot_start);
  const end = new Date(game.slot_end);
  const capacity = Number(game.player_capacity);
  const playerFee = Number(game.player_fee);

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime() ||
    !Number.isSafeInteger(capacity) ||
    capacity < 1 ||
    !Number.isFinite(playerFee) ||
    playerFee <= 0
  ) {
    console.error("Invalid game configuration:", { gameId: id });
    throw new Error("This game's schedule or booking information is invalid.");
  }

  // This RPC must count confirmed players and unexpired pending holds
  // from both the legacy and multi-slot booking tables.
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
    console.error("Combined player count lookup failed:", {
      gameId: id,
      error: countError?.message,
    });

    throw new Error(
      "Player availability is temporarily unavailable. Please try again."
    );
  }

  const occupiedPlayers = Number(occupiedCount);
  const spotsLeft = Math.max(capacity - occupiedPlayers, 0);

  const isFull =
    game.status === "FULL" || occupiedPlayers >= capacity;

  const isUpcoming = start.getTime() > Date.now();

  const canJoin =
    !isFull &&
    game.status === "OPEN" &&
    isUpcoming;

  const date = start.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const startTime = start.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });

  const endTime = end.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });

  const turf = game.turfs as any;
  const venue = turf?.venues as any;

  return (
    <main className="page">
      <div className="container">
        <div className="label">TURFZY · GAME</div>

        <h1 className="display">
          {venue?.name || "Football Venue"}
        </h1>

        <p className="muted">
          {turf?.name || "Football Turf"}
          {venue?.locality ? ` · ${venue.locality}` : ""}
        </p>

        <div className="detailGrid">
          <div>
            <section className="panel">
              <div className="label">GAME TIME</div>

              <h2>{date}</h2>

              <h2 className="gold">
                {startTime} – {endTime}
              </h2>

              <div className="meta">
                <span className="tag">
                  {turf?.format || "Football"}
                </span>

                <span className="tag">
                  {Math.min(occupiedPlayers, capacity)}/{capacity} players
                </span>

                <span className="tag">
                  {isFull ? "FULL" : `${spotsLeft} spots left`}
                </span>
              </div>

              <p className="muted" style={{ marginTop: 12 }}>
                ₹{playerFee.toFixed(2)} per player
              </p>
            </section>

            <section className="panel" style={{ marginTop: 18 }}>
              <div className="label">LOCATION</div>

              <h3>
                {venue?.address || "Venue address unavailable"}
              </h3>

              {venue?.address && (
                <a
                  className="btn"
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    venue.address
                  )}`}
                >
                  GET DIRECTIONS
                </a>
              )}
            </section>
          </div>

          <section className="panel">
            <div className="label">JOIN THIS GAME</div>

            <h2>
              {isFull
                ? "Game full"
                : canJoin
                  ? `${spotsLeft} spots available`
                  : "Joining unavailable"}
            </h2>

            <p className="muted">
              {isFull
                ? "All player spots have been filled."
                : canJoin
                  ? "Choose your player slots and join the squad."
                  : "This game is not currently accepting players."}
            </p>

            {canJoin ? (
              <Link
                className="btn green"
                href={`/matches/${game.id}/join`}
              >
                JOIN GAME
              </Link>
            ) : (
              <button
                type="button"
                className="btn"
                disabled
                aria-disabled="true"
                style={{
                  opacity: 0.55,
                  cursor: "not-allowed",
                }}
              >
                {isFull ? "FULL" : "UNAVAILABLE"}
              </button>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
