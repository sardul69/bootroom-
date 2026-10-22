
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Matches() {
  const supabase = await createClient();

  const { data: games, error } = await supabase
    .from("games")
    .select(`
      id,
      slot_start,
      slot_end,
      player_capacity,
      status,
      turfs (
        name,
        format,
        venues (
          name,
          locality
        )
      )
    `)
    .in("status", ["OPEN", "FULL"])
    .gte("slot_start", new Date().toISOString())
    .order("slot_start", { ascending: true });

  const gamesWithCounts = await Promise.all(
    (games || []).map(async (game: any) => {
      const { data: count, error: countError } = await supabase.rpc(
        "get_combined_player_count",
        { p_game_id: game.id }
      );

      return {
        ...game,
        occupiedPlayers:
          !countError && Number.isFinite(Number(count))
            ? Number(count)
            : null,
      };
    })
  );

  return (
    <main className="page">
      <div className="container">
        <div className="label">BOOTROOM · PLAY NOW</div>

        <h1 className="display">
          FIND YOUR
          <br />
          <span className="gold">GAME.</span>
        </h1>

        <p className="muted">
          Join a game at a real football venue. Pick a time. Join the squad. Play.
        </p>

        {error ? (
          <div className="empty">Unable to load games right now.</div>
        ) : !games || games.length === 0 ? (
          <div className="empty">
            <strong>No games available right now.</strong>
            <br />
            New games will appear here when they are created.
          </div>
        ) : (
          <div className="cards">
            {gamesWithCounts.map((game: any) => {
              const start = new Date(game.slot_start);
              const end = new Date(game.slot_end);

              const date = start.toLocaleDateString("en-IN", {
                timeZone: "Asia/Kolkata",
                weekday: "short",
                day: "numeric",
                month: "short",
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

              const turf = game.turfs;
              const venue = turf?.venues;
              const capacity = Number(game.player_capacity);
              const occupied = game.occupiedPlayers;
              const remaining =
                occupied === null
                  ? null
                  : Math.max(0, capacity - occupied);

              return (
                <Link
                  className="card"
                  href={`/matches/${game.id}`}
                  key={game.id}
                >
                  <div className="cardBody">
                    <div className="label">{date}</div>

                    <div className="cardTitle">
                      {venue?.name || "Football Venue"}
                    </div>

                    <div className="muted">
                      {turf?.name || "Football Turf"}
                      {venue?.locality ? ` · ${venue.locality}` : ""}
                    </div>

                    <div className="meta">
                      <span className="tag">
                        {turf?.format || "Football"}
                      </span>

                      <span className="tag">
                        {startTime} – {endTime}
                      </span>

                      <span className="tag">
                        {occupied === null
                          ? "Availability unavailable"
                          : remaining === 0
                            ? `${occupied}/${capacity} booked · FULL`
                            : `${occupied}/${capacity} booked · ${remaining} slots left`}
                      </span>
                    </div>

                    <div className="priceRow">
                      <div className="price">GAME</div>

                      <span className="btn">
                        {remaining === 0 ? "VIEW GAME" : "JOIN GAME"}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
