
"use client";

import PlayerPhotoUpload from "./PlayerPhotoUpload";
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
  avatar_url: string | null;
};

type PlayerCard = {
  profile_id: string;
  full_name: string | null;
  position: string | null;
  preferred_foot: string | null;
  locality: string | null;
  overall_rating: number | null;
  pace: number | null;
  shooting: number | null;
  passing: number | null;
  dribbling: number | null;
  defending: number | null;
  physical: number | null;
  attack: number | null;
  composure: number | null;
  appearances: number | null;
  goals: number | null;
  assists: number | null;
  average_rating: number | null;
  is_verified: boolean;
};

const supabase = createClient();

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

const ATTRIBUTES = [
  { label: "Pace", key: "pace" },
  { label: "Shooting", key: "shooting" },
  { label: "Passing", key: "passing" },
  { label: "Dribbling", key: "dribbling" },
  { label: "Defending", key: "defending" },
  { label: "Physical", key: "physical" },
] as const;

const PLAYER_PHOTO_PATH =
  "/storage/v1/object/public/player-photos/";

function emptyProfile(): Profile {
  return {
    id: "",
    full_name: "",
    position: "",
    preferred_foot: "",
    locality: "",
    skill: "",
    avatar_url: null,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

function numberOrZero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function ratingText(value: number | null | undefined) {
  return String(numberOrZero(value)).padStart(2, "0");
}

/**
 * Google OAuth avatar URLs are not player-card photos.
 * Only show images stored in Turfzy's player-photos bucket.
 */
function approvedPlayerPhoto(url: string | null | undefined) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" &&
      parsed.protocol !== "http:"
    ) {
      return null;
    }

    return parsed.pathname.includes(PLAYER_PHOTO_PATH) ? url : null;
  } catch {
    return null;
  }
}

