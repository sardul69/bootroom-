
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

      <style jsx global>{`
        .br-home {
          --br-bg: #070b09;
          --br-panel: #0d1410;
          --br-green: #78ffad;
          --br-muted: #9ca9a0;
          --br-border: rgba(255,255,255,.1);
          background: var(--br-bg);
          color: #f4f7f4;
          min-height: 100vh;
          overflow: hidden;
          font-family: inherit;
        }

        .br-home * { box-sizing: border-box; }
        .br-home a { text-decoration: none; }

        .br-container {
          width: min(1180px, calc(100% - 48px));
          margin: 0 auto;
        }

        .br-header {
          position: relative;
          z-index: 20;
          background: rgba(5,9,7,.96);
          border-bottom: 1px solid rgba(255,255,255,.08);
        }

        .br-nav {
          width: min(1320px, calc(100% - 48px));
          min-height: 86px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 28px;
        }

        .br-logo { display: flex; align-items: center; flex-shrink: 0; }
        .br-logo img { object-fit: contain; }

        .br-navlinks, .br-nav-actions {
          display: flex;
          align-items: center;
          gap: 28px;
        }

        .br-navlinks a, .br-signin {
          color: #c1ccc4;
          font-size: 13px;
          font-weight: 700;
          transition: color .2s;
        }

        .br-navlinks a:hover, .br-signin:hover { color: var(--br-green); }

        .br-nav-actions { gap: 14px; }

        .br-avatar {
          width: 43px;
          height: 43px;
          border-radius: 50%;
          overflow: hidden;
          border: 1px solid var(--br-green);
          background: #13291c;
          color: var(--br-green);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
        }

        .br-avatar img { width: 100%; height: 100%; object-fit: cover; }

        .br-nav-button {
          padding: 13px 19px;
          background: var(--br-green);
          color: #061009;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .7px;
          border-radius: 3px;
        }

        .br-hero {
          position: relative;
          min-height: 650px;
          display: flex;
          align-items: center;
          background: #080d0a;
          isolation: isolate;
          overflow: hidden;
        }

        .br-hero-image {
          position: absolute;
          inset: 0;
          z-index: -2;
          background-image: url("https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=2200&q=90");
          background-position: center 53%;
          background-size: cover;
          transform: scale(1.025);
        }

        .br-hero-shade {
          position: absolute;
          inset: 0;
          z-index: -1;
          background:
            linear-gradient(90deg, rgba(3,8,5,.97) 0%, rgba(3,8,5,.86) 42%, rgba(3,8,5,.3) 100%),
            linear-gradient(0deg, #070b09 0%, transparent 32%, rgba(0,0,0,.12) 100%);
        }

        .br-hero-content {
          width: min(1180px, calc(100% - 48px));
          margin: 0 auto;
          padding: 100px 0 95px;
          position: relative;
        }

        .br-eyebrow, .br-kicker {
          color: var(--br-green);
          font-size: 10px;
          letter-spacing: 3px;
          font-weight: 900;
        }

        .br-eyebrow { display: flex; align-items: center; gap: 10px; }

        .br-live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--br-green);
          box-shadow: 0 0 12px var(--br-green);
        }

        .br-hero h1 {
          margin: 28px 0 24px;
          font-size: clamp(54px, 8.5vw, 108px);
          line-height: .91;
          letter-spacing: -5px;
          font-weight: 950;
          color: #fff;
        }

        .br-hero h1 span {
          color: var(--br-green);
          text-shadow: 0 0 35px rgba(120,255,173,.17);
        }

        .br-hero-content > p {
          max-width: 480px;
          color: #c1cdc5;
          font-size: 16px;
          line-height: 1.8;
          margin: 0 0 30px;
        }

        .br-hero-actions { display: flex; flex-wrap: wrap; gap: 12px; }

        .br-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 48px;
          padding: 0 23px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1.1px;
          border-radius: 3px;
          transition: transform .2s, background .2s, border-color .2s;
        }

        .br-button:hover { transform: translateY(-2px); }

        .br-button-green {
          background: var(--br-green);
          color: #061009;
          border: 1px solid var(--br-green);
        }

        .br-button-green:hover { background: #a0ffc2; }

        .br-button-outline {
          border: 1px solid rgba(255,255,255,.38);
          color: white;
          background: rgba(0,0,0,.2);
        }

        .br-button-outline:hover { border-color: var(--br-green); }

        .br-hero-foot {
          display: flex;
          flex-wrap: wrap;
          gap: 28px;
          margin-top: 65px;
          padding-top: 20px;
          border-top: 1px solid rgba(255,255,255,.2);
          max-width: 590px;
          color: #a8b4ab;
          font-size: 9px;
          letter-spacing: 1.5px;
          font-weight: 800;
        }

        .br-hero-index {
          position: absolute;
          right: 5%;
          bottom: 48px;
          display: flex;
          align-items: center;
          gap: 12px;
          color: rgba(255,255,255,.65);
          font-size: 9px;
          letter-spacing: 2px;
        }

        .br-hero-index span:first-child { color: var(--br-green); }
        .br-index-line { width: 50px; height: 1px; background: var(--br-green); }

        .br-section { padding: 100px 0; }

        .br-section-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 25px;
          margin-bottom: 38px;
        }

        .br-section-heading h2, .br-how-heading h2 {
          margin: 13px 0 9px;
          font-size: clamp(30px, 5vw, 52px);
          letter-spacing: -2px;
          line-height: 1;
          font-weight: 950;
        }

        .br-section-heading h2 span { color: var(--br-green); }

        .br-section-heading p, .br-host p {
          color: var(--br-muted);
          font-size: 14px;
          line-height: 1.7;
          margin: 0;
        }

        .br-text-link {
          color: var(--br-green);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.5px;
          padding-bottom: 7px;
          border-bottom: 1px solid rgba(120,255,173,.5);
          white-space: nowrap;
        }

        .br-game-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
        }

        .br-game-card {
          min-width: 0;
          display: flex;
          flex-direction: column;
          padding: 24px;
          color: #f4f7f4;
          background:
            linear-gradient(145deg, rgba(255,255,255,.035), transparent 55%),
            #0d1410;
          border: 1px solid rgba(255,255,255,.1);
          transition: border-color .2s, transform .2s, background .2s;
        }

        .br-game-card:hover {
          border-color: rgba(120,255,173,.65);
          transform: translateY(-4px);
          background-color: #111c15;
        }

        .br-card-top, .br-price-row, .br-card-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .br-card-date, .br-card-label {
          color: #9daaa1;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .br-status {
          padding: 6px 8px;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 1px;
          border: 1px solid;
        }

        .br-status-open {
          color: var(--br-green);
          border-color: rgba(120,255,173,.35);
          background: rgba(120,255,173,.07);
        }

        .br-status-full {
          color: #ffb5a9;
          border-color: rgba(255,181,169,.3);
          background: rgba(255,181,169,.06);
        }

        .br-card-time {
          margin: 20px 0;
          font-size: 21px;
          font-weight: 900;
          letter-spacing: -.5px;
        }

        .br-card-time span { color: var(--br-green); }

        .br-card-divider {
          height: 1px;
          background: rgba(255,255,255,.1);
          margin-bottom: 21px;
        }

        .br-card-venue h3 {
          font-size: 21px;
          line-height: 1.2;
          margin: 8px 0;
          font-weight: 900;
        }

        .br-card-venue p {
          min-height: 21px;
          color: var(--br-muted);
          font-size: 12px;
          margin: 0;
        }

        .br-card-bottom { margin-top: 26px; }

        .br-format, .br-spots {
          color: #aab7ae;
          font-size: 10px;
        }

        .br-format {
          border: 1px solid rgba(255,255,255,.14);
          padding: 6px 8px;
          text-transform: uppercase;
          letter-spacing: .7px;
        }

        .br-price-row {
          border-top: 1px solid rgba(255,255,255,.1);
          margin-top: 20px;
          padding-top: 17px;
        }

        .br-price { font-size: 26px; font-weight: 950; }
        .br-price small {
          display: block;
          margin-top: 3px;
          color: #8d9b91;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .br-join {
          color: var(--br-green);
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1px;
        }

        .br-empty {
          padding: 55px 25px;
          text-align: center;
          border: 1px solid rgba(255,255,255,.12);
          background: #0c130f;
          color: var(--br-muted);
        }

        .br-empty-mark {
          color: var(--br-green);
          font-weight: 950;
          font-size: 38px;
          letter-spacing: -3px;
        }

        .br-empty h3 { color: white; letter-spacing: 2px; }
        .br-empty p { font-size: 13px; margin-bottom: 24px; }

        .br-how {
          padding: 85px 0 100px;
          background: #0b100d;
          border-top: 1px solid rgba(255,255,255,.06);
          border-bottom: 1px solid rgba(255,255,255,.06);
        }

        .br-how-heading { margin-bottom: 42px; }
        .br-how-heading h2 { max-width: 700px; }

        .br-steps {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 30px;
        }

        .br-step {
          padding: 25px 0 0;
          border-top: 1px solid rgba(120,255,173,.45);
        }

        .br-step > span {
          color: var(--br-green);
          font-size: 13px;
          font-weight: 950;
          letter-spacing: 2px;
        }

        .br-step h3 {
          margin: 20px 0 9px;
          font-size: 19px;
          letter-spacing: 1.5px;
        }

        .br-step p {
          color: var(--br-muted);
          font-size: 13px;
          line-height: 1.8;
          max-width: 290px;
          margin: 0;
        }

        /* MARKETPLACE ENGRAVED ENTRANCE */
        .br-market-section {
          padding: 90px 0;
          background:
            radial-gradient(ellipse at 50% 50%, rgba(94,132,92,.10), transparent 65%),
            #070b09;
        }

        .br-market-door {
          position: relative;
          display: block;
          padding: 12px;
          overflow: hidden;
          color: #eee4c8;
          background:
            linear-gradient(135deg, #252821 0%, #10140f 24%, #27271e 48%, #0c100d 75%, #29281e 100%);
          border: 1px solid rgba(191,164,104,.65);
          box-shadow:
            0 25px 70px rgba(0,0,0,.5),
            inset 0 0 35px rgba(0,0,0,.8),
            0 0 35px rgba(120,255,173,.045);
          transition: border-color .3s, box-shadow .3s, transform .3s;
        }

        .br-market-door:hover {
          transform: translateY(-3px);
          border-color: #d2b779;
          box-shadow:
            0 30px 80px rgba(0,0,0,.65),
            inset 0 0 35px rgba(0,0,0,.8),
            0 0 38px rgba(120,255,173,.12);
        }

        .br-market-texture {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: .35;
          background:
            repeating-linear-gradient(115deg, transparent 0 22px, rgba(255,255,255,.018) 23px, transparent 24px),
            radial-gradient(ellipse at 50% 0%, rgba(203,177,118,.13), transparent 70%);
        }

        .br-market-border {
          position: relative;
          z-index: 1;
          min-height: 370px;
          border: 1px solid rgba(194,165,105,.4);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 22px 27px;
        }

        .br-market-topline, .br-market-bottom {
          display: flex;
          justify-content: space-between;
          gap: 15px;
          color: #a89a73;
          font-size: 9px;
          letter-spacing: 2px;
          font-weight: 900;
        }

        .br-market-center {
          text-align: center;
          padding: 24px 10px 32px;
        }

        .br-market-emblem {
          width: 62px;
          height: 62px;
          margin: 0 auto 17px;
          display: grid;
          place-items: center;
          border: 1px solid #b99c5e;
          transform: rotate(45deg);
          box-shadow: 0 0 25px rgba(120,255,173,.09);
        }

        .br-market-emblem span {
          transform: rotate(-45deg);
          color: var(--br-green);
          font-size: 19px;
          font-weight: 950;
          letter-spacing: -2px;
        }

        .br-market-overline {
          color: #b9a575;
          font-size: 9px;
          letter-spacing: 4px;
          font-weight: 900;
        }

        .br-market-center h2 {
          margin: 13px 0;
          color: #e8ddbd;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(32px, 6vw, 62px);
          font-weight: 500;
          letter-spacing: 4px;
          text-shadow: 0 3px 18px rgba(0,0,0,.9);
        }

        .br-market-center p {
          color: #b5b09b;
          font-size: 13px;
          line-height: 1.8;
          margin: 0 0 23px;
        }

        .br-market-enter {
          display: inline-block;
          padding: 13px 24px;
          color: #0a100c;
          background: linear-gradient(135deg, #c8b47d, #8f7847);
          border: 1px solid #dfc993;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 2px;
          box-shadow: 0 5px 22px rgba(0,0,0,.4);
          transition: filter .2s;
        }

        .br-market-door:hover .br-market-enter { filter: brightness(1.18); }

        .br-host-section { padding: 35px 0 100px; }

        .br-host {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 30px;
          padding: 40px;
          border: 1px solid rgba(120,255,173,.2);
          background:
            linear-gradient(110deg, rgba(120,255,173,.07), transparent 65%),
            #0c130f;
        }

        .br-host h2 {
          margin: 12px 0 10px;
          font-size: clamp(27px, 4vw, 42px);
          letter-spacing: -1.5px;
        }

        .br-footer {
          border-top: 1px solid rgba(255,255,255,.1);
          background: #050806;
          padding: 25px 0;
        }

        .br-footer-inner {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .br-footer-inner img { object-fit: contain; }

        .br-footer-inner > div {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .br-footer-inner strong {
          font-size: 13px;
          letter-spacing: 2px;
        }

        .br-footer-inner > div span, .br-footer-copy {
          color: #87948b;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .br-footer-copy { margin-left: auto; }

        @media (max-width: 900px) {
          .br-game-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .br-nav { gap: 15px; }
          .br-navlinks { gap: 16px; }
          .br-nav-button { display: none; }
          .br-hero { min-height: 610px; }
        }

        @media (max-width: 600px) {
          .br-container { width: min(100% - 32px, 1180px); }

          .br-nav {
            width: calc(100% - 28px);
            min-height: 72px;
            flex-wrap: wrap;
            justify-content: space-between;
            gap: 0;
            padding: 5px 0 10px;
          }

          .br-logo img { width: 88px; height: 70px; }
          .br-navlinks {
            order: 3;
            width: 100%;
            justify-content: space-between;
            gap: 12px;
            padding: 9px 0 2px;
            border-top: 1px solid rgba(255,255,255,.08);
          }

          .br-navlinks a { font-size: 11px; }
          .br-nav-actions { margin-left: auto; gap: 12px; }
          .br-nav-button { display: none; }
          .br-avatar { width: 37px; height: 37px; }

          .br-hero { min-height: 610px; }
          .br-hero-image { background-position: 58% center; }
          .br-hero-shade {
            background:
              linear-gradient(90deg, rgba(3,8,5,.94), rgba(3,8,5,.56)),
              linear-gradient(0deg, #070b09, transparent 55%);
          }

          .br-hero-content {
            width: calc(100% - 36px);
            padding: 75px 0 70px;
          }

          .br-hero h1 {
            font-size: clamp(49px, 13vw, 76px);
            letter-spacing: -3px;
            margin: 24px 0;
          }

          .br-hero-content > p { font-size: 14px; max-width: 340px; }
          .br-hero-foot { margin-top: 45px; gap: 12px 20px; font-size: 8px; }
          .br-hero-index { display: none; }

          .br-section { padding: 70px 0; }
          .br-section-heading {
            align-items: flex-start;
            flex-direction: column;
            margin-bottom: 28px;
          }

          .br-section-heading h2, .br-how-heading h2 {
            font-size: 34px;
            letter-spacing: -1.5px;
          }

          .br-game-grid { grid-template-columns: 1fr; gap: 13px; }
          .br-game-card { padding: 21px; }

          .br-how { padding: 70px 0; }
          .br-steps { grid-template-columns: 1fr; gap: 28px; }
          .br-step { padding-top: 19px; }
          .br-step h3 { margin-top: 12px; }

          .br-market-section { padding: 65px 0; }
          .br-market-door { padding: 7px; }
          .br-market-border { min-height: 350px; padding: 15px 12px; }
          .br-market-topline, .br-market-bottom {
            font-size: 7px;
            letter-spacing: 1px;
          }

          .br-market-center h2 {
            font-size: clamp(27px, 8vw, 42px);
            letter-spacing: 1.5px;
          }

          .br-market-center p { font-size: 12px; }
          .br-market-enter { padding: 12px 16px; font-size: 8px; }

          .br-host-section { padding: 10px 0 70px; }
          .br-host {
            align-items: flex-start;
            flex-direction: column;
            padding: 27px 22px;
          }

          .br-footer-inner { flex-wrap: wrap; gap: 12px; }
          .br-footer-inner img { width: 70px; height: 65px; }
          .br-footer-copy { width: 100%; margin-left: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .br-home *, .br-home *::before, .br-home *::after {
            transition-duration: .01ms !important;
            animation-duration: .01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </>
  );
}
