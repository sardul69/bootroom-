"use client";

export default function ProfileMenu() {
  return (
    <details className="tz-profile-menu">
      <summary aria-label="Open profile settings">
        <span>•••</span>
      </summary>

      <nav className="tz-profile-menu-panel">
        <a href="/profile/edit/">Account settings</a>
        <a href="#player-identity">Player identity</a>
        <a href="#player-activity">Player statistics</a>
        <a href="#booking-history">Booking history</a>

        <form action="/auth/signout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </nav>
    </details>
  );
}
