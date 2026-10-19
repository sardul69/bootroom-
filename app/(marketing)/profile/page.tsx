import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  const name =
    profile?.full_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "Football Player";
  const initial = name.charAt(0).toUpperCase();
  return (
    <main className="page">
      <div className="container" style={{ maxWidth: 900, margin: "0 auto" }}>
        <header style={{ padding: "28px 0 18px" }}>
          <p className="label">TURFZY / PLAYER HUB</p>
          <h1 className="display" style={{ fontSize: "clamp(36px, 7vw, 58px)" }}>
            YOUR GAME.
            <br />
            YOUR IDENTITY.
          </h1>
          <p className="muted">
            Your football life, all in one place.
          </p>
        </header>
        <section
          className="panel"
          style={{
            padding: 24,
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Player avatar"
              width={88}
              height={88}
              style={{
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid #a3e635",
              }}
            />
          ) : (
            <div
              aria-label="Player avatar"
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                background: "#a3e635",
                color: "#101010",
                fontSize: 36,
                fontWeight: 900,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ flex: "1 1 220px", minWidth: 0 }}>
            <p className="label">PLAYER PROFILE</p>
            <h2 style={{ fontSize: 26, margin: "6px 0" }}>{name}</h2>
            <p className="muted" style={{ overflowWrap: "anywhere" }}>
              {user.email}
            </p>
            <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              TURFZY MEMBER
            </p>
          </div>
          <Link className="btn green" href="/profile/edit/">
            EDIT PROFILE
          </Link>
        </section>
        <section style={{ marginTop: 32 }}>
          <p className="label">YOUR FOOTBALL</p>
          <h2 style={{ fontSize: 27, margin: "8px 0 18px" }}>
            The next match starts here.
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            <Link
              href="/matches"
              className="panel"
              style={{ padding: 22, textDecoration: "none" }}
            >
              <p className="label">01 / DISCOVER</p>
              <h3 style={{ fontSize: 23, margin: "12px 0 8px" }}>
                Find your game
              </h3>
              <p className="muted">
                Explore upcoming football games and find your next team.
              </p>
            </Link>
            <Link
              href="/matches"
              className="panel"
              style={{ padding: 22, textDecoration: "none" }}
            >
              <p className="label">02 / PARTICIPATE</p>
              <h3 style={{ fontSize: 23, margin: "12px 0 8px" }}>
                Your matches
              </h3>
              <p className="muted">
                Open the game listings to find games you can join.
              </p>
            </Link>
            <div className="panel" style={{ padding: 22 }}>
              <p className="label">03 / PROGRESS</p>
              <h3 style={{ fontSize: 23, margin: "12px 0 8px" }}>
                Rankings
              </h3>
              <p className="muted">
                Player rankings and match statistics can be added when the
                ranking system is connected.
              </p>
            </div>
          </div>
        </section>
        <section className="panel" style={{ padding: 22, marginTop: 28 }}>
          <p className="label">ACCOUNT</p>
          <p style={{ margin: "10px 0" }}>Signed in as</p>
          <p className="muted" style={{ overflowWrap: "anywhere" }}>
            {user.email}
          </p>
          <form action="/auth/signout" method="post" style={{ marginTop: 18 }}>
            <button className="btn" type="submit">
              SIGN OUT
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}