
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import "./player.css";

type Profile = {
  id: string;
  full_name: string | null;
  position: string | null;
  preferred_foot: string | null;
  locality: string | null;
  skill: string | null;
};

type PlayerCard = {
  profile_id: string;
  full_name: string | null;
  position: string | null;
  preferred_foot: string | null;
  locality: string | null;
  overall_rating: number;
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
  attack: number;
  composure: number;
  appearances: number;
  goals: number;
  assists: number;
  average_rating: number | null;
  is_verified: boolean;
};

const ATTRIBUTE_FIELDS = [
  { label: "Pace", key: "pace" },
  { label: "Shooting", key: "shooting" },
  { label: "Passing", key: "passing" },
  { label: "Dribbling", key: "dribbling" },
  { label: "Defending", key: "defending" },
  { label: "Physical", key: "physical" },
] as const;

const CARD_FIELDS = [
  { label: "Overall", key: "overall_rating" },
  { label: "Pace", key: "pace" },
  { label: "Shooting", key: "shooting" },
  { label: "Passing", key: "passing" },
  { label: "Dribbling", key: "dribbling" },
  { label: "Defending", key: "defending" },
  { label: "Physical", key: "physical" },
  { label: "Attack", key: "attack" },
  { label: "Composure", key: "composure" },
  { label: "Appearances", key: "appearances" },
  { label: "Goals", key: "goals" },
  { label: "Assists", key: "assists" },
] as const;

type CardNumberField = (typeof CARD_FIELDS)[number]["key"];

const supabase = createClient();

