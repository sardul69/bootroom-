
"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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

const confetti = Array.from({ length: 72 }, (_, i) => ({
  id: i,
  left: `${(i * 37 + 7) % 100}%`,
  delay: `${(i % 18) * 0.055}s`,
  duration: `${2.8 + (i % 11) * 0.17}s`,
  color: ["#e7c879", "#f8f1d9", "#5cf58e", "#c8a4ff", "#ff9dba"][i % 5],
}));

// Strictly interpret YYYY-MM-DD HH:MM as Indian Standard Time.
// This does not depend on the browser/device timezone.
function parseIstDateTime(value: string): Date | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(value.trim());

  if (!match) return null;

  const [, ys, mos, ds, hs, mis] = match;
  const year = Number(ys);
  const month = Number(mos);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mis);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const calendarCheck = new Date(
    Date.UTC(year, month - 1, day, hour, minute)
  );

  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return null;
  }

  const result = new Date(
    `${ys}-${mos}-${ds}T${hs}:${mis}:00+05:30`
  );

  return Number.isNaN(result.getTime()) ? null : result;
}

export default function OwnerConsole({ email }: { email: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [turfId, setTurfId] = useState("");
  const [turfName, setTurfName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [playerFee, setPlayerFee] = useState("");
  const [bookingAmount, setBookingAmount] = useState("");
  const [loadingTurfs, setLoadingTurfs] = useState(true);
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
        setMessage("Could not load turfs. " + error.message);
      } else {
        const loaded = (data ?? []) as Turf[];
        setTurfs(loaded);
      }

      setLoadingTurfs(false);
    }

    void load();

    const timer = window.setTimeout(() => setCelebrate(false), 4200);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [supabase]);

  function handleTurfNameChange(value: string) {
    setTurfName(value);

    const matchingTurf = turfs.find(
      (turf) =>
        turf.name.trim().toLowerCase() === value.trim().toLowerCase()
    );

    setTurfId(matchingTurf?.id ?? "");
  }

  async function resolveTurfId(): Promise<string | null> {
    const cleanName = turfName.trim();

    if (!cleanName) {
      setMessage("Enter a turf name.");
      return null;
    }

    const existingTurf = turfs.find(
      (turf) => turf.name.trim().toLowerCase() === cleanName.toLowerCase()
    );

    if (existingTurf) {
      setTurfId(existingTurf.id);
      return existingTurf.id;
    }

    // New turf records must be created by the protected server endpoint.
    const response = await fetch("/api/owner/access/operations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        action: "create-turf",
        name: cleanName,
      }),
    });

    const result = await response.json();

    if (!response.ok || typeof result.id !== "string") {
      setMessage(result.error || "Could not save this turf.");
      return null;
    }

    const savedTurf: Turf = {
      id: result.id,
      name: result.name || cleanName,
      venues: [
        {
          name: result.name || cleanName,
          locality: "Kolkata",
        },
      ],
    };

    setTurfs((current) => {
      const alreadyAdded = current.some((turf) => turf.id === savedTurf.id);
      if (alreadyAdded) return current;

      return [...current, savedTurf].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    });

    setTurfName(savedTurf.name);
    setTurfId(savedTurf.id);

    return savedTurf.id;
  }

  async function createGame() {
    setMessage("");

    const startDate = parseIstDateTime(start);
    const endDate = parseIstDateTime(end);
    const fee = Number(playerFee);
    const bookingFee = Number(bookingAmount);
    const seats = Number(capacity);

    if (
      !turfName.trim() ||
      !start.trim() ||
      !end.trim() ||
      !playerFee.trim() ||
      !bookingAmount.trim()
    ) {
      setMessage("Complete every field before creating the game.");
      return;
    }

    if (!startDate || !endDate) {
      setMessage(
        "Enter valid dates as YYYY-MM-DD HH:MM using Indian Standard Time."
      );
      return;
    }

    if (endDate <= startDate) {
      setMessage("The end time must be later than the start time.");
      return;
    }

    if (startDate <= new Date()) {
      setMessage("The game must start in the future.");
      return;
    }

    if (!Number.isInteger(seats) || seats < 2 || seats > 30) {
      setMessage("Player capacity must be a whole number between 2 and 30.");
      return;
    }

    if (!Number.isFinite(fee) || fee < 1 || fee > 100000) {
      setMessage("Enter a valid player fee.");
      return;
    }

    if (
      !Number.isFinite(bookingFee) ||
      bookingFee < 1 ||
      bookingFee >= fee
    ) {
      setMessage(
        "The booking amount must be at least ₹1 and less than the full player fee."
      );
      return;
    }

    if (
      Math.round(fee * 100) !== fee * 100 ||
      Math.round(bookingFee * 100) !== bookingFee * 100
    ) {
      setMessage("Amounts can have a maximum of two decimal places.");
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

      const resolvedTurfId = await resolveTurfId();

      if (!resolvedTurfId) return;

      // Preserve the existing database RPC, including its booking logic.
      const { data, error } = await supabase.rpc("create_game", {
        p_turf_id: resolvedTurfId,
        p_host_user_id: user.id,
        p_start: startDate.toISOString(),
        p_end: endDate.toISOString(),
        p_player_capacity: seats,
        p_player_fee: fee,
        p_booking_amount: bookingFee,
      });

      if (error) {
        setMessage("Could not create the game. " + error.message);
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

      if (typeof gameId !== "string" || !gameId) {
        setMessage(
          "The database did not return a game ID. Check the game record before retrying."
        );
        return;
      }

      router.push(`/matches/${encodeURIComponent(gameId)}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create game."
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

  const inputStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
  };

  return (
    <main className="royal-dashboard">
      {celebrate && (
        <div className="royal-confetti" aria-hidden="true">
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
          <span className="royal-mini-crown" aria-hidden="true">
            ♛
          </span>
          <span>BOOTROOM</span>
          <span className="royal-owner-chip">OWNER</span>
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
        <div className="royal-eyebrow">PRIVATE COMMAND CENTRE</div>

        <h1 className="royal-title">
          Welcome back,
          <br />
          <span>Your Majesty.</span>
        </h1>

        <p className="royal-intro">
          Your pitch. Your people. Your decisions. Privileged database actions
          remain independently authorized.
        </p>

        <section className="royal-status-card">
          <div className="royal-status-icon" aria-hidden="true">
            ♛
          </div>
          <div>
            <div className="royal-kicker">AUTHENTICATED OWNER</div>
            <div className="royal-account">{email}</div>
            <div className="royal-status-line">
              <span />
              Owner access verified for this session
            </div>
          </div>
        </section>

        <section className="royal-section-heading">
          <div className="royal-kicker">OPERATIONS</div>
          <h2>Create a game</h2>
          <p>
            Set the full fee and a separate fixed booking amount per player.
            Players see their individual fee, not the venue rental total.
          </p>
        </section>

        <section className="royal-game-card">
          <div className="royal-card-heading">
            <span className="royal-card-mark" aria-hidden="true">
              ✦
            </span>
            <div>
              <div className="royal-kicker">MATCH SETUP</div>
              <h3>New football session</h3>
            </div>
          </div>

          <label htmlFor="royal-turf">
            TURF NAME (TYPE OR SELECT SAVED TURF)
          </label>

          <input
            id="royal-turf"
            list="royal-turf-options"
            value={turfName}
            onChange={(event) => handleTurfNameChange(event.target.value)}
            disabled={loadingTurfs || loading}
            placeholder={
              loadingTurfs
                ? "Loading saved turfs…"
                : "Type a turf name or choose a saved one"
            }
            autoComplete="off"
            style={inputStyle}
          />

          <datalist id="royal-turf-options">
            {turfs.map((turf) => (
              <option key={turf.id} value={turf.name} />
            ))}
          </datalist>

          <p className="royal-form-note">
            New turf names are saved for reuse. Enter date and time in Kolkata
            time (IST).
          </p>

          <div className="royal-field-grid">
            <div>
              <label htmlFor="royal-start">START DATE &amp; TIME (IST)</label>
              <input
                id="royal-start"
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="YYYY-MM-DD HH:MM"
                value={start}
                onChange={(event) => setStart(event.target.value)}
                disabled={loading}
                style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="royal-end">END DATE &amp; TIME (IST)</label>
              <input
                id="royal-end"
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="YYYY-MM-DD HH:MM"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                disabled={loading}
                style={inputStyle}
              />
            </div>
          </div>

          <p className="royal-form-note">
            Example: 2026-11-08 18:30 means 6:30 PM in India, regardless of
            your device timezone.
          </p>

          <div className="royal-field-grid">
            <div>
              <label htmlFor="royal-capacity">PLAYER CAPACITY</label>
              <input
                id="royal-capacity"
                type="number"
                min="2"
                max="30"
                step="1"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                disabled={loading}
                style={inputStyle}
              />
            </div>

            <div>
              <label htmlFor="royal-fee">FULL FEE PER PLAYER (₹)</label>
              <input
                id="royal-fee"
                type="number"
                min="1"
                max="100000"
                step="0.01"
                value={playerFee}
                onChange={(event) => setPlayerFee(event.target.value)}
                disabled={loading}
                placeholder="e.g. 200"
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label htmlFor="royal-booking-amount">
              FIXED BOOKING AMOUNT PER PLAYER (₹)
            </label>
            <input
              id="royal-booking-amount"
              type="number"
              min="1"
              max={playerFee ? Math.max(0, Number(playerFee) - 0.01) : undefined}
              step="0.01"
              value={bookingAmount}
              onChange={(event) => setBookingAmount(event.target.value)}
              disabled={loading}
              placeholder="e.g. 30"
              style={inputStyle}
            />
            <p className="royal-form-note">
              This is a fixed amount, not a percentage. For example, if the
              full fee is ₹200 and the booking amount is ₹30, the player pays
              ₹30 now and ₹170 remains outstanding.
            </p>
          </div>

          {message && (
            <div className="royal-feedback" role="status" aria-live="polite">
              {message}
            </div>
          )}

          <button
            className="royal-create-button"
            type="button"
            onClick={createGame}
            disabled={loading || loadingTurfs}
          >
            {loading ? "CREATING SESSION…" : "CREATE GAME →"}
          </button>
        </section>

        <OwnerOperations />

        <footer className="royal-footer">
          BOOTROOM · OWNER CONSOLE · ACCESS CHECKS ENFORCED SERVER-SIDE
        </footer>
      </div>
    </main>
  );
}
