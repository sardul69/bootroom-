"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

import OwnerOperations from "@/components/owner/OwnerOperations";
import OwnerAdministrators from "@/components/owner/OwnerAdministrators";
import OwnerShopManager from "@/components/owner/OwnerShopManager";
import OwnerCommandSidebar, {
  type OwnerSection,
} from "@/components/owner/OwnerCommandSidebar";

/* =========================================================
   TYPES
========================================================= */

type Turf = {
  id: string;
  name: string;
  venues:
    | {
        name: string;
        locality: string;
        address?: string | null;
        maps_url?: string | null;
      }[]
    | null;
};

type SectionMeta = {
  eyebrow: string;
  title: string;
  description: string;
};

/* =========================================================
   CONSTANTS
========================================================= */

const confetti = Array.from({ length: 72 }, (_, i) => ({
  id: i,
  left: `${(i * 37 + 7) % 100}%`,
  delay: `${(i % 18) * 0.055}s`,
  duration: `${2.8 + (i % 11) * 0.17}s`,
  color: ["#e7c879", "#f8f1d9", "#5cf58e", "#c8a4ff", "#ff9dba"][i % 5],
}));

const sectionMeta: Record<OwnerSection, SectionMeta> = {
  overview: {
    eyebrow: "COMMAND OVERVIEW",
    title: "Your command centre.",
    description: "A central view of BOOTROOM operations and owner controls.",
  },
  games: {
    eyebrow: "MATCH OPERATIONS",
    title: "Games",
    description: "Create sessions and manage existing games.",
  },
  players: {
    eyebrow: "COMMUNITY MANAGEMENT",
    title: "Players",
    description: "Review player profiles, ratings and community records.",
  },
  finance: {
    eyebrow: "FINANCIAL OPERATIONS",
    title: "Finance",
    description: "Review captured payment records and financial summaries.",
  },
  "turf-inbox": {
    eyebrow: "VENUE MANAGEMENT",
    title: "Turf inbox",
    description: "Review venue suggestions submitted to BOOTROOM.",
  },
  turfs: {
    eyebrow: "VENUE MANAGEMENT",
    title: "Turf directory",
    description: "Saved venues available for creating BOOTROOM games.",
  },
  marketplace: {
    eyebrow: "COMMERCE",
    title: "Marketplace",
    description: "Marketplace management will be connected here.",
  },
  administrators: {
    eyebrow: "ACCESS MANAGEMENT",
    title: "Administrators",
    description: "Manage registered accounts and administrator permissions.",
  },
  tournaments: {
    eyebrow: "COMPETITION",
    title: "Tournaments",
    description: "Tournament management will be connected here.",
  },
  reports: {
    eyebrow: "BUSINESS INTELLIGENCE",
    title: "Reports",
    description: "Operational reporting will be connected here.",
  },
  settings: {
    eyebrow: "SYSTEM CONFIGURATION",
    title: "Settings",
    description: "Owner console settings will be connected here.",
  },
};

/* =========================================================
   DATE AND URL VALIDATION
========================================================= */

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

function isGoogleMapsUrl(value: string): boolean {
  if (!value.trim()) return true;

  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      (
        host === "maps.app.goo.gl" ||
        host === "goo.gl" ||
        host === "google.com" ||
        host.endsWith(".google.com") ||
        host === "maps.google.com"
      )
    );
  } catch {
    return false;
  }
}

/* =========================================================
   OWNER CONSOLE
========================================================= */

