import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase
    .from('games')
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
      ),
      game_players (
        id,
        status
      )
    `)
    .eq('id', id)
    .single();

  if (!game) notFound();

  const start = new Date(game.slot_start);
  const end = new Date(game.slot_end);

  const date = start.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const startTime = start.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const endTime = end.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const confirmedPlayers =
    game.game_players?.filter(
      (player: any) => player.status === 'CONFIRMED'
    ).length ?? 0;

  const spotsLeft = Math.max(
    game.player_capacity - confirmedPlayers,
    0
  );

  const turf = game.turfs as any;
  const venue = turf?.venues as any;

  return (
    <main className="page">
      <div className="container">

        <div className="label">
          BOOTROOM · GAME
        </div>

        <h1 className="display">
          {venue?.name || 'Football Venue'}
        </h1>

        <p className="muted">
          {turf?.name || 'Football Turf'}
          {venue?.locality ? ` · ${venue.locality}` : ''}
        </p>

        <div className="detailGrid">

          <div>

            <div className="panel">

              <div className="label">
                GAME TIME
              </div>

              <h2>
                {date}
              </h2>

              <h2 className="gold">
                {startTime} – {endTime}
              </h2>

              <div className="meta">
                <span className="tag">
                  {turf?.format || 'Football'}
                </span>

                <span className="tag">
                  {confirmedPlayers}/{game.player_capacity} players
                </span>

                <span className="tag">
                  {spotsLeft} spots left
                </span>
              </div>

            </div>

            <div
              className="panel"
              style={{ marginTop: 18 }}
            >

              <div className="label">
                LOCATION
              </div>

              <h3>
                {venue?.address || 'Venue address unavailable'}
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

            </div>

          </div>

          <div className="panel">

            <div className="label">
              JOIN THIS GAME
            </div>

            <h2>
              {spotsLeft > 0
                ? `${spotsLeft} spots available`
                : 'Game full'}
            </h2>

            <p className="muted">
              Join the squad and play.
            </p>

            {spotsLeft > 0 && game.status === 'OPEN' ? (
              <Link
                className="btn green"
                href={`/matches/${game.id}/join`}
              >
                JOIN GAME
              </Link>
            ) : (
              <div className="empty">
                This game is currently full.
              </div>
            )}

          </div>

        </div>

      </div>
    </main>
  );
}