"use client";

import { useEffect, useState, type FormEvent } from "react";

type Turf = {
  id: string;
  name: string;
  format: string;
  surface: string;
  starting_price: number | null;
  venue:
    | {
        name: string;
        locality: string;
        address: string;
      }
    | {
        name: string;
        locality: string;
        address: string;
      }[]
    | null;
};

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [turfId, setTurfId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("14");
  const [playerFee, setPlayerFee] = useState("");
  const [bookingAmount, setBookingAmount] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const response = await fetch("/api/admin/games", {
          cache: "no-store",
        });
        const data = await response.json();

        if (!response.ok) {
          setStatus(data.error || "Unable to load dashboard.");
          return;
        }

        setEmail(data.email || "");
        setTurfs(data.turfs || []);
        if (data.turfs?.length) {
          setTurfId(data.turfs[0].id);
        }
      } catch {
        setStatus("Unable to connect to the server.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  async function createGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");

    try {
      const response = await fetch("/api/admin/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          turfId,
          start,
          end,
          capacity,
          playerFee,
          bookingAmount,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        setStatus(data.error || "Game creation failed.");
        return;
      }

      setStatus("Game created successfully. It is now available on Turfzy.");
      setStart("");
      setEnd("");
      setCapacity("14");
      setPlayerFee("");
      setBookingAmount("");
    } catch {
      setStatus("Connection error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/admin/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      window.location.assign("/admin/login");
    }
  }

  const selectedTurf = turfs.find((turf) => turf.id === turfId);
  const venue = Array.isArray(selectedTurf?.venue)
    ? selectedTurf.venue[0]
    : selectedTurf?.venue;

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse at 50% 0%, #173d2a 0%, #0b110d 48%, #050706 100%)",
        color: "#f2f7f3",
        padding: "28px 16px 60px",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            borderBottom: "1px solid rgba(120,255,170,.18)",
            paddingBottom: 22,
            marginBottom: 30,
          }}
        >
          <div>
            <div
              style={{
                color: "#78ffad",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 3,
              }}
            >
              TURFZY · ADMINISTRATION
            </div>
            <h1 style={{ fontSize: 30, margin: "8px 0 4px" }}>
              ADMIN DASHBOARD
            </h1>
            <p style={{ color: "#a8b8ad", margin: 0, fontSize: 13 }}>
              {email || "Administrator account"}
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            style={secondaryButton}
          >
            SIGN OUT
          </button>
        </header>

        <section style={panel}>
          <div style={eyebrow}>YOUR ACCESS</div>
          <h2 style={{ margin: "8px 0", fontSize: 21 }}>
            Game Administration
          </h2>
          <p style={{ color: "#b3c0b7", lineHeight: 1.6, margin: 0 }}>
            Your administrator account currently has permission to create
            games. Your dashboard and access are personal to your account.
          </p>
        </section>

        <section style={{ ...panel, marginTop: 20 }}>
          <div style={eyebrow}>GAME MANAGEMENT</div>
          <h2 style={{ margin: "8px 0 22px", fontSize: 23 }}>
            Create a new game
          </h2>

          {loading ? (
            <p style={{ color: "#b3c0b7" }}>Loading your dashboard...</p>
          ) : turfs.length === 0 ? (
            <p style={{ color: "#b3c0b7", lineHeight: 1.6 }}>
              No active turfs are currently available. Contact the owner to
              have a turf activated before creating a game.
            </p>
          ) : (
            <form onSubmit={createGame}>
              <div style={field}>
                <label htmlFor="admin-turf">Select turf</label>
                <select
                  id="admin-turf"
                  value={turfId}
                  onChange={(event) => setTurfId(event.target.value)}
                  required
                  style={control}
                >
                  {turfs.map((turf) => (
                    <option key={turf.id} value={turf.id}>
                      {turf.name} — {(Array.isArray(turf.venue) ? turf.venue[0]?.name : turf.venue?.name) || "Venue"}
                    </option>
                  ))}
                </select>
                {venue && (
                  <small style={{ color: "#9eafa4" }}>
                    {venue.locality} · {venue.address}
                  </small>
                )}
              </div>

              <div style={twoColumns}>
                <div style={field}>
                  <label htmlFor="admin-start">Game start (IST)</label>
                  <input
                    id="admin-start"
                    type="datetime-local"
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                    required
                    style={control}
                  />
                </div>

                <div style={field}>
                  <label htmlFor="admin-end">Game end (IST)</label>
                  <input
                    id="admin-end"
                    type="datetime-local"
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                    required
                    style={control}
                  />
                </div>
              </div>

              <div style={twoColumns}>
                <div style={field}>
                  <label htmlFor="admin-capacity">Player capacity</label>
                  <input
                    id="admin-capacity"
                    type="number"
                    min="2"
                    max="30"
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                    required
                    style={control}
                  />
                </div>

                <div style={field}>
                  <label htmlFor="admin-fee">Full player fee (₹)</label>
                  <input
                    id="admin-fee"
                    type="number"
                    min="1"
                    step="0.01"
                    value={playerFee}
                    onChange={(event) => setPlayerFee(event.target.value)}
                    required
                    style={control}
                  />
                </div>
              </div>

              <div style={field}>
                <label htmlFor="admin-booking">
                  Booking amount per player (₹)
                </label>
                <input
                  id="admin-booking"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={bookingAmount}
                  onChange={(event) => setBookingAmount(event.target.value)}
                  required
                  style={control}
                />
                <small style={{ color: "#9eafa4" }}>
                  Must be positive and cannot exceed the full player fee.
                </small>
              </div>

              <button
                type="submit"
                disabled={submitting || !turfId}
                style={{
                  ...primaryButton,
                  opacity: submitting || !turfId ? 0.6 : 1,
                }}
              >
                {submitting ? "CREATING GAME..." : "CREATE GAME"}
              </button>
            </form>
          )}

          {status && (
            <p
              role="status"
              style={{
                marginTop: 18,
                color: status.includes("successfully")
                  ? "#78ffad"
                  : "#ffb5a8",
                lineHeight: 1.6,
              }}
            >
              {status}
            </p>
          )}
        </section>

        <section style={{ ...panel, marginTop: 20 }}>
          <div style={eyebrow}>COMING LATER</div>
          <h2 style={{ margin: "8px 0", fontSize: 19 }}>
            More administrator tools are on the way.
          </h2>
          <p style={{ color: "#b3c0b7", lineHeight: 1.6, margin: 0 }}>
            Additional options and responsibilities will be introduced here
            as Turfzy expands. Your current access is limited to the
            permissions assigned by the owner.
          </p>
        </section>

        <p
          style={{
            color: "#73847a",
            fontSize: 11,
            textAlign: "center",
            marginTop: 30,
            letterSpacing: 1,
          }}
        >
          TURFZY · AUTHORIZED ADMINISTRATOR ACCESS
        </p>
      </div>
    </main>
  );
}

const panel: React.CSSProperties = {
  background: "linear-gradient(145deg, rgba(24,34,28,.98), rgba(8,12,9,.98))",
  border: "1px solid rgba(120,255,170,.18)",
  borderRadius: 20,
  padding: 24,
  boxShadow: "0 18px 50px rgba(0,0,0,.25)",
};

const eyebrow: React.CSSProperties = {
  color: "#78ffad",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 2.5,
};

const field: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  marginBottom: 18,
};

const control: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "13px 14px",
  borderRadius: 10,
  border: "1px solid rgba(120,255,170,.2)",
  background: "#0a100c",
  color: "#f2f7f3",
  fontSize: 14,
  minHeight: 46,
};

const twoColumns: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const primaryButton: React.CSSProperties = {
  width: "100%",
  border: 0,
  borderRadius: 10,
  padding: "15px 18px",
  background: "#78ffad",
  color: "#07110a",
  fontWeight: 900,
  letterSpacing: 1,
  cursor: "pointer",
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid rgba(120,255,170,.25)",
  borderRadius: 9,
  padding: "11px 16px",
  background: "transparent",
  color: "#dce8df",
  fontWeight: 800,
  cursor: "pointer",
};
