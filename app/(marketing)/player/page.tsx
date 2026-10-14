
import Link from "next/link";
import "./player.css";

const quickActions = [
  {
    number: "01",
    eyebrow: "FIND YOUR NEXT MATCH",
    title: "Join a game",
    description: "Find a real game, choose your slot, and get on the pitch.",
    href: "/matches",
    action: "Explore games",
    symbol: "↗",
  },
  {
    number: "02",
    eyebrow: "FIND YOUR VENUE",
    title: "Explore turfs",
    description: "Discover football venues and see the available details.",
    href: "/turfs",
    action: "Browse turfs",
    symbol: "⌖",
  },
  {
    number: "03",
    eyebrow: "YOUR PLAYER IDENTITY",
    title: "Your profile",
    description: "Visit your account to review your player information.",
    href: "/profile",
    action: "Open profile",
    symbol: "↗",
  },
];

const features = [
  { value: "01", title: "Real venues", text: "Games connected to football venues." },
  { value: "02", title: "Your squad", text: "Find opportunities to play together." },
  { value: "03", title: "One destination", text: "Your football activity starts here." },
];

export default function PlayerPage() {
  return (
    <main className="tz-player">
      <div className="tz-player-glow" aria-hidden="true" />

      <div className="tz-player-shell">
        <header className="tz-player-header">
          <Link href="/" className="tz-player-wordmark" aria-label="Turfzy home">
            TURFZY<span>®</span>
          </Link>

          <div className="tz-player-header-right">
            <span className="tz-status-dot" />
            <span>THE PLAYER CLUB</span>
          </div>
        </header>

        <section className="tz-player-hero">
          <div className="tz-player-hero-copy">
            <p className="tz-eyebrow">
              <span className="tz-eyebrow-line" />
              YOUR GAME. YOUR PEOPLE. YOUR PITCH.
            </p>

            <h1>
              BUILT
              <br />
              FOR THE <span>GAME.</span>
            </h1>

            <p className="tz-player-intro">
              Football is better when you are part of it. Find your next game,
              discover venues, and make every opportunity count.
            </p>

            <div className="tz-player-hero-actions">
              <Link href="/matches" className="tz-button tz-button-primary">
                FIND A GAME <span aria-hidden="true">↗</span>
              </Link>
              <Link href="/profile" className="tz-button tz-button-secondary">
                PLAYER PROFILE
              </Link>
            </div>
          </div>

          <div className="tz-player-emblem" aria-label="Turfzy player emblem">
            <div className="tz-emblem-orbit tz-emblem-orbit-one" />
            <div className="tz-emblem-orbit tz-emblem-orbit-two" />
            <div className="tz-emblem-core">
              <span className="tz-emblem-star">✳</span>
              <span className="tz-emblem-name">T</span>
              <span className="tz-emblem-caption">PLAY WITH PURPOSE</span>
            </div>
            <span className="tz-emblem-index">TZ / 001</span>
          </div>
        </section>

        <section className="tz-player-section" aria-labelledby="actions-heading">
          <div className="tz-section-heading">
            <div>
              <p className="tz-eyebrow">YOUR NEXT MOVE</p>
              <h2 id="actions-heading">STEP ONTO THE PITCH.</h2>
            </div>
            <span className="tz-section-count">03 / ACTIONS</span>
          </div>

          <div className="tz-player-action-grid">
            {quickActions.map((item) => (
              <article className="tz-player-action-card" key={item.number}>
                <div className="tz-action-card-top">
                  <span className="tz-action-number">{item.number}</span>
                  <span className="tz-action-symbol" aria-hidden="true">
                    {item.symbol}
                  </span>
                </div>

                <p className="tz-action-eyebrow">{item.eyebrow}</p>
                <h3>{item.title}</h3>
                <p className="tz-action-description">{item.description}</p>

                <Link className="tz-action-link" href={item.href}>
                  {item.action} <span aria-hidden="true">→</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section className="tz-player-manifesto">
          <div className="tz-manifesto-mark" aria-hidden="true">“</div>
          <div>
            <p className="tz-eyebrow">THE TURFZY STANDARD</p>
            <h2>
              LESS TALK.
              <br />
              <span>MORE FOOTBALL.</span>
            </h2>
          </div>
          <p className="tz-manifesto-copy">
            Every great football memory starts with showing up. Your next one
            could start here.
          </p>
        </section>

        <section className="tz-player-principles" aria-label="The Turfzy experience">
          {features.map((feature) => (
            <div className="tz-principle" key={feature.value}>
              <span className="tz-principle-number">{feature.value}</span>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          ))}
        </section>

        <footer className="tz-player-footer">
          <Link href="/" className="tz-player-wordmark">
            TURFZY<span>®</span>
          </Link>
          <p>MADE FOR THE LOVE OF FOOTBALL.</p>
          <Link href="/matches" className="tz-footer-link">
            FIND YOUR GAME ↗
          </Link>
        </footer>
      </div>
    </main>
  );
}
