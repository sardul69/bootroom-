
import Image from 'next/image';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();

  const { data: games, error } = await supabase
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
          locality
        )
      )
    `)
    .in('status', ['OPEN', 'FULL'])
    .gte('slot_start', new Date().toISOString())
    .order('slot_start', { ascending: true })
    .limit(6);

  return (
    <>
      <header className="header">
        <div className="container nav">
          <Link href="/">
            <Image
              src="/brand/bootroom-logo.png"
              alt="BOOTROOM"
              width={116}
              height={100}
              priority
            />
          </Link>

          <nav className="navlinks">
            <Link href="/turfs">Turfs</Link>
            <Link href="/matches">Matches</Link>
            <Link href="/owner">Create a game</Link>
          </nav>

          <div className="navcta">
            <Link className="btn ghost" href="/login">Sign in</Link>
            <Link className="btn primary" href="/matches">Find a game</Link>
          </div>
        </div>
      </header>

      <main>
            <section className="hero" style={{
      position: 'relative',
      overflow: 'hidden',
      minHeight: '0',
      display: 'flex',
      alignItems: 'center',
      background: 'radial-gradient(ellipse at 80% 45%, rgba(24, 170, 91, 0.20), transparent 38%), linear-gradient(135deg, #050907 0%, #0b1b12 55%, #061009 100%)',
      borderBottom: '1px solid rgba(87, 255, 155, 0.16)',
    }}>
      <div className="container heroContent" style={{
        position: 'relative',
        zIndex: 2,
        paddingTop: '90px',
        paddingBottom: '90px',
      }}>
        <div className="label" style={{
          color: '#78ffad',
          letterSpacing: '4px',
          fontSize: '11px',
          fontWeight: 800,
        }}>
          INDIA · FOOTBALL COMMUNITY
        </div>
        <h1 className="display" style={{
          fontSize: 'clamp(48px, 9vw, 100px)',
          lineHeight: 0.98,
          letterSpacing: '-3px',
          margin: '24px 0',
          textShadow: '0 0 35px rgba(43, 255, 128, 0.12)',
        }}>
          YOUR CITY.<br />
          YOUR SQUAD.<br />
          <span style={{
            color: '#75ffa8',
            textShadow: '0 0 30px rgba(65, 255, 140, 0.25)',
          }}>
            YOUR GAME.
          </span>
        </h1>
        <p className="heroSub" style={{
          maxWidth: '520px',
          color: '#c0d1c5',
          fontSize: '16px',
          lineHeight: 1.8,
          marginBottom: '30px',
        }}>
          Find your next match in India. Join the squad, pay your individual player fee, and get on the pitch.
        </p>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          alignItems: 'center',
        }}>
          <Link className="btn primary" href="/matches">
            FIND YOUR GAME ↗
          </Link>
          <Link className="btn ghost" href="/turfs">
            EXPLORE TURFS
          </Link>
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '28px',
          marginTop: '44px',
          paddingTop: '22px',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          maxWidth: '520px',
        }}>
          <div>
            <div style={{ color: '#75ffa8', fontSize: '22px', fontWeight: 900 }}>01</div>
            <div style={{ color: '#9db2a4', fontSize: '11px', letterSpacing: '1.5px' }}>FIND A MATCH</div>
          </div>
          <div>
            <div style={{ color: '#75ffa8', fontSize: '22px', fontWeight: 900 }}>02</div>
            <div style={{ color: '#9db2a4', fontSize: '11px', letterSpacing: '1.5px' }}>JOIN YOUR SQUAD</div>
          </div>
          <div>
            <div style={{ color: '#75ffa8', fontSize: '22px', fontWeight: 900 }}>03</div>
            <div style={{ color: '#9db2a4', fontSize: '11px', letterSpacing: '1.5px' }}>OWN THE PITCH</div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" style={{
        position: 'absolute',
        right: '-100px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: 'min(55vw, 580px)',
        aspectRatio: '1',
        borderRadius: '50%',
        border: '1px solid rgba(91, 255, 155, 0.15)',
        boxShadow: '0 0 80px rgba(20, 200, 100, 0.06), inset 0 0 80px rgba(20, 200, 100, 0.04)',
        pointerEvents: 'none',
      }}>
        <div style={{
          position: 'absolute',
          inset: '12%',
          border: '1px solid rgba(91, 255, 155, 0.12)',
          borderRadius: '50%',
        }} />
        <div style={{
          position: 'absolute',
          inset: '27%',
          border: '1px solid rgba(91, 255, 155, 0.10)',
          borderRadius: '50%',
        }} />
      </div>
    </section>
    

        <section className="section">
          <div className="container">
            <div className="sectionHead">
              <div>
                <div className="label">Upcoming games</div>
                <h2 className="display">FIND YOUR GAME.</h2>
                <p className="muted">
                  Games appear here automatically when hosts create them.
                </p>
              </div>

              <Link className="btn" href="/matches">
                View all games
              </Link>
            </div>

            {error ? (
              <div className="empty">
                Unable to load games right now. Please try again shortly.
              </div>
            ) : !games || games.length === 0 ? (
              <div className="empty">
                <strong>No upcoming games yet.</strong>
                <br />
                Check back soon, or create a game as a host.
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
                          {date} · {startTime} – {endTime}
                        </div>

                        <div className="cardTitle">
                          {venue?.name || 'Football Venue'}
                        </div>

                        <p className="muted">
                          {turf?.name || 'Football Turf'}
                          {venue?.locality ? ` · ${venue.locality}` : ''}
                        </p>

                        <div className="meta">
                          <span className="tag">
                            {turf?.format || 'Football'}
                          </span>
                          <span className="tag">
                            {game.player_capacity} players
                          </span>
                          <span className="tag">
                            {game.status === 'FULL' ? 'FULL' : 'OPEN'}
                          </span>
                        </div>

                        <div className="priceRow">
                          <div className="price">
                            ₹{Number(game.player_fee).toFixed(0)}
                            <small> / player</small>
                          </div>

                          <span className="btn">
                            {game.status === 'FULL' ? 'VIEW GAME' : 'JOIN GAME'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="sectionHead">
              <div>
                <div className="label">The system</div>
                <h2 className="display">FROM GAME TO KICK-OFF.</h2>
              </div>
            </div>

            <div className="steps">
              <div className="step">
                <div className="stepNum">01</div>
                <h3>FIND</h3>
                <p className="muted">Discover upcoming games posted by hosts.</p>
              </div>

              <div className="step">
                <div className="stepNum">02</div>
                <h3>JOIN</h3>
                <p className="muted">
                  Pay your individual player fee to join the squad.
                </p>
              </div>

              <div className="step">
                <div className="stepNum">03</div>
                <h3>PLAY</h3>
                <p className="muted">Show up and play football.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="owner">
              <div>
                <div className="label">For hosts</div>
                <h2 className="display">START A GAME.</h2>
                <p className="muted">
                  Create a game and make it visible to players on the homepage.
                </p>
              </div>

              <Link className="btn primary" href="/owner">
                CREATE A GAME
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footerGrid">
          <Image
            src="/brand/bootroom-logo.png"
            alt="BOOTROOM"
            width={110}
            height={94}
          />
          <div>BOOTROOM · INDIA </div>
          <div>Football games · Football community</div>
        </div>
      </footer>
    </>
  );
}