export default function OwnerConsole({
  email,
}: {
  email: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  /* -------------------------
     NAVIGATION
  ------------------------- */

  const [activeSection, setActiveSection] =
    useState<OwnerSection>("overview");

  /* -------------------------
     TURF STATE
  ------------------------- */

  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [turfId, setTurfId] = useState("");
  const [turfName, setTurfName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [mapsUrl, setMapsUrl] = useState("");

  /* -------------------------
     GAME FORM STATE
  ------------------------- */

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [playerFee, setPlayerFee] = useState("");
  const [bookingAmount, setBookingAmount] = useState("");

  /* -------------------------
     UI STATE
  ------------------------- */

  const [loadingTurfs, setLoadingTurfs] = useState(true);
  const [loading, setLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [message, setMessage] = useState("");
  const [celebrate, setCelebrate] = useState(true);

  const meta = sectionMeta[activeSection];

  /* =========================================================
     LOAD SAVED TURFS
  ========================================================= */

  useEffect(() => {
    let alive = true;

    async function load() {
      const { data, error } = await supabase
        .from("turfs")
        .select("id, name, venues(name, locality, address, maps_url)")
        .order("name");

      if (!alive) return;

      if (error) {
        setMessage(
          "Could not load saved turfs. " + error.message
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

  /* =========================================================
     TURF SELECTION
  ========================================================= */

  function handleTurfNameChange(value: string) {
    setTurfName(value);

    const matchingTurf = turfs.find(
      (turf) =>
        turf.name.trim().toLowerCase() ===
        value.trim().toLowerCase()
    );

    setTurfId(matchingTurf?.id ?? "");

    const venue = matchingTurf?.venues?.[0];

    if (matchingTurf) {
      setVenueAddress(venue?.address ?? "");
      setMapsUrl(venue?.maps_url ?? "");
    }
  }

  /* =========================================================
     CREATE OR RESOLVE TURF
  ========================================================= */

  async function resolveTurfId(): Promise<string | null> {
    const cleanName = turfName.trim();

    if (!cleanName) {
      setMessage("Enter a turf name.");
      return null;
    }

    const existingTurf = turfs.find(
      (turf) =>
        turf.name.trim().toLowerCase() ===
        cleanName.toLowerCase()
    );

    if (existingTurf) {
      setTurfId(existingTurf.id);

      // Existing venue details are deliberately not overwritten.
      return existingTurf.id;
    }

    if (!venueAddress.trim() && !mapsUrl.trim()) {
      setMessage(
        "For a new turf, enter its venue address or paste its Google Maps link."
      );
      return null;
    }

    if (!isGoogleMapsUrl(mapsUrl)) {
      setMessage(
        "Enter a valid HTTPS Google Maps link, such as a maps.app.goo.gl link."
      );
      return null;
    }

    const response = await fetch(
      "/api/owner/access/operations",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          action: "create-turf",
          name: cleanName,
          address: venueAddress.trim(),
          maps_url: mapsUrl.trim(),
        }),
      }
    );

    const result = await response.json().catch(() => ({}));

    if (!response.ok || typeof result.id !== "string") {
      setMessage(
        result.error || "Could not save this turf."
      );
      return null;
    }

    const savedTurf: Turf = {
      id: result.id,
      name: result.name || cleanName,
      venues: [
        {
          name: result.name || cleanName,
          locality: result.locality || "Kolkata",
          address: result.address || venueAddress.trim(),
          maps_url: result.maps_url || mapsUrl.trim(),
        },
      ],
    };

    setTurfs((current) => {
      if (
        current.some(
          (turf) => turf.id === savedTurf.id
        )
      ) {
        return current;
      }

      return [...current, savedTurf].sort(
        (a, b) => a.name.localeCompare(b.name)
      );
    });

    setTurfName(savedTurf.name);
    setTurfId(savedTurf.id);

    return savedTurf.id;
  }

  /* =========================================================
     CREATE GAME
     Preserves the existing seven-argument RPC.
  ========================================================= */

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
      setMessage(
        "Complete every required field before creating the game."
      );
      return;
    }

    if (!startDate || !endDate) {
      setMessage(
        "Enter valid dates as YYYY-MM-DD HH:MM using Indian Standard Time."
      );
      return;
    }

    if (endDate <= startDate) {
      setMessage(
        "The end time must be later than the start time."
      );
      return;
    }

    if (startDate <= new Date()) {
      setMessage("The game must start in the future.");
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
      setMessage(
        "Amounts can have a maximum of two decimal places."
      );
      return;
    }

    if (!isGoogleMapsUrl(mapsUrl)) {
      setMessage(
        "Please enter a valid Google Maps link or leave it blank."
      );
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

      // IMPORTANT:
      // Existing RPC signature and payment/booking behaviour preserved.
      const { data, error } = await supabase.rpc(
        "create_game",
        {
          p_turf_id: resolvedTurfId,
          p_host_user_id: user.id,
          p_start: startDate.toISOString(),
          p_end: endDate.toISOString(),
          p_player_capacity: seats,
          p_player_fee: fee,
          p_booking_amount: bookingFee,
        }
      );

      if (error) {
        setMessage(
          "Could not create the game. " + error.message
        );
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

  /* =========================================================
     LOCK OWNER CONSOLE
  ========================================================= */

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

  /* =========================================================
     SHARED INPUT STYLE
  ========================================================= */

  const inputStyle: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <main className="royal-dashboard owner-shell">

      {/* CONFETTI INTRO */}

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

      {/* SIDEBAR */}

      <OwnerCommandSidebar
        activeSection={activeSection}
        onNavigate={setActiveSection}
      />

      {/* MAIN APPLICATION */}

      <div className="owner-command-main">

        {/* TOP BAR */}

        <header className="royal-topbar owner-topbar">
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
            type="button"
          >
            {locking ? "LOCKING…" : "LOCK CONSOLE"}
          </button>
        </header>

        <div className="royal-content owner-content">

          {/* PAGE HEADING */}

          <div className="owner-page-heading">
            <div>
              <div className="royal-eyebrow">
                {meta.eyebrow}
              </div>

              <h1 className="royal-title owner-section-title">
                {meta.title}
              </h1>

              <p className="royal-intro">
                {meta.description}
              </p>
            </div>

            <div className="owner-session-chip">
              <span />
              OWNER SESSION ACTIVE
            </div>
          </div>

          {/* =================================================
              OVERVIEW
          ================================================= */}

          {activeSection === "overview" && (
            <div className="owner-overview">

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

              <div className="owner-overview-grid">

                <button
                  type="button"
                  onClick={() => setActiveSection("games")}
                >
                  <span className="owner-overview-icon">
                    ⚽
                  </span>

                  <strong>Game operations</strong>

                  <span>
                    Create games, review sessions and manage cancellations.
                  </span>

                  <b>OPEN GAMES ↗</b>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection("players")}
                >
                  <span className="owner-overview-icon">
                    ♟
                  </span>

                  <strong>Player management</strong>

                  <span>
                    Review player profiles, ratings and community records.
                  </span>

                  <b>OPEN PLAYERS ↗</b>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection("finance")}
                >
                  <span className="owner-overview-icon">
                    ₹
                  </span>

                  <strong>Finance</strong>

                  <span>
                    Inspect recorded payment activity and captured totals.
                  </span>

                  <b>OPEN FINANCE ↗</b>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveSection("administrators")
                  }
                >
                  <span className="owner-overview-icon">
                    ♛
                  </span>

                  <strong>Administrators</strong>

                  <span>
                    Grant or revoke restricted administrator access.
                  </span>

                  <b>MANAGE ACCESS ↗</b>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveSection("turf-inbox")
                  }
                >
                  <span className="owner-overview-icon">
                    ⌑
                  </span>

                  <strong>Turf inbox</strong>

                  <span>
                    Review venue suggestions submitted by the community.
                  </span>

                  <b>REVIEW INBOX ↗</b>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSection("turfs")}
                >
                  <span className="owner-overview-icon">
                    ▦
                  </span>

                  <strong>Turf directory</strong>

                  <span>
                    View saved venues used by game creation.
                  </span>

                  <b>OPEN DIRECTORY ↗</b>
                </button>

              </div>

              <div className="owner-overview-note">
                <strong>Operational integrity</strong>

                <p>
                  Financial records and existing booking/payment
                  workflows are preserved. Navigation does not
                  grant additional server-side permissions.
                </p>
              </div>

            </div>
          )}

          {/* =================================================
              GAMES
          ================================================= */}

          {activeSection === "games" && (
            <>

              <section className="royal-section-heading">
                <div className="royal-kicker">
                  OPERATIONS
                </div>

                <h2>Create a game</h2>

                <p>
                  Set the full fee and a separate fixed booking
                  amount per player. Players see their individual
                  fee, not the venue rental total.
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
                  TURF NAME (TYPE OR SELECT SAVED TURF)
                </label>

                <input
                  id="royal-turf"
                  list="royal-turf-options"
                  value={turfName}
                  onChange={(event) =>
                    handleTurfNameChange(event.target.value)
                  }
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
                    <option
                      key={turf.id}
                      value={turf.name}
                    />
                  ))}
                </datalist>

                <p className="royal-form-note">
                  Select a saved turf to reuse it. For a new
                  turf, provide its address or Google Maps link
                  below. Game dates and times use IST.
                </p>

                <div style={{ marginTop: 14 }}>
                  <label htmlFor="royal-address">
                    VENUE ADDRESS
                  </label>

                  <input
                    id="royal-address"
                    type="text"
                    value={venueAddress}
                    onChange={(event) =>
                      setVenueAddress(event.target.value)
                    }
                    disabled={loading}
                    placeholder="Actual address, area, Kolkata"
                    autoComplete="street-address"
                    style={inputStyle}
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <label htmlFor="royal-maps">
                    GOOGLE MAPS LINK
                  </label>

                  <input
                    id="royal-maps"
                    type="url"
                    value={mapsUrl}
                    onChange={(event) =>
                      setMapsUrl(event.target.value)
                    }
                    disabled={loading}
                    placeholder="https://maps.app.goo.gl/..."
                    autoComplete="url"
                    style={inputStyle}
                  />

                  <p className="royal-form-note">
                    Paste the link using Google Maps → Share → Copy link.
                  </p>
                </div>

                <div className="royal-field-grid">

                  <div>
                    <label htmlFor="royal-start">
                      START DATE &amp; TIME (IST)
                    </label>

                    <input
                      id="royal-start"
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      placeholder="YYYY-MM-DD HH:MM"
                      value={start}
                      onChange={(event) =>
                        setStart(event.target.value)
                      }
                      disabled={loading}
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label htmlFor="royal-end">
                      END DATE &amp; TIME (IST)
                    </label>

                    <input
                      id="royal-end"
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      placeholder="YYYY-MM-DD HH:MM"
                      value={end}
                      onChange={(event) =>
                        setEnd(event.target.value)
                      }
                      disabled={loading}
                      style={inputStyle}
                    />
                  </div>

                </div>

                <p className="royal-form-note">
                  Example: 2026-11-08 18:30 means 6:30 PM in
                  India, regardless of your device timezone.
                </p>

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
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label htmlFor="royal-fee">
                      FULL FEE PER PLAYER (₹)
                    </label>

                    <input
                      id="royal-fee"
                      type="number"
                      min="1"
                      max="100000"
                      step="0.01"
                      value={playerFee}
                      onChange={(event) =>
                        setPlayerFee(event.target.value)
                      }
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
                    max={
                      playerFee
                        ? Math.max(
                            0,
                            Number(playerFee) - 0.01
                          )
                        : undefined
                    }
                    step="0.01"
                    value={bookingAmount}
                    onChange={(event) =>
                      setBookingAmount(event.target.value)
                    }
                    disabled={loading}
                    placeholder="e.g. 30"
                    style={inputStyle}
                  />

                  <p className="royal-form-note">
                    This is a fixed amount, not a percentage.
                    For example, if the full fee is ₹200 and the
                    booking amount is ₹30, the player pays ₹30
                    now and ₹170 remains outstanding.
                  </p>
                </div>

                {message && (
                  <div
                    className="royal-feedback"
                    role="status"
                    aria-live="polite"
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

              {/* Existing games management */}
              <OwnerOperations activeTab="games" />

            </>
          )}

          {/* =================================================
              PLAYERS
          ================================================= */}

          {activeSection === "players" && (
            <OwnerOperations activeTab="players" />
          )}

          {/* =================================================
              FINANCE
          ================================================= */}

          {activeSection === "finance" && (
            <OwnerOperations activeTab="finance" />
          )}

          {/* =================================================
              TURF INBOX
          ================================================= */}

          {activeSection === "turf-inbox" && (
            <OwnerOperations activeTab="turfs" />
          )}

          {/* =================================================
              ADMINISTRATORS
          ================================================= */}

          {activeSection === "administrators" && (
            <OwnerAdministrators />
          )}

          {/* =================================================
              TURF DIRECTORY
          ================================================= */}

          {activeSection === "turfs" && (
            <section className="owner-directory">

              <div className="owner-directory-heading">
                <div>
                  <div className="royal-kicker">
                    SAVED VENUES
                  </div>

                  <h2>Registered turf directory</h2>
                </div>

                <span>
                  {loadingTurfs
                    ? "LOADING…"
                    : `${turfs.length} TURFS`}
                </span>
              </div>

              {loadingTurfs ? (
                <div className="owner-directory-empty">
                  Loading saved venues…
                </div>
              ) : turfs.length === 0 ? (
                <div className="owner-directory-empty">
                  No saved turfs found. Create a game with a
                  new venue to add one.
                </div>
              ) : (
                <div className="owner-directory-grid">

                  {turfs.map((turf) => {
                    const venue = turf.venues?.[0];

                    return (
                      <article
                        className="owner-directory-card"
                        key={turf.id}
                      >
                        <div className="owner-directory-mark">
                          ⌖
                        </div>

                        <h3>{turf.name}</h3>

                        <p>
                          {venue?.locality ||
                            "Locality not recorded"}
                        </p>

                        {venue?.address && (
                          <small>{venue.address}</small>
                        )}

                        {venue?.maps_url && (
                          <a
                            href={venue.maps_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            OPEN MAP ↗
                          </a>
                        )}
                      </article>
                    );
                  })}

                </div>
              )}

            </section>
          )}

          {/* =================================================
              FUTURE MODULES
          ================================================= */}

          {activeSection === "marketplace" && (
            <OwnerShopManager />
          )}

          {(
            [
              "tournaments",
              "reports",
              "settings",
            ] as OwnerSection[]
          ).includes(activeSection) && (
            <section className="owner-coming-soon">

              <div className="owner-coming-soon-mark">
                ✦
              </div>

              <div className="royal-kicker">
                MODULE NOT CONNECTED
              </div>

              <h2>
                {meta.title} is not connected yet.
              </h2>

              <p>
                This section is reserved in the command
                navigation. No placeholder controls will
                change your database until its real workflow
                is integrated.
              </p>

            </section>
          )}

          {/* FOOTER */}

          <footer className="royal-footer">
            BOOTROOM · OWNER CONSOLE · ACCESS CHECKS ENFORCED SERVER-SIDE
          </footer>

        </div>
      </div>

      {/* =====================================================
          OWNER CONSOLE STYLES
      ===================================================== */}

      <style jsx global>{`

        .owner-shell {
          min-height: 100vh;
        }

        .owner-command-main {
          min-height: 100vh;
          margin-left: 258px;
          min-width: 0;
        }

        .owner-content {
          width: min(1180px, 100%);
          margin: 0 auto;
          padding-top: 34px;
        }

        .owner-topbar {
          padding-left: 34px;
        }

        .owner-page-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin: 4px 0 28px;
        }

        .owner-section-title {
          margin-top: 9px;
          font-size: clamp(34px, 5vw, 54px);
        }

        .owner-session-chip {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          flex: 0 0 auto;
          padding: 10px 13px;
          color: #b8c8bb;
          border: 1px solid rgba(120, 230, 160, 0.2);
          border-radius: 999px;
          background: rgba(22, 55, 35, 0.35);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        .owner-session-chip span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #78e6a0;
          box-shadow: 0 0 9px rgba(120, 230, 160, 0.55);
        }

        .owner-overview {
          display: grid;
          gap: 18px;
        }

        .owner-overview-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }

        .owner-overview-grid button {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          min-height: 190px;
          padding: 20px;
          color: #edf3ed;
          border: 1px solid rgba(139, 177, 146, 0.17);
          border-radius: 15px;
          background: linear-gradient(145deg, #101d15, #090f0c);
          text-align: left;
          cursor: pointer;
          transition:
            transform 160ms ease,
            border-color 160ms ease;
        }

        .owner-overview-grid button:hover {
          transform: translateY(-2px);
          border-color: rgba(139, 234, 171, 0.5);
        }

        .owner-overview-icon {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          margin-bottom: 17px;
          color: #d7bd7e;
          border: 1px solid rgba(215, 189, 126, 0.25);
          border-radius: 10px;
          background: rgba(215, 189, 126, 0.06);
          font-size: 18px;
        }

        .owner-overview-grid strong {
          font-size: 15px;
        }

        .owner-overview-grid button > span:not(.owner-overview-icon) {
          margin-top: 8px;
          color: #91a397;
          font-size: 12px;
          line-height: 1.6;
        }

        .owner-overview-grid b {
          margin-top: auto;
          padding-top: 18px;
          color: #91e5a8;
          font-size: 9px;
          letter-spacing: 0.12em;
        }

        .owner-overview-note,
        .owner-coming-soon,
        .owner-directory {
          padding: 22px;
          border: 1px solid rgba(139, 177, 146, 0.17);
          border-radius: 15px;
          background: linear-gradient(145deg, #101a14, #090f0c);
        }

        .owner-overview-note strong {
          color: #e7d5a5;
          font-size: 13px;
        }

        .owner-overview-note p,
        .owner-coming-soon p {
          margin: 8px 0 0;
          color: #93a398;
          font-size: 12px;
          line-height: 1.7;
        }

        .owner-directory-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 15px;
          margin-bottom: 18px;
        }

        .owner-directory-heading h2,
        .owner-coming-soon h2 {
          margin: 7px 0 0;
          color: #f0f3ed;
          font-size: 22px;
        }

        .owner-directory-heading > span {
          color: #d4bd82;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .owner-directory-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .owner-directory-card {
          min-width: 0;
          padding: 17px;
          border: 1px solid #263b30;
          border-radius: 12px;
          background: #0a120d;
        }

        .owner-directory-mark {
          color: #d6bd7d;
          font-size: 20px;
        }

        .owner-directory-card h3 {
          margin: 11px 0 5px;
          color: #eff3ed;
          font-size: 15px;
        }

        .owner-directory-card p,
        .owner-directory-card small {
          display: block;
          margin: 0 0 7px;
          color: #92a397;
          font-size: 12px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .owner-directory-card a {
          display: inline-block;
          margin-top: 9px;
          color: #91e5a8;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-decoration: none;
        }

        .owner-directory-empty {
          padding: 24px;
          color: #9aab9f;
          border: 1px dashed #344a3b;
          border-radius: 11px;
          font-size: 13px;
        }

        .owner-coming-soon {
          max-width: 680px;
          margin: 8px 0;
          padding: 35px;
        }

        .owner-coming-soon-mark {
          margin-bottom: 15px;
          color: #d7bd7e;
          font-size: 27px;
        }

        @media (max-width: 1100px) {
          .owner-overview-grid,
          .owner-directory-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .owner-command-main {
            margin-left: 0;
          }

          .owner-topbar {
            padding-left: 68px;
          }

          .owner-content {
            padding-top: 22px;
          }

          .owner-page-heading {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 600px) {
          .owner-overview-grid,
          .owner-directory-grid {
            grid-template-columns: 1fr;
          }

          .owner-overview-grid button {
            min-height: 160px;
          }

          .owner-coming-soon {
            padding: 24px;
          }
        }

      `}</style>

    </main>
  );
}