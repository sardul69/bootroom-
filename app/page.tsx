
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeLoginGate from "@/components/HomeLoginGate";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: games, error } = await supabase
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
          locality
        )
      )
    `)
    .in("status", ["OPEN", "FULL"])
    .gte("slot_start", new Date().toISOString())
    .order("slot_start", { ascending: true })
    .limit(6);

  const gamesWithCounts = await Promise.all(
    (games ?? []).map(async (game: any) => {
      const { data: occupiedCount, error: countError } =
        await supabase.rpc("get_combined_player_count", {
          p_game_id: game.id,
        });

      const occupied = countError ? null : Number(occupiedCount);

      return {
        ...game,
        occupied,
        available:
          occupied === null
            ? null
            : Math.max(0, Number(game.player_capacity) - occupied),
      };
    })
  );

  const avatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;

  const initial = (user?.email?.trim()?.[0] || "P").toUpperCase();

  return (
    <>
      {!user && <HomeLoginGate />}

      <div className="br-home">
        <header className="br-header">
          <div className="br-nav">
            <Link href="/" aria-label="BOOTROOM home" className="br-logo">
              <Image
                src="/brand/bootroom-logo.png"
                alt="BOOTROOM"
                width={112}
                height={96}
                priority
              />
            </Link>

            <nav className="br-navlinks" aria-label="Main navigation">
              <Link href="/matches">Matches</Link>
              <Link href="/turfs">Turfs</Link>
              <Link href="/owner">Host a game</Link>
            </nav>

            <div className="br-nav-actions">
              {user ? (
                <Link
                  href="/profile"
                  aria-label="Open your profile"
                  title={user.email || "Your profile"}
                  className="br-avatar"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    initial
                  )}
                </Link>
              ) : (
                <Link href="/login" className="br-signin">
                  Sign in
                </Link>
              )}

              <Link href="/matches" className="br-nav-button">
                Find a game
              </Link>
            </div>
          </div>
        </header>

        <main>
          {/* HERO */}
          <section className="br-hero">
            <div className="br-hero-image" aria-hidden="true" />
            <div className="br-hero-shade" aria-hidden="true" />

            <div className="br-hero-content">
              <div className="br-eyebrow">
                <span className="br-live-dot" />
                INDIA'S FOOTBALL COMMUNITY
              </div>

              <h1>
                YOUR CITY.
                <br />
                YOUR SQUAD.
                <br />
                <span>YOUR GAME.</span>
              </h1>

              <p>
                Football is better together. Discover games, find your
                people, and get back on the pitch.
              </p>

              <div className="br-hero-actions">
                <Link href="/matches" className="br-button br-button-green">
                  FIND YOUR GAME
                </Link>
                <Link href="/turfs" className="br-button br-button-outline">
                  EXPLORE TURFS
                </Link>
              </div>

              <div className="br-hero-foot">
                <span>BUILT FOR THE LOVE OF THE GAME</span>
                <span>EST. FOOTBALL COMMUNITY</span>
              </div>
            </div>

            <div className="br-hero-index" aria-hidden="true">
              <span>01</span>
              <span className="br-index-line" />
              <span>BOOTROOM</span>
            </div>
          </section>

          {/* MATCHES */}
          <section className="br-section">
            <div className="br-container">
              <div className="br-section-heading">
                <div>
                  <div className="br-kicker">THE NEXT KICK-OFF</div>
                  <h2>UPCOMING GAMES<span>.</span></h2>
                  <p>Find a game. Claim your place. Meet your squad.</p>
                </div>

                <Link href="/matches" className="br-text-link">
                  ALL MATCHES
                </Link>
              </div>

              {error ? (
                <div className="br-empty">
                  Unable to load games right now. Please try again shortly.
                </div>
              ) : gamesWithCounts.length === 0 ? (
                <div className="br-empty">
                  <div className="br-empty-mark">BR</div>
                  <h3>THE PITCH IS WAITING.</h3>
                  <p>No upcoming games have been posted yet.</p>
                  <Link href="/matches" className="br-button br-button-green">
                    EXPLORE MATCHES
                  </Link>
                </div>
              ) : (
                <div className="br-game-grid">
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
                    const isFull =
                      game.status === "FULL" || game.available === 0;

                    return (
                      <Link
                        href={`/matches/${game.id}`}
                        key={game.id}
                        className="br-game-card"
                      >
                        <div className="br-card-top">
                          <span className="br-card-date">{date}</span>
                          <span
                            className={`br-status ${
                              isFull ? "br-status-full" : "br-status-open"
                            }`}
                          >
                            {isFull ? "FULL" : "OPEN"}
                          </span>
                        </div>

                        <div className="br-card-time">
                          {startTime} <span>—</span> {endTime}
                        </div>

                        <div className="br-card-divider" />

                        <div className="br-card-venue">
                          <div className="br-card-label">VENUE</div>
                          <h3>{venue?.name || "Football Venue"}</h3>
                          <p>
                            {turf?.name || "Football Turf"}
                            {venue?.locality ? ` · ${venue.locality}` : ""}
                          </p>
                        </div>

                        <div className="br-card-bottom">
                          <div className="br-card-info">
                            <span className="br-format">
                              {turf?.format || "Football"}
                            </span>
                            <span className="br-spots">
                              {game.available === null
                                ? "Checking availability"
                                : game.available === 0
                                  ? "No spots left"
                                  : `${game.available} spots left`}
                            </span>
                          </div>

                          <div className="br-price-row">
                            <div className="br-price">
                              ₹{Number(game.player_fee).toFixed(0)}
                              <small> / PLAYER</small>
                            </div>
                            <span className="br-join">
                              {isFull ? "VIEW GAME" : "JOIN GAME"}
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

          {/* HOW IT WORKS */}
          <section className="br-how">
            <div className="br-container">
              <div className="br-how-heading">
                <div className="br-kicker">SIMPLE. SOCIAL. FOOTBALL.</div>
                <h2>LESS TALK. MORE FOOTBALL.</h2>
              </div>

              <div className="br-steps">
                <div className="br-step">
                  <span>01</span>
                  <h3>DISCOVER</h3>
                  <p>Find upcoming games and football turfs around you.</p>
                </div>
                <div className="br-step">
                  <span>02</span>
                  <h3>JOIN</h3>
                  <p>Book your individual player spot and join the squad.</p>
                </div>
                <div className="br-step">
                  <span>03</span>
                  <h3>PLAY</h3>
                  <p>Show up, meet the team, and let your football speak.</p>
                </div>
              </div>
            </div>
          </section>

          {/* MARKETPLACE SECRET ENTRANCE */}
          <section className="br-market-section">
            <div className="br-container">
              <Link href="/marketplace" className="br-market-door">
                <div className="br-market-texture" aria-hidden="true" />
                <div className="br-market-border">
                  <div className="br-market-topline">
                    <span>BOOTROOM EXCLUSIVE</span>
                    <span>EST. FOR THE PLAYERS</span>
                  </div>

                  <div className="br-market-center">
                    <div className="br-market-emblem">
                      <span>BR</span>
                    </div>

                    <div className="br-market-overline">
                      BEYOND THE PITCH
                    </div>

                    <h2>THE MARKETPLACE</h2>

                    <p>
                      A different side of the game.
                      <br />
                      Reserved for the BOOTROOM community.
                    </p>

                    <span className="br-market-enter">
                      DISCOVER THE COLLECTION
                    </span>
                  </div>

                  <div className="br-market-bottom">
                    <span>ACCESS THE VAULT</span>
                    <span>BOOTROOM COMMUNITY</span>
                  </div>
                </div>
              </Link>
            </div>
          </section>

          {/* HOST */}
          <section className="br-host-section">
            <div className="br-container">
              <div className="br-host">
                <div>
                  <div className="br-kicker">BRING PEOPLE TOGETHER</div>
                  <h2>HAVE A GAME IN MIND?</h2>
                  <p>
                    Host a game and bring your football community together.
                  </p>
                </div>
                <Link href="/owner" className="br-button br-button-green">
                  CREATE A GAME
                </Link>
              </div>
            </div>
          </section>
        </main>

        <footer className="br-footer">
          <div className="br-container br-footer-inner">
            <Image
              src="/brand/bootroom-logo.png"
              alt="BOOTROOM"
              width={92}
              height={80}
            />
            <div>
              <strong>BOOTROOM</strong>
              <span>YOUR CITY. YOUR SQUAD. YOUR GAME.</span>
            </div>
            <span className="br-footer-copy">
              FOOTBALL GAMES · FOOTBALL COMMUNITY
            </span>
          </div>
        </footer>
      </div>


    </>
  );
}
