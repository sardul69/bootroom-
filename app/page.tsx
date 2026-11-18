
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import HomeLoginGate from "@/components/HomeLoginGate";
import HomeCinematic from "@/components/HomeCinematic";
import HomeArrival from "@/components/HomeArrival";

export const dynamic = "force-dynamic";

type Game = {
  id: string;
  slot_start: string;
  slot_end: string;
  player_capacity: number;
  player_fee: number;
  status: string;
  turfs: {
    name: string | null;
    format: string | null;
    venues: {
      name: string | null;
      locality: string | null;
    } | null;
  } | null;
  occupied: number | null;
  available: number | null;
};

function formatMatchDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatMatchTime(value: string) {
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  });
}

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

  const gamesWithCounts: Game[] = await Promise.all(
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
            : Math.max(
                0,
                Number(game.player_capacity) - occupied
              ),
      };
    })
  );

  const avatarUrl =
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;

  const initial = (
    user?.email?.trim()?.[0] || "P"
  ).toUpperCase();

  const openGames = gamesWithCounts.filter(
    (game) =>
      game.status === "OPEN" &&
      game.available !== 0
  ).length;

  return (
    <>
      <HomeArrival />

      {!user && <HomeLoginGate />}

      <div className="br-home br-locker-home">

        {/* =================================================
            MAIN NAVIGATION
        ================================================= */}

        <header className="br-header">
          <div className="br-nav">

            <Link
              href="/"
              aria-label="BOOTROOM home"
              className="br-logo"
            >
              <Image
                src="/brand/bootroom-logo.png"
                alt="BOOTROOM"
                width={112}
                height={96}
                priority
              />
            </Link>

            <nav
              className="br-navlinks"
              aria-label="Main navigation"
            >
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
                <Link
                  href="/login"
                  className="br-signin"
                >
                  Sign in
                </Link>
              )}

              <Link
                href="/matches"
                className="br-nav-button"
              >
                Find a game
              </Link>

            </div>
          </div>
        </header>

        <main>

          {/* =================================================
              CINEMATIC HOMEPAGE HERO
          ================================================= */}

          <HomeCinematic />

          {/* =================================================
              THE PRIVATE DRESSING ROOM
          ================================================= */}

          <section className="br-locker-intro">

            <div
              className="br-locker-grid"
              aria-hidden="true"
            />

            <div className="br-locker-ambient" aria-hidden="true" />

            <div className="br-container br-locker-inner">

              <div className="br-locker-topline">

                <div className="br-locker-overline">
                  <span className="br-locker-light" />
                  PRIVATE MEMBERS' DRESSING ROOM
                </div>

                <span className="br-locker-edition">
                  BOOTROOM / 001
                </span>

              </div>

              <div className="br-locker-heading">

                <span className="br-locker-pretitle">
                  THE GAME STARTS HERE
                </span>

                <h1>
                  YOUR PLACE.
                  <br />
                  <span>YOUR CLUB.</span>
                </h1>

                <p>
                  A home for the ones who live for football.
                  Find your squad, claim your pitch and
                  become part of something bigger than the game.
                </p>

                <div className="br-locker-heading-actions">
                  <Link
                    href="/matches"
                    className="br-locker-primary"
                  >
                    <span>ENTER MATCHDAY</span>
                    <span aria-hidden="true">↗</span>
                  </Link>

                  <Link
                    href="/marketplace"
                    className="br-locker-secondary"
                  >
                    EXPLORE THE VAULT
                  </Link>
                </div>

              </div>

              {/* DRESSING ROOM INFORMATION STRIP */}

              <div className="br-locker-stats">

                <div className="br-locker-stat">
                  <span className="br-locker-stat-label">
                    THE COMMUNITY
                  </span>
                  <strong>KOLKATA</strong>
                  <span className="br-locker-stat-note">
                    BUILT AROUND FOOTBALL
                  </span>
                </div>

                <div className="br-locker-stat">
                  <span className="br-locker-stat-label">
                    MATCHDAY
                  </span>
                  <strong>YOUR GAME</strong>
                  <span className="br-locker-stat-note">
                    YOUR SQUAD
                  </span>
                </div>

                <div className="br-locker-stat">
                  <span className="br-locker-stat-label">
                    OPEN FIXTURES
                  </span>
                  <strong>{String(openGames).padStart(2, "0")}</strong>
                  <span className="br-locker-stat-note">
                    AVAILABLE GAMES
                  </span>
                </div>

              </div>

              {/* LOCKER BAY COLLECTION */}

              <div className="br-locker-section-heading">

                <div>
                  <span className="br-locker-pretitle">
                    INSIDE THE CLUB
                  </span>
                  <h2>THE DRESSING ROOM</h2>
                </div>

                <span className="br-locker-section-index">
                  COLLECTION / 01—04
                </span>

              </div>

              <div className="br-locker-bays">

                {/* LOCKER 01 */}

                <Link
                  href="/matches"
                  className="br-locker-bay br-locker-bay-featured"
                >
                  <div className="br-locker-bay-top">
                    <span>01 / FIRST TEAM</span>
                    <span className="br-locker-status">
                      AVAILABLE
                    </span>
                  </div>

                  <div className="br-locker-kit-stage">
                    <div className="br-kit-light" />

                    <div className="br-kit-jersey br-kit-olive">
                      <span className="br-kit-collar" />
                      <span className="br-kit-sleeve-left" />
                      <span className="br-kit-sleeve-right" />
                      <span className="br-kit-shoulder-mark">
                        BR
                      </span>
                      <strong>11</strong>
                      <span className="br-kit-bottom-mark">
                        BOOTROOM
                      </span>
                    </div>

                    <span className="br-kit-shadow" />
                  </div>

                  <div className="br-locker-bay-info">
                    <div>
                      <span>THE SQUAD</span>
                      <h3>FIND YOUR PEOPLE.</h3>
                    </div>
                    <span className="br-locker-arrow">↗</span>
                  </div>
                </Link>

                {/* LOCKER 02 */}

                <Link
                  href="/turfs"
                  className="br-locker-bay"
                >
                  <div className="br-locker-bay-top">
                    <span>02 / HOME GROUND</span>
                    <span className="br-locker-number">
                      90'
                    </span>
                  </div>

                  <div className="br-locker-kit-stage br-locker-pitch">
                    <div className="br-pitch-lines">
                      <span />
                      <span />
                      <span />
                    </div>

                    <div className="br-locker-object">
                      <span className="br-locker-object-number">
                        90
                      </span>
                      <span className="br-locker-object-caption">
                        MINUTES
                      </span>
                    </div>
                  </div>

                  <div className="br-locker-bay-info">
                    <div>
                      <span>THE PITCH</span>
                      <h3>CLAIM YOUR GROUND.</h3>
                    </div>
                    <span className="br-locker-arrow">↗</span>
                  </div>
                </Link>

                {/* LOCKER 03 */}

                <Link
                  href="/marketplace"
                  className="br-locker-bay"
                >
                  <div className="br-locker-bay-top">
                    <span>03 / CLUB COLLECTION</span>
                    <span className="br-locker-number">
                      BR
                    </span>
                  </div>

                  <div className="br-locker-kit-stage br-locker-vault">
                    <div className="br-vault-ring">
                      <span>BR</span>
                    </div>
                    <span className="br-vault-label">
                      MEMBERS ONLY
                    </span>
                  </div>

                  <div className="br-locker-bay-info">
                    <div>
                      <span>THE VAULT</span>
                      <h3>BEYOND THE PITCH.</h3>
                    </div>
                    <span className="br-locker-arrow">↗</span>
                  </div>
                </Link>

                {/* LOCKER 04 */}

                <Link
                  href="/owner"
                  className="br-locker-bay"
                >
                  <div className="br-locker-bay-top">
                    <span>04 / CLUB STAFF</span>
                    <span className="br-locker-number">
                      04
                    </span>
                  </div>

                  <div className="br-locker-kit-stage br-locker-host">
                    <div className="br-host-emblem">
                      <span>+</span>
                    </div>
                    <span className="br-host-caption">
                      BRING YOUR SQUAD TOGETHER
                    </span>
                  </div>

                  <div className="br-locker-bay-info">
                    <div>
                      <span>THE HOSTS</span>
                      <h3>CREATE THE GAME.</h3>
                    </div>
                    <span className="br-locker-arrow">↗</span>
                  </div>
                </Link>

              </div>

              <div className="br-locker-bottomline">
                <span>KOLKATA · INDIA</span>
                <span>YOUR CITY. YOUR SQUAD. YOUR GAME.</span>
                <span>EST. FOR THE GAME</span>
              </div>

            </div>
          </section>

          {/* =================================================
              MATCHDAY TICKER
          ================================================= */}

          <section
            className="br-matchday-ticker"
            aria-label="BOOTROOM matchday"
          >
            <div
              className="br-matchday-track"
              aria-hidden="true"
            >
              {Array.from({ length: 4 }).map((_, index) => (
                <span key={index}>
                  FIND YOUR SQUAD <i>✳</i>
                  CLAIM YOUR PITCH <i>✳</i>
                  PLAY THE GAME <i>✳</i>
                  KOLKATA UNITED <i>✳</i>
                </span>
              ))}
            </div>
          </section>

          {/* =================================================
              UPCOMING FIXTURES
          ================================================= */}

          <section className="br-section br-fixtures-section">

            <div className="br-container">

              <div className="br-section-heading">

                <div>
                  <div className="br-kicker">
                    THE NEXT KICK-OFF
                  </div>

                  <h2>
                    UPCOMING GAMES<span>.</span>
                  </h2>

                  <p>
                    Find a game. Claim your place. Meet your squad.
                  </p>
                </div>

                <Link
                  href="/matches"
                  className="br-text-link"
                >
                  ALL MATCHES
                </Link>

              </div>

              {error ? (

                <div className="br-empty">
                  Unable to load games right now.
                  Please try again shortly.
                </div>

              ) : gamesWithCounts.length === 0 ? (

                <div className="br-empty">
                  <div className="br-empty-mark">BR</div>
                  <h3>THE PITCH IS WAITING.</h3>
                  <p>
                    No upcoming games have been posted yet.
                  </p>
                  <Link
                    href="/matches"
                    className="br-button br-button-green"
                  >
                    EXPLORE MATCHES
                  </Link>
                </div>

              ) : (

                <div className="br-game-grid">

                  {gamesWithCounts.map((game) => {
                    const date = formatMatchDate(game.slot_start);
                    const startTime = formatMatchTime(game.slot_start);
                    const endTime = formatMatchTime(game.slot_end);

                    const turf = game.turfs;
                    const venue = turf?.venues;

                    const isFull =
                      game.status === "FULL" ||
                      game.available === 0;

                    return (
                      <Link
                        href={`/matches/${game.id}`}
                        key={game.id}
                        className="br-game-card"
                      >

                        <div className="br-card-top">
                          <span className="br-card-date">
                            {date}
                          </span>

                          <span
                            className={`br-status ${
                              isFull
                                ? "br-status-full"
                                : "br-status-open"
                            }`}
                          >
                            {isFull ? "FULL" : "OPEN"}
                          </span>
                        </div>

                        <div className="br-card-time">
                          {startTime}
                          <span>—</span>
                          {endTime}
                        </div>

                        <div className="br-card-divider" />

                        <div className="br-card-venue">
                          <div className="br-card-label">
                            VENUE
                          </div>

                          <h3>
                            {venue?.name || "Football Venue"}
                          </h3>

                          <p>
                            {turf?.name || "Football Turf"}
                            {venue?.locality
                              ? ` · ${venue.locality}`
                              : ""}
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

          {/* =================================================
              HOW IT WORKS
          ================================================= */}

          <section className="br-how br-how-locker">
            <div className="br-container">

              <div className="br-how-heading">
                <div className="br-kicker">
                  SIMPLE. SOCIAL. FOOTBALL.
                </div>

                <h2>LESS TALK. MORE FOOTBALL.</h2>
              </div>

              <div className="br-steps">

                <div className="br-step">
                  <span>01</span>
                  <h3>DISCOVER</h3>
                  <p>
                    Find upcoming games and football turfs around you.
                  </p>
                </div>

                <div className="br-step">
                  <span>02</span>
                  <h3>JOIN</h3>
                  <p>
                    Book your individual player spot and join the squad.
                  </p>
                </div>

                <div className="br-step">
                  <span>03</span>
                  <h3>PLAY</h3>
                  <p>
                    Show up, meet the team, and let your football speak.
                  </p>
                </div>

              </div>
            </div>
          </section>

          {/* =================================================
              MARKETPLACE
          ================================================= */}

          <section className="br-market-section">
            <div className="br-container">

              <Link
                href="/marketplace"
                className="br-market-door"
              >

                <div
                  className="br-market-texture"
                  aria-hidden="true"
                />

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

          {/* =================================================
              HOST A GAME
          ================================================= */}

          <section className="br-host-section">
            <div className="br-container">

              <div className="br-host">

                <div>
                  <div className="br-kicker">
                    BRING PEOPLE TOGETHER
                  </div>

                  <h2>HAVE A GAME IN MIND?</h2>

                  <p>
                    Host a game and bring your football community together.
                  </p>
                </div>

                <Link
                  href="/owner"
                  className="br-button br-button-green"
                >
                  CREATE A GAME
                </Link>

              </div>

            </div>
          </section>

        </main>

        {/* =================================================
            FOOTER
        ================================================= */}

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
