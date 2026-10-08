import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function Matches() {
  const supabase = await createClient();

  const { data: games, error } = await supabase
    .from('games')
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
    .in('status', ['OPEN', 'FULL'])
    .gte('slot_start', new Date().toISOString())
    .order('slot_start', { ascending: true });

  return (
    <main className="page">
      <div className="container">

        <div className="label">BOOTROOM · PLAY NOW</div>

        <h1 className="display">
          FIND YOUR<br />
          <span className="gold">GAME.</span>
        </h1>

        <p className="muted">
          Join a game at a real football venue.
          Pick a time. Join the squad. Play.
        </p>

        {error ? (
          <div className="empty">
            Unable to load games right now.
          </div>
        ) : !games || games.length === 0 ? (
          <div className="empty">
            <strong>No games available right now.</strong>
            <br />
            New games will appear here when they are created.
          </div>
        ) : (
          <div className="cards">
            {games.map((game: any) => {
              const start = new Date(game.slot_start);
              const end = new Date(game.slot_end);

              const date = start.toLocaleDateString('en-IN', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });

              const startTime = start.toLocaleTimeString('en-IN', {
                hour: 'numeric',
                minute: '2-digit',
              });

              const endTime = end.toLocaleTimeString('en-IN', {
                hour: 'numeric',
                minute: '2-digit',
              });

              const turf = game.turfs;
              const venue = turf?.venues;

              return (
                <Link
                  className="card"
                  href={`/matches/${game.id}`}
                  key={game.id}
                >
                  <div className="cardBody">

                    <div className="label">
                      {date}
                    </div>

                    <div className="cardTitle">
                      {venue?.name || 'Football Venue'}
                    </div>

                    <div className="muted">
                      {turf?.name || 'Football Turf'}
                      {venue?.locality
                        ? ` · ${venue.locality}`
                        : ''}
                    </div>

                    <div className="meta">
                      <span className="tag">
                        {turf?.format || 'Football'}
                      </span>

                      <span className="tag">
                        {startTime} – {endTime}
                      </span>

                      <span className="tag">
                        {game.player_capacity} players
                      </span>
                    </div>

                    <div className="priceRow">
                      <div className="price">
                        GAME
                      </div>

                      <span className="btn">
                        JOIN GAME
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