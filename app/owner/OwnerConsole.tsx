"use client";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OwnerOperations from "@/components/owner/OwnerOperations";
type Turf = {
  id: string;
  name: string;
  venues: {
    name: string;
    locality: string;
  }[] | null;
};
const confetti = Array.from(
  { length: 72 },
  (_, i) => ({
    id: i,
    left: `${(i * 37 + 7) % 100}%`,
    delay: `${(i % 18) * 0.055}s`,
    duration: `${2.8 + (i % 11) * 0.17}s`,
    color: [
      "#e7c879",
      "#f8f1d9",
      "#5cf58e",
      "#c8a4ff",
      "#ff9dba",
    ][i % 5],
  })
);
export default function OwnerConsole({
  email,
}: {
  email: string;
}) {
  const supabase = useMemo(
    () => createClient(),
    []
  );
  const router = useRouter();
  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [turfId, setTurfId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [playerFee, setPlayerFee] = useState("");
  const [loadingTurfs, setLoadingTurfs] =
    useState(true);
  const [loading, setLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [message, setMessage] = useState("");
  const [celebrate, setCelebrate] = useState(true);
  useEffect(() => {
    let alive = true;
    async function load() {
      const { data, error } = await supabase
        .from("turfs")
        .select("id, name, venues(name, locality)")
        .order("name");
      if (!alive) return;
      if (error) {
        setMessage(
          "Could not load turfs. " + error.message
        );
      } else {
        setTurfs((data ?? []) as Turf[]);
      }
      setLoadingTurfs(false);
    }
    void load();
    const timer = window.setTimeout(
      () => setCelebrate(false),
      4200
    );
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [supabase]);
  async function createGame() {
    setMessage("");
    const startDate = new Date(start);
    const endDate = new Date(end);
    const fee = Number(playerFee);
    const seats = Number(capacity);
    if (!turfId || !start || !end || !playerFee) {
      setMessage(
        "Complete every field before creating the game."
      );
      return;
    }
    if (
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(endDate.getTime()) ||
      endDate <= startDate
    ) {
      setMessage(
        "The end time must be later than the start time."
      );
      return;
    }
    if (
      !Number.isInteger(seats) ||
      seats < 2 ||
      seats > 30
    ) {
      setMessage(
        "Player capacity must be a whole number between 2 and 30."
      );
      return;
    }
    if (
      !Number.isFinite(fee) ||
      fee < 1 ||
      fee > 100000
    ) {
      setMessage("Enter a valid player fee.");
      return;
    }
    setLoading(true);
    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError || !user) {
        router.push("/login");
        return;
      }
      const { data, error } = await supabase.rpc(
        "create_game",
        {
          p_turf_id: turfId,
          p_host_user_id: user.id,
          p_start: startDate.toISOString(),
          p_end: endDate.toISOString(),
          p_player_capacity: seats,
          p_player_fee: fee,
        }
      );
      if (error) {
        setMessage(error.message);
        return;
      }
      const gameId =
        typeof data === "string"
          ? data
          : Array.isArray(data)
            ? data[0]?.id
            : data && typeof data === "object"
              ? (data as { id?: string }).id
              : null;
      if (
        typeof gameId !== "string" ||
        !gameId
      ) {
        setMessage(
          "The database did not return a game ID. Check the game record before retrying."
        );
        return;
      }
      router.push(
        `/matches/${encodeURIComponent(gameId)}`
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to create game."
      );
    } finally {
      setLoading(false);
    }
  }
  async function lockConsole() {
    setLocking(true);
    try {
      await fetch("/api/owner/access", {
        method: "DELETE",
        cache: "no-store",
      });
    } finally {
      router.replace("/owner/unlock");
      router.refresh();
      setLocking(false);
    }
  }
  return (
    <main className="royal-dashboard">
      {celebrate && (
        <div
          className="royal-confetti"
          aria-hidden="true"
        >
          {confetti.map((piece) => (
            <i
              key={piece.id}
              style={{
                left: piece.left,
                animationDelay: piece.delay,
                animationDuration: piece.duration,
                backgroundColor: piece.color,
              }}
            />
          ))}
        </div>
      )}
      <header className="royal-topbar">
        <div className="royal-mini-brand">
          <span
            className="royal-mini-crown"
            aria-hidden="true"
          >
            ♛
          </span>
          <span>BOOTROOM</span>
          <span className="royal-owner-chip">
            OWNER
          </span>
        </div>
        <button
          className="royal-lock-button"
          onClick={lockConsole}
          disabled={locking}
        >
          {locking ? "LOCKING…" : "LOCK CONSOLE"}
        </button>
      </header>
      <div className="royal-content">
        <div className="royal-eyebrow">
          PRIVATE COMMAND CENTRE
        </div>
        <h1 className="royal-title">
          Welcome back,
          <br />
          <span>Your Majesty.</span>
        </h1>
        <p className="royal-intro">
          Your pitch. Your people. Your decisions.
          Privileged database actions remain
          independently authorized.
        </p>
        <section className="royal-status-card">
          <div
            className="royal-status-icon"
            aria-hidden="true"
          >
            ♛
          </div>
          <div>
            <div className="royal-kicker">
              AUTHENTICATED OWNER
            </div>
            <div className="royal-account">
              {email}
            </div>
            <div className="royal-status-line">
              <span />
              Owner access verified for this session
            </div>
          </div>
        </section>
        <section className="royal-section-heading">
          <div className="royal-kicker">
            OPERATIONS
          </div>
          <h2>Create a game</h2>
          <p>
            Publish a session at a listed turf.
            Players see their individual fee, not
            the venue rental total.
          </p>
        </section>
        <section className="royal-game-card">
          <div className="royal-card-heading">
            <span
              className="royal-card-mark"
              aria-hidden="true"
            >
              ✦
            </span>
            <div>
              <div className="royal-kicker">
                MATCH SETUP
              </div>
              <h3>New football session</h3>
            </div>
          </div>
          <label htmlFor="royal-turf">
            SELECT TURF
          </label>
          <select
            id="royal-turf"
            value={turfId}
            onChange={(event) =>
              setTurfId(event.target.value)
            }
            disabled={loadingTurfs || loading}
          >
            <option value="">
              {loadingTurfs
                ? "Loading turfs…"
                : "Choose a turf"}
            </option>
            {turfs.map((turf) => (
              <option
                key={turf.id}
                value={turf.id}
              >
                {turf.name}
                {turf.venues?.[0]?.locality
                  ? ` — ${turf.venues[0].locality}`
                  : ""}
              </option>
            ))}
          </select>
          <div className="royal-field-grid">
            <div>
              <label htmlFor="royal-start">
                START DATE &amp; TIME
              </label>
              <input
                id="royal-start"
                type="datetime-local"
                value={start}
                onChange={(event) =>
                  setStart(event.target.value)
                }
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="royal-end">
                END DATE &amp; TIME
              </label>
              <input
                id="royal-end"
                type="datetime-local"
                value={end}
                onChange={(event) =>
                  setEnd(event.target.value)
                }
                disabled={loading}
              />
            </div>
          </div>
          <div className="royal-field-grid">
            <div>
              <label htmlFor="royal-capacity">
                PLAYER CAPACITY
              </label>
              <input
                id="royal-capacity"
                type="number"
                min="2"
                max="30"
                step="1"
                value={capacity}
                onChange={(event) =>
                  setCapacity(event.target.value)
                }
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="royal-fee">
                FEE PER PLAYER (₹)
              </label>
              <input
                id="royal-fee"
                type="number"
                min="1"
                max="100000"
                step="1"
                value={playerFee}
                onChange={(event) =>
                  setPlayerFee(event.target.value)
                }
                disabled={loading}
                placeholder="e.g. 170"
              />
            </div>
          </div>
          <p className="royal-form-note">
            Only the per-player fee is shown to players.
            Confirm venue booking and payment
            arrangements separately.
          </p>
          {message && (
            <div
              className="royal-feedback"
              role="status"
            >
              {message}
            </div>
          )}
          <button
            className="royal-create-button"
            type="button"
            onClick={createGame}
            disabled={loading || loadingTurfs}
          >
            {loading
              ? "CREATING SESSION…"
              : "CREATE GAME →"}
          </button>
        </section>
        <OwnerOperations />
        <footer className="royal-footer">
          BOOTROOM · OWNER CONSOLE · ACCESS CHECKS
          ENFORCED SERVER-SIDE
        </footer>
      </div>
    </main>
  );
}