export default function PlayerPage() {
  const [userId, setUserId] = useState("");
  const [profile, setProfile] = useState<Profile>(emptyProfile());
  const [card, setCard] = useState<PlayerCard | null>(null);
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
    overall_rating: 0,
    pace: 0,
    shooting: 0,
    passing: 0,
    dribbling: 0,
    defending: 0,
    physical: 0,
    attack: 0,
    composure: 0,
    appearances: 0,
    goals: 0,
    assists: 0,
  });

  const [averageRatingDraft, setAverageRatingDraft] = useState("");
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
        setIsManager(false);
        return;
      }

      setUserId(user.id);

      const [profileResult, cardResult, managerResult] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id,full_name,position,preferred_foot,locality,skill,avatar_url"
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

      const currentProfile: Profile = profileResult.data ?? {
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

      const currentCard = (cardResult.data ?? null) as PlayerCard | null;
      setCard(currentCard);

      const manager =
        !managerResult.error && managerResult.data === true;

      setIsManager(manager);

      if (currentCard) {
        setCardDraft({
          overall_rating: numberOrZero(currentCard.overall_rating),
          pace: numberOrZero(currentCard.pace),
          shooting: numberOrZero(currentCard.shooting),
          passing: numberOrZero(currentCard.passing),
          dribbling: numberOrZero(currentCard.dribbling),
          defending: numberOrZero(currentCard.defending),
          physical: numberOrZero(currentCard.physical),
          attack: numberOrZero(currentCard.attack),
          composure: numberOrZero(currentCard.composure),
          appearances: numberOrZero(currentCard.appearances),
          goals: numberOrZero(currentCard.goals),
          assists: numberOrZero(currentCard.assists),
        });

        setAverageRatingDraft(
          currentCard.average_rating == null
            ? ""
            : String(currentCard.average_rating)
        );

        setVerifiedDraft(Boolean(currentCard.is_verified));
      } else {
        setCardDraft({
          overall_rating: 0,
          pace: 0,
          shooting: 0,
          passing: 0,
          dribbling: 0,
          defending: 0,
          physical: 0,
          attack: 0,
          composure: 0,
          appearances: 0,
          goals: 0,
          assists: 0,
        });

        setAverageRatingDraft("");
        setVerifiedDraft(false);
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

  const displayedPhoto = useMemo(
    () => approvedPlayerPhoto(profile.avatar_url),
    [profile.avatar_url]
  );

  const displayedAttributes = ATTRIBUTES.map((attribute) => ({
    label: attribute.label,
    key: attribute.key,
    value: numberOrZero(card?.[attribute.key]),
  }));

  function updateCardNumber(key: CardNumberField, rawValue: string) {
    const value = rawValue === "" ? 0 : Number(rawValue);

    const isCount =
      key === "appearances" ||
      key === "goals" ||
      key === "assists";

    const max = isCount ? 1000000 : 99;

    setCardDraft((current) => ({
      ...current,
      [key]: Math.min(
        max,
        Math.max(0, Number.isFinite(value) ? value : 0)
      ),
    }));
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
          "id,full_name,position,preferred_foot,locality,skill,avatar_url"
        )
        .single();

      if (saveError) throw saveError;

      setProfile(data as Profile);
      setEditingProfile(false);
      setNotice("Your profile has been saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveCard() {
    if (!isManager) {
      setError("Only an authorized manager can edit official player ratings.");
      return;
    }

    if (!card) {
      setError(
        "An official player-card record does not exist for this account yet. Create it through your authorized manager workflow first."
      );
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      let average: number | null = null;

      if (averageRatingDraft.trim() !== "") {
        average = Number(averageRatingDraft);

        if (!Number.isFinite(average)) {
          throw new Error("Enter a valid average rating from 0 to 10.");
        }

        average = Math.min(10, Math.max(0, average));
      }

      const { data, error: saveError } = await supabase
        .from("player_cards")
        .update({
          ...cardDraft,
          average_rating: average,
          is_verified: verifiedDraft,
        })
        .eq("profile_id", userId)
        .select("*")
        .single();

      if (saveError) throw saveError;

      setCard(data as PlayerCard);
      setEditingCard(false);
      setNotice("Official player card saved.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
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

  const statRows = [
    [
      { label: "PAC", value: card?.pace },
      { label: "DRI", value: card?.dribbling },
    ],
    [
      { label: "SHO", value: card?.shooting },
      { label: "DEF", value: card?.defending },
    ],
    [
      { label: "PAS", value: card?.passing },
      { label: "PHY", value: card?.physical },
    ],
  ];

  return (
    <main
      className="tz-player"
      style={{
        position: "relative",
        isolation: "isolate",
        paddingBottom: "180px",
      }}
    >
      <div className="tz-stadium-lights" aria-hidden="true" />

      <div
        className="tz-player-shell"
        style={{
          position: "relative",
          zIndex: 1,
          paddingBottom: "120px",
        }}
      >
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
            type="button"
            className="tz-outline-button"
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
              setNotice("");
            }}
          >
            {editingProfile ? "CANCEL" : "✎ EDIT PROFILE"}
          </button>
        </div>

        <section className="tz-legend-stage">
          <div className="tz-stage-kicker">
            TURFZY ICON SERIES <span>01 / 99</span>
          </div>

          <div
            className="tz-legend-card tz-png-player-card"
            style={{
              position: "relative",
              zIndex: 2,
              width: "100%",
              maxWidth: "420px",
              aspectRatio: "2 / 3",
              marginInline: "auto",
              overflow: "hidden",
              isolation: "isolate",
              backgroundColor: "#10100d",
              backgroundImage:
                "url('/brand/images/player-card/card-template.png')",
              backgroundPosition: "center",
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
            }}
          >
            {/* High-contrast rating badge, layered above the PNG. */}
            <div
              style={{
                position: "absolute",
                zIndex: 5,
                top: "5%",
                left: "6%",
                minWidth: "22%",
                padding: "5px 8px",
                border: "1px solid #d9bd79",
                borderRadius: "8px",
                background: "rgba(7, 8, 6, .94)",
                color: "#fff5d9",
                textAlign: "center",
                boxShadow: "0 3px 12px rgba(0,0,0,.6)",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "clamp(28px, 8vw, 42px)",
                  fontWeight: 900,
                  lineHeight: 1,
                  color: "#fff5d9",
                }}
              >
                {ratingText(card?.overall_rating)}
              </strong>

              <span
                style={{
                  display: "block",
                  marginTop: "4px",
                  fontSize: "clamp(10px, 2.8vw, 14px)",
                  fontWeight: 800,
                  letterSpacing: ".1em",
                }}
              >
                {profile.position
                  ? profile.position.slice(0, 3).toUpperCase()
                  : "POS"}
              </span>
            </div>

            {displayedPhoto && (
              <img
                src={displayedPhoto}
                alt="Your Turfzy player portrait"
                className="tz-player-photo"
                style={{
                  position: "absolute",
                  zIndex: 2,
                  top: "17%",
                  left: "22%",
                  width: "56%",
                  height: "37%",
                  objectFit: "contain",
                  objectPosition: "center bottom",
                  filter: "grayscale(1) sepia(.12) contrast(1.04)",
                  mixBlendMode: "screen",
                }}
              />
            )}

            <div
              style={{
                position: "absolute",
                zIndex: 4,
                top: "56%",
                left: "7%",
                right: "7%",
                textAlign: "center",
                color: "#fff8e9",
                textShadow: "0 2px 8px #000, 0 0 4px #000",
                overflowWrap: "anywhere",
              }}
            >
              <div
                style={{
                  fontSize: "clamp(8px, 2vw, 11px)",
                  letterSpacing: ".18em",
                }}
              >
                THE PLAYER BEHIND THE LEGEND
              </div>

              <h1
                style={{
                  margin: "5px 0 0",
                  fontSize: "clamp(17px, 5vw, 27px)",
                  lineHeight: 1.1,
                }}
              >
                {profile.full_name || "YOUR NAME"}
              </h1>

              <div
                style={{
                  marginTop: "5px",
                  fontSize: "clamp(9px, 2.5vw, 13px)",
                  letterSpacing: ".12em",
                }}
              >
                {(profile.position || "POSITION NOT SET").toUpperCase()}
              </div>
            </div>

            <div
              style={{
                position: "absolute",
                zIndex: 4,
                left: "12%",
                right: "12%",
                top: "69%",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "clamp(5px, 2vw, 12px) clamp(14px, 5vw, 30px)",
                color: "#fff8e9",
                textShadow: "0 2px 6px #000",
              }}
            >
              {statRows.flat().map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "8px",
                    borderBottom: "1px solid #c8b98b88",
                    paddingBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "clamp(10px, 2.7vw, 14px)",
                      fontWeight: 800,
                    }}
                  >
                    {stat.label}
                  </span>

                  <strong
                    style={{
                      fontSize: "clamp(15px, 4vw, 21px)",
                      fontWeight: 900,
                    }}
                  >
                    {ratingText(stat.value)}
                  </strong>
                </div>
              ))}
            </div>

            <div
              style={{
                position: "absolute",
                zIndex: 4,
                bottom: "4.2%",
                left: "8%",
                right: "8%",
                textAlign: "center",
                color: "#fff8e9",
                fontSize: "clamp(8px, 2.1vw, 11px)",
                letterSpacing: ".16em",
                textShadow: "0 2px 6px #000",
              }}
            >
              EST. 2026–2027
            </div>
          </div>

          <div className="tz-stage-caption">
            <span>◆</span> YOUR STORY. YOUR STATS. YOUR LEGACY.
          </div>

          <p className="tz-data-note">
            {card?.is_verified
              ? "VERIFIED PLAYER CARD"
              : "UNVERIFIED — OFFICIAL RATINGS AWAIT REVIEW"}
          </p>
        </section>

        <PlayerPhotoUpload
          userId={userId}
          currentPhoto={displayedPhoto}
          onUploaded={(url) => {
            const cleanUrl = url.split("?")[0];

            setProfile((current) => ({
              ...current,
              avatar_url: cleanUrl,
            }));

            setNotice("Your player portrait has been updated.");
          }}
          onRemoved={() => {
            setProfile((current) => ({
              ...current,
              avatar_url: null,
            }));

            setNotice("Your player portrait has been removed.");
          }}
        />

        <section className="tz-performance-strip">
          <div>
            <span>GAMES</span>
            <strong>{card?.appearances ?? "—"}</strong>
            <small>APPEARANCES</small>
          </div>

          <div>
            <span>GOALS</span>
            <strong>{card?.goals ?? "—"}</strong>
            <small>FINISHING</small>
          </div>

          <div>
            <span>ASSISTS</span>
            <strong>{card?.assists ?? "—"}</strong>
            <small>CREATIVITY</small>
          </div>

          <div>
            <span>RATING</span>
            <strong>
              {card?.average_rating == null
                ? "—"
                : Number(card.average_rating).toFixed(1)}
            </strong>
            <small>AVERAGE</small>
          </div>
        </section>

        {isManager && (
          <section className="tz-about-panel">
            <div className="tz-section-head">
              <div>
                <p className="tz-eyebrow"><i /> MANAGER CONTROL</p>
                <h2>OFFICIAL RATINGS.</h2>
              </div>

              <button
                type="button"
                className="tz-outline-button tz-small-button"
                disabled={!card}
                onClick={() => {
                  if (!editingCard && card) {
                    setCardDraft({
                      overall_rating: numberOrZero(card.overall_rating),
                      pace: numberOrZero(card.pace),
                      shooting: numberOrZero(card.shooting),
                      passing: numberOrZero(card.passing),
                      dribbling: numberOrZero(card.dribbling),
                      defending: numberOrZero(card.defending),
                      physical: numberOrZero(card.physical),
                      attack: numberOrZero(card.attack),
                      composure: numberOrZero(card.composure),
                      appearances: numberOrZero(card.appearances),
                      goals: numberOrZero(card.goals),
                      assists: numberOrZero(card.assists),
                    });

                    setAverageRatingDraft(
                      card.average_rating == null
                        ? ""
                        : String(card.average_rating)
                    );

                    setVerifiedDraft(Boolean(card.is_verified));
                  }

                  setEditingCard((value) => !value);
                }}
              >
                {editingCard ? "CANCEL" : "EDIT RATINGS"}
              </button>
            </div>

            <p className="tz-data-note">
              These controls edit only the signed-in account's player-card
              record. Other players are not listed on this personal page.
            </p>

            {editingCard && (
              <>
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
                    <label htmlFor="tz-card-average">
                      Average match rating (0–10)
                    </label>

                    <input
                      id="tz-card-average"
                      type="number"
                      min={0}
                      max={10}
                      step={0.01}
                      value={averageRatingDraft}
                      onChange={(event) =>
                        setAverageRatingDraft(event.target.value)
                      }
                    />
                  </div>

                  <div className="tz-profile-row">
                    <label htmlFor="tz-verified">Mark card as verified</label>

                    <input
                      id="tz-verified"
                      type="checkbox"
                      checked={verifiedDraft}
                      onChange={(event) =>
                        setVerifiedDraft(event.target.checked)
                      }
                    />
                  </div>
                </div>

                <button
                  type="button"
                  className="tz-outline-button"
                  disabled={saving || !card}
                  onClick={() => void saveCard()}
                >
                  {saving ? "SAVING…" : "SAVE OFFICIAL CARD"}
                </button>
              </>
            )}
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
                <span>PERFORMANCE PROFILE</span>
                <span>0–100</span>
              </div>

              <svg
                className="tz-radar"
                viewBox="0 0 360 330"
                role="img"
                aria-label="Player performance radar"
              >
                <defs>
                  <linearGradient
                    id="tzRadarFill"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#55ff9a" stopOpacity=".36" />
                    <stop offset="100%" stopColor="#12a965" stopOpacity=".06" />
                  </linearGradient>

                  <filter id="tzRadarGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
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
                    card
                      ? `180,${165 - numberOrZero(card.attack) * 1.3} ${180 + numberOrZero(card.defending) * 1.35},165 180,${165 + numberOrZero(card.composure) * 1.3} ${180 - numberOrZero(card.overall_rating) * 1.35},165`
                      : "180,165 180,165 180,165 180,165"
                  }
                />

                <polygon
                  className="tz-radar-line"
                  points={
                    card
                      ? `180,${165 - numberOrZero(card.attack) * 1.3} ${180 + numberOrZero(card.defending) * 1.35},165 180,${165 + numberOrZero(card.composure) * 1.3} ${180 - numberOrZero(card.overall_rating) * 1.35},165`
                      : "180,165 180,165 180,165 180,165"
                  }
                  filter="url(#tzRadarGlow)"
                />
              </svg>

              <div className="tz-radar-legend">
                <span><i /> PLAYER DATA</span>
                <span>{card?.is_verified ? "VERIFIED" : "UNVERIFIED"}</span>
              </div>
            </div>

            <div className="tz-attribute-list">
              <div className="tz-panel-top">
                <span>CORE ATTRIBUTES</span>
                <span>RATING</span>
              </div>

              {displayedAttributes.map((item) => (
                <div className="tz-attribute-row" key={item.label}>
                  <div>
                    <span>{item.label}</span>
                    <strong>{ratingText(item.value)}</strong>
                  </div>

                  <div className="tz-meter">
                    <i style={{ width: `${item.value}%` }} />
                  </div>
                </div>
              ))}

              {!card && (
                <p className="tz-data-note">
                  No official player card is available for this account yet.
                </p>
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
              type="button"
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
              Update your own profile. Official ratings are managed separately.
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

                <label htmlFor={`tz-${key}`}>{label}</label>

                {editingProfile ? (
                  key === "preferred_foot" ? (
                    <select
                      id={`tz-${key}`}
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
                      id={`tz-${key}`}
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
              type="button"
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
