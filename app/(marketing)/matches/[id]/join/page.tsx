import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import GamePayButton from "@/components/GamePayButton";
export default async function JoinGamePage({
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
      player_fee,
      player_capacity,
      status,
      slot_start,
      slot_end,
      turfs (
        name,
        venues (
          name,
          locality
        )
      )
    `)
    .eq('id', id)
    .single();

  if (!game) {
    notFound();
  }

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

  const turf = game.turfs as any;
  const venue = turf?.venues as any;

  return (
    <main className="page">
      <div className="container">

        <div className="label">
          BOOTROOM · JOIN GAME
        </div>

        <h1 className="display">
          JOIN THE<br />
          <span className="gold">GAME.</span>
        </h1>

        <div className="panel">

          <div className="label">
            {venue?.name || 'Football Venue'}
          </div>

          <h2>
            {turf?.name || 'Football Turf'}
          </h2>

          <p className="muted">
            {venue?.locality || ''}
          </p>

          <p className="muted">
            {date}
            <br />
            {startTime} – {endTime}
          </p>

        </div>

        <div
          className="panel"
          style={{ marginTop: 18 }}
        >
          <div className="label">
            YOUR PAYMENT
          </div>

          <div className="price">
            ₹{Number(game.player_fee).toFixed(0)}
          </div>

          <p className="muted">
            This is your individual player fee.
          </p>

          <GamePayButton
  gameId={game.id}
  amount={Number(game.player_fee)}
/>

        </div>

      </div>
    </main>
  );
}