function emptyProfile(): Profile {
  return {
    id: "",
    full_name: "",
    position: "",
    preferred_foot: "",
    locality: "",
    skill: "",
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export default function PlayerPage() {
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [card, setCard] = useState<PlayerCard | null>(null);
  const [directory, setDirectory] = useState<PlayerCard[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingCard, setEditingCard] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    full_name: "",
    position: "",
    preferred_foot: "",
    locality: "",
    skill: "",
  });
  const [cardDraft, setCardDraft] = useState<Record<CardNumberField, number>>({
    overall_rating: 50,
    pace: 50,
    shooting: 50,
    passing: 50,
    dribbling: 50,
    defending: 50,
    physical: 50,
    attack: 50,
    composure: 50,
    appearances: 0,
    goals: 0,
    assists: 0,
  });
  const [verifiedDraft, setVerifiedDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [period, setPeriod] = useState("ALL TIME");

  const loadPage = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;

      if (!user) {
        setUserId("");
        setProfile(emptyProfile());
        setCard(null);
        setDirectory([]);
        setIsManager(false);
        return;
      }

      setUserId(user.id);

      const [profileResult, cardResult, managerResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select(
              "id,full_name,position,preferred_foot,locality,skill"
            )
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("player_cards")
            .select("*")
            .eq("profile_id", user.id)
            .maybeSingle(),
          supabase.rpc("can_manage_player_cards"),
        ]);

      if (profileResult.error) throw profileResult.error;
      if (cardResult.error) throw cardResult.error;

      const currentProfile = profileResult.data ?? {
        ...emptyProfile(),
        id: user.id,
      };

      setProfile(currentProfile);
      setProfileDraft({
        full_name: currentProfile.full_name ?? "",
        position: currentProfile.position ?? "",
        preferred_foot: currentProfile.preferred_foot ?? "",
        locality: currentProfile.locality ?? "",
        skill: currentProfile.skill ?? "",
      });

      const manager = !managerResult.error && managerResult.data === true;
      setIsManager(manager);

      let currentCard = cardResult.data as PlayerCard | null;

      if (manager) {
        const { data, error: directoryError } = await supabase.rpc(
          "admin_list_player_cards"
        );

        if (directoryError) throw directoryError;

        const players = (data ?? []) as PlayerCard[];
        setDirectory(players);

        currentCard =
          players.find((player) => player.profile_id === user.id) ??
          currentCard;

        setSelectedId((previous) =>
          previous && players.some((p) => p.profile_id === previous)
            ? previous
            : user.id
        );
      } else {
        setDirectory([]);
        setSelectedId(user.id);
      }

      setCard(currentCard);

      if (currentCard) {
        setCardDraft({
          overall_rating: currentCard.overall_rating,
          pace: currentCard.pace,
          shooting: currentCard.shooting,
          passing: currentCard.passing,
          dribbling: currentCard.dribbling,
          defending: currentCard.defending,
          physical: currentCard.physical,
          attack: currentCard.attack,
          composure: currentCard.composure,
          appearances: currentCard.appearances,
          goals: currentCard.goals,
          assists: currentCard.assists,
        });
        setVerifiedDraft(currentCard.is_verified);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  const selectedPlayer = useMemo(
    () =>
      directory.find((player) => player.profile_id === selectedId) ??
      (selectedId === userId && card ? card : null),
    [directory, selectedId, userId, card]
  );

  const displayedCard =
    isManager && selectedId !== userId ? selectedPlayer : card;

  const displayedName =
    (isManager && selectedId !== userId
      ? selectedPlayer?.full_name
      : profile.full_name) || "YOUR NAME";

  const displayedPosition =
    (isManager && selectedId !== userId
      ? selectedPlayer?.position
      : profile.position) || "";

  const displayedAttributes = ATTRIBUTE_FIELDS.map((attribute) => ({
    label: attribute.label,
    value: displayedCard
      ? displayedCard[attribute.key]
      : 50,
  }));

  function choosePlayer(id: string) {
    setSelectedId(id);
    setEditingCard(false);
    setNotice("");
    const next = directory.find((player) => player.profile_id === id);

    if (next) {
      setCardDraft({
        overall_rating: next.overall_rating,
        pace: next.pace,
        shooting: next.shooting,
        passing: next.passing,
        dribbling: next.dribbling,
        defending: next.defending,
        physical: next.physical,
        attack: next.attack,
        composure: next.composure,
        appearances: next.appearances,
        goals: next.goals,
        assists: next.assists,
      });
      setVerifiedDraft(next.is_verified);
    }
  }

  async function saveProfile() {
    if (!userId) return;

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const { data, error: saveError } = await supabase
        .from("profiles")
        .update({
          full_name: profileDraft.full_name.trim() || null,
          position: profileDraft.position.trim() || null,
          preferred_foot: profileDraft.preferred_foot || null,
          locality: profileDraft.locality.trim() || null,
          skill: profileDraft.skill.trim() || null,
        })
        .eq("id", userId)
        .select(
          "id,full_name,position,preferred_foot,locality,skill"
        )
        .single();

      if (saveError) throw saveError;

      setProfile(data);
      setEditingProfile(false);
      setNotice("Your profile has been saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveCard() {
    if (!isManager || !selectedId) {
      setError("Only an authorized manager can edit official player cards.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        ...cardDraft,
        is_verified: verifiedDraft,
      };

      const { data, error: saveError } = await supabase
        .from("player_cards")
        .update(payload)
        .eq("profile_id", selectedId)
        .select("*")
        .single();

      if (saveError) throw saveError;

      const updatedCard = data as PlayerCard;
      setCard(updatedCard);
      setDirectory((players) =>
        players.map((player) =>
          player.profile_id === selectedId
            ? {
                ...player,
                ...updatedCard,
                full_name: player.full_name,
                position: player.position,
                preferred_foot: player.preferred_foot,
                locality: player.locality,
              }
            : player
        )
      );
      setEditingCard(false);
      setNotice("Official player card saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function updateCardNumber(key: CardNumberField, rawValue: string) {
    const value = rawValue === "" ? 0 : Number(rawValue);
    const max = key === "appearances" || key === "goals" || key === "assists"
      ? 1000000
      : 99;

    setCardDraft((current) => ({
      ...current,
      [key]: Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0)),
    }));
  }

  if (loading) {
    return (
      <main className="tz-player">
        <div className="tz-player-shell">
          <p className="tz-data-note">Loading your Turfzy player profile…</p>
        </div>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="tz-player">
        <div className="tz-player-shell">
          <header className="tz-player-header">
            <Link href="/" className="tz-player-wordmark">
              TURFZY<span>®</span>
            </Link>
          </header>
          <h1>Sign in to access your player profile.</h1>
          <p className="tz-data-note">
            Sign in to your Turfzy account, then return to this page.
          </p>
          <Link href="/login" className="tz-outline-button">
            SIGN IN
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="tz-player">
      <div className="tz-stadium-lights" aria-hidden="true" />

      <div className="tz-player-shell">
        <header className="tz-player-header">
          <Link href="/" className="tz-player-wordmark">
            TURFZY<span>®</span>
          </Link>
          <div className="tz-player-header-right">
            <i /> THE PLAYER CLUB
          </div>
        </header>

        {error && (
          <p className="tz-edit-note" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="tz-data-note" role="status">
            {notice}
          </p>
        )}

        <div className="tz-player-toolbar">
          <Link href="/" className="tz-back-link">
            ‹ <span>PLAYERS</span>
          </Link>
          <button
            className="tz-outline-button"
            onClick={() => {
              setEditingProfile((value) => !value);
              setNotice("");
            }}
          >
            {editingProfile ? "CANCEL" : "✎ EDIT PROFILE"}
          </button>
        </div>

        {isManager && (
          <section className="tz-about-panel">
            <div className="tz-section-head">
              <div>
                <p className="tz-eyebrow"><i /> MANAGER ACCESS</p>
                <h2>PLAYER DIRECTORY.</h2>
              </div>
            </div>
            <p className="tz-data-note">
              Official ratings can be changed only by authorized managers.
            </p>
            <div className="tz-profile-row">
              <label htmlFor="tz-player-select">Select player</label>
              <select
                id="tz-player-select"
                value={selectedId}
                onChange={(event) => choosePlayer(event.target.value)}
              >
                {directory.map((player) => (
                  <option
                    key={player.profile_id}
                    value={player.profile_id}
                  >
                    {player.full_name || "Unnamed player"} —{" "}
                    {player.position || "Position not set"}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="tz-outline-button"
              onClick={() => setEditingCard((value) => !value)}
              disabled={!selectedPlayer}
            >
              {editingCard ? "CANCEL RATINGS" : "✎ EDIT OFFICIAL CARD"}
            </button>
          </section>
        )}

        <section className="tz-legend-stage">
          <div className="tz-stage-kicker">
            TURFZY ICON SERIES <span>01 / 99</span>
          </div>

          <div className="tz-legend-card">
            <div className="tz-card-topline">
              <span>TZ</span><span>ICON EDITION</span>
            </div>

            <div className="tz-card-rating">
              <strong>
                {displayedCard
                  ? String(displayedCard.overall_rating).padStart(2, "0")
                  : "—"}
              </strong>
              <span>{displayedPosition ? displayedPosition.slice(0, 3).toUpperCase() : "POS"}</span>
              <b>♛</b>
            </div>

            <div className="tz-card-portrait" aria-label="Faceless player silhouette">
              <div className="tz-portrait-halo" />
              <div className="tz-portrait-head" />
              <div className="tz-portrait-neck" />
              <div className="tz-portrait-body" />
              <div className="tz-portrait-light" />
            </div>

            <div className="tz-card-identity">
              <p className="tz-card-series">THE PLAYER BEHIND THE LEGEND</p>
              <h1>{displayedName}</h1>
              <div className="tz-card-crest-row"><span>✦</span><i /><span>⬟</span></div>
            </div>

            <div className="tz-card-attributes">
              {displayedAttributes.map((item) => (
                <div key={item.label}>
                  <strong>{item.value}</strong>
                  <span>{item.label.slice(0, 3).toUpperCase()}</span>
                </div>
              ))}
            </div>

            <div className="tz-card-footer">
              <span>BUILT FOR THE GAME</span>
              <strong>LEGENDS ARE MADE.</strong>
            </div>
          </div>

          <div className="tz-stage-caption">
            <span>◆</span> YOUR STORY. YOUR STATS. YOUR LEGACY.
          </div>
          <p className="tz-data-note">
            {displayedCard?.is_verified
              ? "VERIFIED PLAYER CARD"
              : "UNVERIFIED — OFFICIAL RATINGS AWAIT REVIEW"}
          </p>
        </section>

        <section className="tz-performance-strip">
          <div><span>GAMES</span><strong>{displayedCard?.appearances ?? "—"}</strong><small>APPEARANCES</small></div>
          <div><span>GOALS</span><strong>{displayedCard?.goals ?? "—"}</strong><small>FINISHING</small></div>
          <div><span>ASSISTS</span><strong>{displayedCard?.assists ?? "—"}</strong><small>CREATIVITY</small></div>
          <div>
            <span>RATING</span>
            <strong>
              {displayedCard?.average_rating == null
                ? "—"
                : Number(displayedCard.average_rating).toFixed(1)}
            </strong>
            <small>AVERAGE</small>
          </div>
        </section>

        {isManager && editingCard && (
          <section className="tz-about-panel">
            <div className="tz-section-head">
              <div>
                <p className="tz-eyebrow"><i /> MANAGER CONTROL</p>
                <h2>EDIT OFFICIAL RATINGS.</h2>
              </div>
            </div>

            <div className="tz-profile-fields">
              {CARD_FIELDS.map((field) => (
                <div className="tz-profile-row" key={field.key}>
                  <label htmlFor={`tz-card-${field.key}`}>
                    {field.label}
                  </label>
                  <input
                    id={`tz-card-${field.key}`}
                    type="number"
                    min={0}
                    max={
                      field.key === "appearances" ||
                      field.key === "goals" ||
                      field.key === "assists"
                        ? 1000000
                        : 99
                    }
                    step={1}
                    value={cardDraft[field.key]}
                    onChange={(event) =>
                      updateCardNumber(field.key, event.target.value)
                    }
                  />
                </div>
              ))}
              <div className="tz-profile-row">
                <label htmlFor="tz-card-average">Average match rating (0–10)</label>
                <input
                  id="tz-card-average"
                  type="number"
                  min="0"
                  max="10"
                  step="0.01"
                  value={displayedCard?.average_rating ?? ""}
                  placeholder="Leave unchanged if unavailable"
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "") {
                      setCard((current) =>
                        current ? { ...current, average_rating: null } : current
                      );
                    } else {
                      const value = Math.min(10, Math.max(0, Number(raw)));
                      setCard((current) =>
                        current ? { ...current, average_rating: value } : current
                      );
                    }
                  }}
                />
              </div>
              <div className="tz-profile-row">
                <label htmlFor="tz-verified">Mark card as verified</label>
                <input
                  id="tz-verified"
                  type="checkbox"
                  checked={verifiedDraft}
                  onChange={(event) => setVerifiedDraft(event.target.checked)}
                />
              </div>
            </div>

            <button
              className="tz-outline-button"
              disabled={saving}
              onClick={() => void saveCard()}
            >
              {saving ? "SAVING…" : "SAVE OFFICIAL CARD"}
            </button>
          </section>
        )}

        <section className="tz-attributes-panel">
          <div className="tz-section-head">
            <div>
              <p className="tz-eyebrow"><i /> PLAYER DNA</p>
              <h2>THE NUMBERS BEHIND YOUR GAME.</h2>
            </div>
            <span className="tz-section-code">ANALYSIS / 001</span>
          </div>

          <div className="tz-analysis-grid">
            <div className="tz-radar-card">
              <div className="tz-panel-top">
                <span>PERFORMANCE PROFILE</span><span>0–100</span>
              </div>
              <svg className="tz-radar" viewBox="0 0 360 330" role="img" aria-label="Player performance radar">
                <defs>
                  <linearGradient id="tzRadarFill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#55ff9a" stopOpacity=".36" />
                    <stop offset="100%" stopColor="#12a965" stopOpacity=".06" />
                  </linearGradient>
                  <filter id="tzRadarGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                <g className="tz-radar-grid">
                  <polygon points="180,35 315,165 180,295 45,165" />
                  <polygon points="180,67 282,165 180,263 78,165" />
                  <polygon points="180,99 249,165 180,231 111,165" />
                  <polygon points="180,131 216,165 180,199 144,165" />
                  <path d="M180 35V295M45 165H315" />
                </g>
                <g className="tz-radar-labels">
                  <text x="180" y="19" textAnchor="middle">ATTACK</text>
                  <text x="326" y="169">DEFENCE</text>
                  <text x="180" y="320" textAnchor="middle">COMPOSURE</text>
                  <text x="34" y="169" textAnchor="end">OVERALL</text>
                </g>
                <polygon
                  className="tz-radar-area"
                  points={
                    displayedCard
                      ? `180,${165 - displayedCard.attack * 1.3} ${180 + displayedCard.defending * 1.35},165 180,${165 + displayedCard.composure * 1.3} ${180 - displayedCard.overall_rating * 1.35},165`
                      : "180,165 180,165 180,165 180,165"
                  }
                />
                <polygon
                  className="tz-radar-line"
                  points={
                    displayedCard
                      ? `180,${165 - displayedCard.attack * 1.3} ${180 + displayedCard.defending * 1.35},165 180,${165 + displayedCard.composure * 1.3} ${180 - displayedCard.overall_rating * 1.35},165`
                      : "180,165 180,165 180,165 180,165"
                  }
                  filter="url(#tzRadarGlow)"
                />
              </svg>
              <div className="tz-radar-legend">
                <span><i /> PLAYER DATA</span>
                <span>{displayedCard?.is_verified ? "VERIFIED" : "UNVERIFIED"}</span>
              </div>
            </div>

            <div className="tz-attribute-list">
              <div className="tz-panel-top"><span>CORE ATTRIBUTES</span><span>RATING</span></div>
              {displayedAttributes.map((item) => (
                <div className="tz-attribute-row" key={item.label}>
                  <div><span>{item.label}</span><strong>{item.value}</strong></div>
                  <div className="tz-meter"><i style={{ width: item.value + "%" }} /></div>
                </div>
              ))}
              {!displayedCard && (
                <p className="tz-data-note">No player card is available yet.</p>
              )}
            </div>
          </div>
        </section>

        <section className="tz-about-panel">
          <div className="tz-section-head">
            <div>
              <p className="tz-eyebrow"><i /> PLAYER IDENTITY</p>
              <h2>ABOUT YOU.</h2>
            </div>
            <button
              className="tz-outline-button tz-small-button"
              onClick={() => {
                if (editingProfile) {
                  setProfileDraft({
                    full_name: profile.full_name ?? "",
                    position: profile.position ?? "",
                    preferred_foot: profile.preferred_foot ?? "",
                    locality: profile.locality ?? "",
                    skill: profile.skill ?? "",
                  });
                }
                setEditingProfile((value) => !value);
              }}
            >
              {editingProfile ? "CANCEL" : "✎ EDIT"}
            </button>
          </div>

          {editingProfile && (
            <p className="tz-edit-note">
              Update your own profile. Official player ratings are managed separately.
            </p>
          )}

          <div className="tz-profile-fields">
            {([
              ["full_name", "Name", "Add your name"],
              ["position", "Preferred Position", "e.g. Striker, Midfielder"],
              ["preferred_foot", "Preferred Foot", "Right / Left / Both"],
              ["locality", "Locality", "Your city or area"],
              ["skill", "Playing Style", "Pace, passing, dribbling"],
            ] as const).map(([key, label, placeholder], index) => (
              <div className="tz-profile-row" key={key}>
                <span className="tz-field-icon">
                  {["♙", "⚑", "⌁", "⌖", "♧"][index]}
                </span>
                <label htmlFor={"tz-" + key}>{label}</label>
                {editingProfile ? (
                  key === "preferred_foot" ? (
                    <select
                      id={"tz-" + key}
                      value={profileDraft[key]}
                      onChange={(event) =>
                        setProfileDraft((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select foot</option>
                      <option value="Right">Right</option>
                      <option value="Left">Left</option>
                      <option value="Both">Both</option>
                    </select>
                  ) : (
                    <input
                      id={"tz-" + key}
                      value={profileDraft[key]}
                      placeholder={placeholder}
                      onChange={(event) =>
                        setProfileDraft((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                    />
                  )
                ) : (
                  <span className="tz-profile-value">
                    {profile[key] || placeholder}
                  </span>
                )}
                <span className="tz-field-chevron">›</span>
              </div>
            ))}
          </div>

          {editingProfile && (
            <button
              className="tz-outline-button"
              disabled={saving}
              onClick={() => void saveProfile()}
            >
              {saving ? "SAVING…" : "SAVE PROFILE"}
            </button>
          )}
        </section>

        <section className="tz-stats-footer">
          <div>
            <div>
              <p className="tz-eyebrow"><i /> YOUR STATS</p>
              <h2>PROGRESS, NOT PROMISES.</h2>
            </div>
            <label className="tz-period-select">
              <select
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                <option>ALL TIME</option>
                <option>THIS SEASON</option>
                <option>LAST 30 DAYS</option>
              </select>
              <span>⌄</span>
            </label>
          </div>
          <p className="tz-stats-empty">
            {period === "ALL TIME"
              ? "Showing recorded all-time totals."
              : "Season and date-filtered match history is not connected yet."}
          </p>
        </section>

        <footer className="tz-player-footer">
          <span>TURFZY® / PLAYER CLUB</span>
          <span>PLAY WITH PURPOSE.</span>
        </footer>
      </div>
    </main>
  );
}
