
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Venue = {
  id: string;
  name: string;
  locality: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
};

type Turf = {
  id: string;
  name: string;
  format: string | null;
  surface: string | null;
  indoor: boolean | null;
  floodlights: boolean | null;
  venues: Venue;
};

type Suggestion = {
  venue_name: string;
  locality: string;
  address: string;
  maps_url: string;
  details: string;
};

const RESEARCH_LEADS = [
  { name: "Orchid Arena", locality: "New Town" },
  { name: "Tolly Turf", locality: "Tollygunge" },
  { name: "The Royal Turf", locality: "Topsia" },
  { name: "V Play | ILEAD", locality: "Kolkata" },
  { name: "TOP TURF ARENA", locality: "Kolkata" },
  { name: "God's Turf", locality: "Kolkata" },
  { name: "TURF EDGE", locality: "Kolkata" },
  { name: "THE TURF MANIA", locality: "Kolkata" },
  { name: "CLOUD TURF AND CAFE", locality: "Kolkata" },
  { name: "Turf-e-sthan", locality: "Kolkata" },
  { name: "The Royal Turf | Garia", locality: "Garia" },
  { name: "V Play | Narendrapur", locality: "Narendrapur" },
  { name: "COPA ARENA TURF", locality: "Kolkata" },
  { name: "Turf A4", locality: "Garia" },
  { name: "Bright Arena", locality: "Kolkata" },
  { name: "Kasba Turf", locality: "Kasba" },
  { name: "Turf Air Plaza", locality: "Kolkata" },
  { name: "Turf XL", locality: "Kolkata" },
  { name: "SkyTurf", locality: "Kolkata" },
  { name: "Elgin Turf", locality: "Elgin Road" },
  { name: "Extraa Time", locality: "Kolkata" },
];

const EMPTY_SUGGESTION: Suggestion = {
  venue_name: "",
  locality: "",
  address: "",
  maps_url: "",
  details: "",
};

// Real football photography. These are visual backgrounds only;
// the venue information itself always comes from your database.
const FOOTBALL_IMAGES = [
  "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1400&q=85",
  "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1400&q=85",
  "https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1400&q=85",
];

function mapsSearch(name: string, locality: string) {
  const query = `${name} football turf ${locality} Kolkata`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function distanceKm(
  venue: Venue,
  origin: { lat: number; lng: number },
): number {
  if (typeof venue.lat !== "number" || typeof venue.lng !== "number") {
    return Number.POSITIVE_INFINITY;
  }

  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(venue.lat - origin.lat);
  const dLng = radians(venue.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(origin.lat)) *
      Math.cos(radians(venue.lat)) *
      Math.sin(dLng / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function TurfsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [format, setFormat] = useState("ALL");
  const [surface, setSurface] = useState("ALL");
  const [indoorOnly, setIndoorOnly] = useState(false);
  const [lightsOnly, setLightsOnly] = useState(false);
  const [nearby, setNearby] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationMessage, setLocationMessage] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion>(EMPTY_SUGGESTION);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestMessage, setSuggestMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTurfs() {
      setLoading(true);
      setLoadError("");

      // Never retrieve rental prices on the public discovery page.
      const { data, error } = await supabase
        .from("turfs")
        .select(
          "id,name,format,surface,indoor,floodlights,venues!inner(id,name,locality,address,lat,lng,verified,active)",
        )
        .eq("active", true)
        .eq("venues.active", true)
        .eq("venues.verified", true)
        .order("name");

      if (!active) return;

      if (error) {
        setTurfs([]);
        setLoadError(
          "We couldn't load the verified grounds. Please try again shortly.",
        );
      } else {
        setTurfs((data ?? []) as unknown as Turf[]);
      }

      setLoading(false);
    }

    void loadTurfs();

    return () => {
      active = false;
    };
  }, [supabase]);

  const query = search.trim().toLowerCase();

  const filteredTurfs = useMemo(() => {
    const filtered = turfs.filter((turf) => {
      const searchable = [
        turf.name,
        turf.venues?.name,
        turf.venues?.locality,
        turf.venues?.address,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchable.includes(query)) &&
        (format === "ALL" ||
          turf.format?.toLowerCase() === format.toLowerCase()) &&
        (surface === "ALL" ||
          turf.surface?.toLowerCase() === surface.toLowerCase()) &&
        (!indoorOnly || Boolean(turf.indoor)) &&
        (!lightsOnly || Boolean(turf.floodlights))
      );
    });

    if (!nearby) return filtered;

    return [...filtered].sort(
      (a, b) =>
        distanceKm(a.venues, nearby) - distanceKm(b.venues, nearby),
    );
  }, [turfs, query, format, surface, indoorOnly, lightsOnly, nearby]);

  const filteredLeads = useMemo(() => {
    if (!query) return [];

    return RESEARCH_LEADS.filter((lead) => {
      const text = `${lead.name} ${lead.locality}`.toLowerCase();
      return text.includes(query);
    });
  }, [query]);

  function useMyLocation() {
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocationMessage("Location access is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setNearby({
          lat: coords.latitude,
          lng: coords.longitude,
        });
        setLocationMessage(
          "Location enabled. Grounds with saved coordinates are sorted by distance.",
        );
      },
      () => {
        setLocationMessage(
          "Location permission wasn't granted. Search by locality or PIN code instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function submitSuggestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (suggestBusy) return;

    setSuggestBusy(true);
    setSuggestMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("turf_suggestions").insert({
        venue_name: suggestion.venue_name.trim(),
        locality: suggestion.locality.trim(),
        address: suggestion.address.trim() || null,
        maps_url: suggestion.maps_url.trim() || null,
        details: suggestion.details.trim() || null,
        submitted_by: user?.id ?? null,
        status: "NEW",
      });

      if (error) {
        setSuggestMessage(
          "We couldn't submit this suggestion. Please try again later.",
        );
        return;
      }

      setSuggestion({ ...EMPTY_SUGGESTION });
      setSuggestMessage(
        "Suggestion received. The ground must be reviewed before it becomes a verified listing.",
      );
    } catch {
      setSuggestMessage(
        "Something went wrong. Please check your connection and try again.",
      );
    } finally {
      setSuggestBusy(false);
    }
  }

  return (
    <main className="find-page">
      <div className="ambient-glow" aria-hidden="true" />

      {/* HERO */}
      <section className="hero">
        <div className="hero-photo" aria-hidden="true" />
        <div className="hero-shade" aria-hidden="true" />

        <div className="hero-inner">
          <div className="top-label">
            <span className="live-dot" />
            KOLKATA FOOTBALL NETWORK
          </div>

          <div className="hero-copy">
            <p className="hero-kicker">THE GAME STARTS HERE</p>

            <h1>
              FIND YOUR
              <br />
              <span>GROUND.</span>
            </h1>

            <p className="hero-description">
              Discover the pitches. Find your people.
              <br className="desktop-break" />
              Make every matchday count.
            </p>

            <a className="hero-cta" href="#ground-finder">
              EXPLORE GROUNDS <span>↘</span>
            </a>
          </div>

          <div className="hero-bottom">
            <span>01 — DISCOVER</span>
            <span className="hero-bottom-line" />
            <span>02 — PLAY</span>
            <span className="hero-bottom-line" />
            <span>03 — BELONG</span>
          </div>
        </div>

        <div className="hero-side-label">BOOTROOM / GROUND NETWORK</div>
      </section>

      <div className="content-shell">
        {/* SEARCH */}
        <section className="finder-section" id="ground-finder">
          <div className="section-overline">
            <span className="section-number">01</span>
            <span>THE GROUND FINDER</span>
            <span className="overline-rule" />
            <span className="overline-city">KOLKATA, INDIA</span>
          </div>

          <div className="finder-heading">
            <div>
              <h2>Where are we<br />playing?</h2>
              <p>Find a ground that matches your game.</p>
            </div>

            <div className="finder-count">
              <strong>{loading ? "—" : filteredTurfs.length.toString().padStart(2, "0")}</strong>
              <span>VERIFIED<br />GROUNDS</span>
            </div>
          </div>

          <div className="finder-box">
            <form
              className="search-row"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch((value) => value.trim());
              }}
            >
              <label className="search-input-wrap">
                <span className="search-icon">⌕</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by ground, locality or PIN code..."
                  aria-label="Search by ground, locality or PIN code"
                />
                {search && (
                  <button
                    type="button"
                    className="clear-button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </label>

              <button
                type="button"
                className="location-button"
                onClick={useMyLocation}
              >
                <span>◎</span> NEAR ME
              </button>
            </form>

            <div className="filter-row">
              <label className="filter-control">
                <span>FORMAT</span>
                <select
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                >
                  <option value="ALL">All formats</option>
                  {["5v5", "6v6", "7v7", "8v8", "11v11"].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>

              <label className="filter-control">
                <span>SURFACE</span>
                <select
                  value={surface}
                  onChange={(event) => setSurface(event.target.value)}
                >
                  <option value="ALL">All surfaces</option>
                  {["Artificial Grass", "Natural Grass", "Astro Turf", "Indoor"].map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>

              <label className="toggle-filter">
                <input
                  type="checkbox"
                  checked={indoorOnly}
                  onChange={(event) => setIndoorOnly(event.target.checked)}
                />
                <span className="toggle-track" />
                INDOOR
              </label>

              <label className="toggle-filter">
                <input
                  type="checkbox"
                  checked={lightsOnly}
                  onChange={(event) => setLightsOnly(event.target.checked)}
                />
                <span className="toggle-track" />
                FLOODLIGHTS
              </label>
            </div>

            {locationMessage && (
              <p className="status-message" role="status">{locationMessage}</p>
            )}
          </div>
        </section>

        {/* VERIFIED GROUNDS */}
        <section className="grounds-section">
          <div className="section-overline">
            <span className="section-number">02</span>
            <span>THE BOOTROOM DIRECTORY</span>
            <span className="overline-rule" />
            <span className="overline-city">VERIFIED LISTINGS</span>
          </div>

          <div className="grounds-heading">
            <div>
              <p className="green-kicker">BUILT FOR THE LOVE OF THE GAME</p>
              <h2>Find your next<br /><em>matchday.</em></h2>
            </div>
            <p className="grounds-intro">
              Real grounds. Verified venues.
              <br />
              Your next game is closer than you think.
            </p>
          </div>

          {loading ? (
            <div className="state-panel">
              <div className="loading-ball">⚽</div>
              <p>SCOUTING THE GROUNDS...</p>
            </div>
          ) : loadError ? (
            <div className="state-panel">
              <h3>We hit a small obstacle.</h3>
              <p>{loadError}</p>
              <button
                className="retry-button"
                type="button"
                onClick={() => window.location.reload()}
              >
                TRY AGAIN ↗
              </button>
            </div>
          ) : filteredTurfs.length === 0 ? (
            <div className="state-panel">
              <div className="empty-symbol">✳</div>
              <h3>No verified grounds found.</h3>
              <p>
                {query
                  ? "Try another locality or suggest a ground for our team to review."
                  : "Verified grounds will appear here as venues join the network."}
              </p>
              <button
                className="retry-button"
                type="button"
                onClick={() => {
                  setSearch("");
                  setFormat("ALL");
                  setSurface("ALL");
                  setIndoorOnly(false);
                  setLightsOnly(false);
                }}
              >
                CLEAR FILTERS ↗
              </button>
            </div>
          ) : (
            <div className="ground-grid">
              {filteredTurfs.map((turf, index) => (
                <article className="ground-card" key={turf.id}>
                  <div
                    className="ground-photo"
                    style={{
                      backgroundImage: `url("${FOOTBALL_IMAGES[index % FOOTBALL_IMAGES.length]}")`,
                    }}
                  >
                    <div className="photo-shade" />
                    <span className="ground-index">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="verified-badge">
                      <span>✦</span> VERIFIED
                    </span>
                    <span className="photo-caption">BOOTROOM GROUND NETWORK</span>
                  </div>

                  <div className="ground-info">
                    <div className="ground-location">
                      <span>⌖</span>
                      {turf.venues?.locality || "Kolkata"}
                    </div>

                    <h3>{turf.venues?.name || turf.name}</h3>

                    <p className="ground-name">
                      {turf.name !== turf.venues?.name
                        ? turf.name
                        : "Football ground"}
                    </p>

                    <div className="ground-tags">
                      {turf.format && <span>{turf.format}</span>}
                      {turf.surface && <span>{turf.surface}</span>}
                      {turf.indoor && <span>INDOOR</span>}
                      {turf.floodlights && <span>FLOODLIGHTS</span>}
                    </div>

                    <div className="ground-actions">
                      <a
                        href={mapsSearch(
                          turf.venues?.name || turf.name,
                          turf.venues?.locality || "Kolkata",
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        DIRECTIONS <span>↗</span>
                      </a>

                      <Link href={`/turfs/${turf.id}`}>
                        EXPLORE GROUND <span>→</span>
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {query && filteredLeads.length > 0 && (
            <div className="research-section">
              <div className="section-overline">
                <span className="section-number">03</span>
                <span>THE WIDER FOOTBALL MAP</span>
                <span className="overline-rule" />
              </div>

              <h3>More grounds to discover.</h3>
              <p className="research-note">
                These are research leads, not verified BOOTROOM inventory.
                Check the location and details before travelling.
              </p>

              <div className="research-grid">
                {filteredLeads.map((lead) => (
                  <a
                    className="research-card"
                    key={lead.name}
                    href={mapsSearch(lead.name, lead.locality)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="research-star">✳</span>
                    <span className="research-name">
                      <strong>{lead.name}</strong>
                      <small>{lead.locality} · Not verified</small>
                    </span>
                    <span className="research-arrow">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* COMMUNITY SUGGESTION */}
        <section className="suggest-section">
          <div className="suggest-image">
            <div className="suggest-image-overlay" />
            <div className="suggest-image-content">
              <span>THE GAME BELONGS TO EVERYONE</span>
              <strong>KNOW A<br />HIDDEN GEM?</strong>
              <small>HELP US PUT IT ON THE MAP.</small>
            </div>
          </div>

          <div className="suggest-content">
            <div className="section-overline">
              <span className="section-number">04</span>
              <span>COMMUNITY POWERED</span>
            </div>

            <h2>Help football<br /><em>find its home.</em></h2>

            <p>
              Know a great local pitch? Tell us about it.
              Our team can review the ground before it joins
              the verified BOOTROOM directory.
            </p>

            <button
              type="button"
              className="suggest-toggle"
              aria-expanded={showSuggest}
              onClick={() => {
                setShowSuggest((value) => !value);
                setSuggestMessage("");
              }}
            >
              {showSuggest ? "CLOSE FORM −" : "SUGGEST A GROUND ＋"}
            </button>

            {showSuggest && (
              <form className="suggest-form" onSubmit={submitSuggestion}>
                <label>
                  GROUND NAME *
                  <input
                    required
                    maxLength={120}
                    value={suggestion.venue_name}
                    onChange={(event) =>
                      setSuggestion({ ...suggestion, venue_name: event.target.value })
                    }
                  />
                </label>

                <label>
                  LOCALITY / PIN CODE *
                  <input
                    required
                    maxLength={120}
                    value={suggestion.locality}
                    onChange={(event) =>
                      setSuggestion({ ...suggestion, locality: event.target.value })
                    }
                  />
                </label>

                <label>
                  ADDRESS (OPTIONAL)
                  <input
                    maxLength={300}
                    value={suggestion.address}
                    onChange={(event) =>
                      setSuggestion({ ...suggestion, address: event.target.value })
                    }
                  />
                </label>

                <label>
                  GOOGLE MAPS LINK (OPTIONAL)
                  <input
                    type="url"
                    maxLength={1000}
                    placeholder="https://maps.google.com/..."
                    value={suggestion.maps_url}
                    onChange={(event) =>
                      setSuggestion({ ...suggestion, maps_url: event.target.value })
                    }
                  />
                </label>

                <label className="full-field">
                  EXTRA DETAILS (OPTIONAL)
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={suggestion.details}
                    onChange={(event) =>
                      setSuggestion({ ...suggestion, details: event.target.value })
                    }
                  />
                </label>

                <button disabled={suggestBusy} type="submit">
                  {suggestBusy ? "SENDING..." : "SUBMIT FOR REVIEW →"}
                </button>

                {suggestMessage && (
                  <p className="status-message full-field" role="status">
                    {suggestMessage}
                  </p>
                )}
              </form>
            )}
          </div>
        </section>

        <footer className="page-footer">
          <div className="footer-brand">BOOTROOM<span>✳</span></div>
          <p>YOUR CITY. YOUR SQUAD. YOUR GAME.</p>
          <span className="footer-bottom">MADE FOR THE LOVE OF FOOTBALL · KOLKATA</span>
        </footer>
      </div>

      <style jsx>{`
        .find-page {
          --green: #a4ffbd;
          --green-strong: #70e995;
          --ink: #050907;
          --muted: #a7b3aa;
          position: relative;
          isolation: isolate;
          min-height: 100vh;
          overflow: hidden;
          padding-bottom: 40px;
          background: #050907;
          color: #f5f8f4;
        }

        .ambient-glow {
          position: absolute;
          z-index: -1;
          top: 900px;
          left: 50%;
          width: 900px;
          height: 900px;
          transform: translateX(-50%);
          pointer-events: none;
          background: radial-gradient(ellipse, #0b54252a, transparent 68%);
        }

        /* HERO — full-width football photography */
        .hero {
          position: relative;
          min-height: 690px;
          overflow: hidden;
          background: #06100b;
        }

        .hero-photo,
        .hero-shade {
          position: absolute;
          inset: 0;
        }

        .hero-photo {
          background-image: url("https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=2400&q=90");
          background-position: center 48%;
          background-size: cover;
          transform: scale(1.015);
          animation: heroReveal 1.2s ease-out both;
        }

        .hero-shade {
          background:
            linear-gradient(90deg, rgba(2, 8, 5, .91) 0%, rgba(2, 8, 5, .68) 40%, rgba(2, 8, 5, .12) 100%),
            linear-gradient(0deg, #050907 0%, transparent 36%, rgba(0, 0, 0, .2) 100%);
        }

        .hero-inner {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          width: min(1200px, calc(100% - 64px));
          min-height: 690px;
          margin: 0 auto;
          padding: 38px 0 32px;
        }

        .top-label {
          display: flex;
          align-items: center;
          gap: 11px;
          color: #e1e9e2;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .23em;
        }

        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--green);
          box-shadow: 0 0 14px var(--green);
        }

        .hero-copy {
          margin-top: 50px;
          margin-bottom: 40px;
        }

        .hero-kicker,
        .green-kicker {
          margin: 0 0 20px;
          color: var(--green);
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .25em;
        }

        .hero h1 {
          margin: 0;
          color: #fff;
          font-family: Impact, "Arial Narrow", sans-serif;
          font-size: clamp(72px, 11vw, 142px);
          font-weight: 900;
          letter-spacing: -.035em;
          line-height: .82;
          text-shadow: 0 5px 40px #0009;
        }

        .hero h1 span {
          color: var(--green);
        }

        .hero-description {
          margin: 28px 0 27px;
          color: #e0e8e1;
          font-size: 15px;
          line-height: 1.8;
        }

        .hero-cta {
          display: inline-flex;
          align-items: center;
          gap: 28px;
          padding: 16px 20px;
          background: var(--green);
          color: #061009;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .14em;
          text-decoration: none;
          transition: background .2s, transform .2s;
        }

        .hero-cta:hover {
          background: #fff;
          transform: translateY(-2px);
        }

        .hero-cta span {
          font-size: 17px;
        }

        .hero-bottom {
          display: flex;
          align-items: center;
          gap: 15px;
          color: #d7e0d9;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .18em;
        }

        .hero-bottom-line {
          width: 35px;
          height: 1px;
          background: #a4ffbd77;
        }

        .hero-side-label {
          position: absolute;
          right: 25px;
          top: 50%;
          color: #ffffff9c;
          font-size: 8px;
          letter-spacing: .25em;
          writing-mode: vertical-rl;
        }

        .content-shell {
          width: min(1200px, calc(100% - 64px));
          margin: 0 auto;
        }

        /* Section typography */
        .section-overline {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #d1ddd4;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .19em;
        }

        .section-number {
          color: var(--green);
        }

        .overline-rule {
          flex: 1;
          height: 1px;
          background: #ffffff1b;
        }

        .overline-city {
          color: #839187;
          font-size: 8px;
        }

        /* Finder */
        .finder-section {
          position: relative;
          z-index: 2;
          margin-top: -1px;
          padding: 55px 0 65px;
          border-bottom: 1px solid #ffffff16;
        }

        .finder-heading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
          margin: 30px 0 25px;
        }

        .finder-heading h2,
        .grounds-heading h2,
        .suggest-content h2 {
          margin: 0;
          color: #f3f7f3;
          font-family: Impact, "Arial Narrow", sans-serif;
          font-size: clamp(40px, 5vw, 62px);
          font-weight: 500;
          letter-spacing: -.015em;
          line-height: .98;
        }

        .finder-heading > div:first-child > p {
          margin: 12px 0 0;
          color: var(--muted);
          font-size: 13px;
        }

        .finder-count {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 5px;
        }

        .finder-count strong {
          color: var(--green);
          font-family: Impact, sans-serif;
          font-size: 48px;
          font-weight: 500;
        }

        .finder-count span {
          color: #9eaca2;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .13em;
          line-height: 1.6;
        }

        .finder-box {
          padding: 22px;
          border: 1px solid #ffffff20;
          background: linear-gradient(135deg, #101a14, #0a100c);
          box-shadow: 0 24px 60px #0005;
        }

        .search-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 145px;
          gap: 10px;
        }

        .search-input-wrap {
          display: flex;
          align-items: center;
          min-width: 0;
          min-height: 56px;
          gap: 13px;
          padding: 0 16px;
          border: 1px solid #ffffff24;
          background: #050a07;
        }

        .search-icon {
          color: var(--green);
          font-size: 28px;
        }

        .search-input-wrap input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #fff;
          font-size: 13px;
        }

        .search-input-wrap input::placeholder {
          color: #77847a;
        }

        .clear-button {
          border: 0;
          background: transparent;
          color: #aab7ad;
          font-size: 23px;
          cursor: pointer;
        }

        .location-button {
          border: 1px solid #a4ffbd;
          background: #a4ffbd;
          color: #061009;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .1em;
          cursor: pointer;
          transition: background .2s;
        }

        .location-button:hover {
          background: #fff;
        }

        .location-button span {
          margin-right: 7px;
          font-size: 17px;
        }

        .filter-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-top: 13px;
        }

        .filter-control {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 43px;
          padding: 0 12px;
          border: 1px solid #ffffff1b;
          background: #070d09;
        }

        .filter-control > span {
          color: #9ca99f;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .13em;
        }

        .filter-control select {
          max-width: 170px;
          border: 0;
          outline: 0;
          background: transparent;
          color: #e7eee8;
          font-size: 11px;
        }

        .filter-control option {
          background: #08110c;
          color: #fff;
        }

        .toggle-filter {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 43px;
          padding: 0 12px;
          border: 1px solid #ffffff1b;
          color: #b8c4bb;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .1em;
          cursor: pointer;
        }

        .toggle-filter input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }

        .toggle-track {
          position: relative;
          width: 25px;
          height: 14px;
          border-radius: 20px;
          background: #344039;
          transition: background .2s;
        }

        .toggle-track::after {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #d5ded7;
          content: "";
          transition: transform .2s;
        }

        .toggle-filter input:checked + .toggle-track {
          background: #4caa69;
        }

        .toggle-filter input:checked + .toggle-track::after {
          transform: translateX(11px);
          background: #fff;
        }

        .toggle-filter input:focus-visible + .toggle-track {
          outline: 2px solid var(--green);
          outline-offset: 3px;
        }

        .status-message {
          margin: 13px 0 0;
          color: var(--green);
          font-size: 12px;
          line-height: 1.6;
        }

        /* Grounds */
        .grounds-section {
          padding: 70px 0 75px;
        }

        .grounds-heading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 30px;
          margin: 32px 0;
        }

        .green-kicker {
          margin-bottom: 13px;
          font-size: 9px;
        }

        .grounds-heading h2 em,
        .suggest-content h2 em {
          color: var(--green);
          font-style: normal;
        }

        .grounds-intro {
          margin: 0 0 5px;
          color: #a8b4aa;
          font-size: 12px;
          line-height: 1.9;
        }

        .ground-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
        }

        .ground-card {
          min-width: 0;
          overflow: hidden;
          border: 1px solid #ffffff1c;
          background: #0b120d;
          transition: border-color .25s, transform .25s, box-shadow .25s;
        }

        .ground-card:hover {
          transform: translateY(-5px);
          border-color: #a4ffbd85;
          box-shadow: 0 18px 45px #0008;
        }

        .ground-photo {
          position: relative;
          height: 205px;
          overflow: hidden;
          background-color: #14251a;
          background-position: center;
          background-size: cover;
          transition: background-size .3s;
        }

        .photo-shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, #02070470, transparent 40%, #020704bb);
        }

        .ground-index {
          position: absolute;
          top: 13px;
          left: 14px;
          color: #fff;
          font-family: Impact, sans-serif;
          font-size: 25px;
          text-shadow: 0 2px 12px #000;
        }

        .verified-badge {
          position: absolute;
          top: 15px;
          right: 13px;
          padding: 7px 9px;
          border: 1px solid #a4ffbd70;
          background: #07130bd9;
          color: var(--green);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .13em;
        }

        .verified-badge span {
          margin-right: 5px;
        }

        .photo-caption {
          position: absolute;
          bottom: 13px;
          left: 14px;
          color: #ffffffd4;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .16em;
        }

        .ground-info {
          padding: 19px 17px 15px;
        }

        .ground-location {
          display: flex;
          align-items: center;
          gap: 7px;
          color: var(--green);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .ground-location span {
          font-size: 15px;
        }

        .ground-info h3 {
          margin: 13px 0 5px;
          overflow-wrap: anywhere;
          color: #f3f7f3;
          font-family: Impact, "Arial Narrow", sans-serif;
          font-size: 27px;
          font-weight: 500;
          letter-spacing: .01em;
        }

        .ground-name {
          margin: 0;
          color: #8f9c92;
          font-size: 11px;
        }

        .ground-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          min-height: 25px;
          margin: 17px 0;
        }

        .ground-tags span {
          padding: 6px 8px;
          border: 1px solid #ffffff1d;
          color: #c1cec4;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: .06em;
        }

        .ground-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding-top: 14px;
          border-top: 1px solid #ffffff1a;
        }

        .ground-actions a {
          color: #c5d0c8;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .08em;
          text-decoration: none;
          transition: color .2s;
        }

        .ground-actions a:last-child {
          color: var(--green);
        }

        .ground-actions a:hover {
          color: #fff;
        }

        .ground-actions a span {
          margin-left: 5px;
        }

        .state-panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 250px;
          padding: 35px 20px;
          border: 1px solid #ffffff1c;
          background: #0b120d;
          text-align: center;
        }

        .state-panel h3 {
          margin: 10px 0;
          color: #fff;
          font-family: Impact, sans-serif;
          font-size: 30px;
          font-weight: 500;
        }

        .state-panel p {
          max-width: 470px;
          color: #a8b4aa;
          font-size: 12px;
          line-height: 1.8;
        }

        .loading-ball,
        .empty-symbol {
          color: var(--green);
          font-size: 32px;
        }

        .state-panel > p:first-of-type {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .17em;
        }

        .retry-button {
          margin-top: 13px;
          padding: 13px 17px;
          border: 1px solid var(--green);
          background: var(--green);
          color: #061009;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .1em;
          cursor: pointer;
        }

        /* Research leads */
        .research-section {
          margin-top: 55px;
          padding-top: 28px;
          border-top: 1px solid #ffffff1c;
        }

        .research-section h3 {
          margin: 22px 0 8px;
          color: #f0f5f0;
          font-family: Impact, sans-serif;
          font-size: 34px;
          font-weight: 500;
        }

        .research-note {
          color: #9eaaa1;
          font-size: 11px;
          line-height: 1.7;
        }

        .research-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
          margin-top: 19px;
        }

        .research-card {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
          padding: 15px;
          border: 1px solid #ffffff19;
          background: #0a110d;
          text-decoration: none;
          transition: border-color .2s, background .2s;
        }

        .research-card:hover {
          border-color: #a4ffbd70;
          background: #101c14;
        }

        .research-star {
          color: var(--green);
          font-size: 16px;
        }

        .research-name {
          flex: 1;
          min-width: 0;
        }

        .research-name strong,
        .research-name small {
          display: block;
          overflow-wrap: anywhere;
        }

        .research-name strong {
          color: #edf3ed;
          font-size: 12px;
        }

        .research-name small {
          margin-top: 5px;
          color: #8e9b91;
          font-size: 9px;
        }

        .research-arrow {
          color: var(--green);
          font-size: 18px;
        }

        /* Suggestion section */
        .suggest-section {
          display: grid;
          grid-template-columns: .85fr 1.15fr;
          border: 1px solid #ffffff24;
          background: #0b120d;
        }

        .suggest-image {
          position: relative;
          min-height: 460px;
          overflow: hidden;
          background-image: url("https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&w=1200&q=85");
          background-position: center;
          background-size: cover;
        }

        .suggest-image-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(0deg, #030805e8, #03080520 90%);
        }

        .suggest-image-content {
          position: absolute;
          right: 25px;
          bottom: 27px;
          left: 25px;
        }

        .suggest-image-content span,
        .suggest-image-content small {
          display: block;
          color: var(--green);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: .16em;
        }

        .suggest-image-content strong {
          display: block;
          margin: 12px 0;
          color: #fff;
          font-family: Impact, sans-serif;
          font-size: clamp(38px, 5vw, 62px);
          font-weight: 500;
          line-height: .9;
        }

        .suggest-content {
          padding: clamp(25px, 4vw, 48px);
        }

        .suggest-content h2 {
          margin-top: 32px;
          font-size: clamp(38px, 4.5vw, 55px);
        }

        .suggest-content > p {
          max-width: 430px;
          margin: 17px 0 23px;
          color: #a8b4aa;
          font-size: 12px;
          line-height: 1.9;
        }

        .suggest-toggle {
          padding: 14px 17px;
          border: 1px solid var(--green);
          background: var(--green);
          color: #061009;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .12em;
          cursor: pointer;
          transition: background .2s;
        }

        .suggest-toggle:hover {
          background: #fff;
        }

        .suggest-form {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 13px;
          margin-top: 26px;
          padding-top: 24px;
          border-top: 1px solid #ffffff1c;
        }

        .suggest-form label {
          color: #aebbb1;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .12em;
        }

        .suggest-form input,
        .suggest-form textarea {
          display: block;
          box-sizing: border-box;
          width: 100%;
          margin-top: 8px;
          padding: 13px;
          border: 1px solid #ffffff25;
          outline: 0;
          background: #050a07;
          color: #f5f8f4;
          font: 12px Arial, sans-serif;
        }

        .suggest-form input:focus,
        .suggest-form textarea:focus {
          border-color: var(--green);
        }

        .suggest-form input::placeholder {
          color: #718076;
        }

        .suggest-form .full-field,
        .suggest-form > button {
          grid-column: 1 / -1;
        }

        .suggest-form > button {
          min-height: 47px;
          border: 0;
          background: var(--green);
          color: #061009;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: .13em;
          cursor: pointer;
        }

        .suggest-form > button:disabled {
          opacity: .55;
          cursor: wait;
        }

        /* Footer */
        .page-footer {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 65px 0 15px;
          text-align: center;
        }

        .footer-brand {
          color: #f3f7f3;
          font-family: Impact, sans-serif;
          font-size: 31px;
          letter-spacing: .1em;
        }

        .footer-brand span {
          margin-left: 9px;
          color: var(--green);
        }

        .page-footer p {
          margin: 9px 0 23px;
          color: #a8b4aa;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .2em;
        }

        .footer-bottom {
          color: #68766c;
          font-size: 8px;
          letter-spacing: .16em;
        }

        @keyframes heroReveal {
          from { opacity: .65; transform: scale(1.06); }
          to { opacity: 1; transform: scale(1.015); }
        }

        @media (max-width: 850px) {
          .ground-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .suggest-section {
            grid-template-columns: .8fr 1.2fr;
          }

          .suggest-image {
            min-height: 400px;
          }
        }

        @media (max-width: 650px) {
          .hero,
          .hero-inner {
            min-height: 610px;
          }

          .hero-inner,
          .content-shell {
            width: calc(100% - 36px);
          }

          .hero-photo {
            background-position: 57% center;
          }

          .hero-shade {
            background:
              linear-gradient(90deg, #020805d9, #02080555 100%),
              linear-gradient(0deg, #050907 0%, transparent 45%);
          }

          .hero h1 {
            font-size: clamp(68px, 17vw, 105px);
          }

          .hero-description {
            font-size: 13px;
          }

          .hero-side-label {
            right: 10px;
            font-size: 7px;
          }

          .finder-section {
            padding: 42px 0 48px;
          }

          .finder-heading {
            margin-top: 25px;
          }

          .finder-heading h2 {
            font-size: 45px;
          }

          .finder-count strong {
            font-size: 37px;
          }

          .finder-box {
            padding: 14px;
          }

          .search-row {
            grid-template-columns: 1fr;
          }

          .location-button {
            min-height: 48px;
          }

          .filter-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .filter-control {
            justify-content: space-between;
            min-width: 0;
            padding: 0 8px;
          }

          .filter-control select {
            max-width: 105px;
            min-width: 0;
          }

          .toggle-filter {
            justify-content: center;
            padding: 0 5px;
            font-size: 8px;
          }

          .grounds-section {
            padding: 48px 0;
          }

          .grounds-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 15px;
            margin: 25px 0;
          }

          .grounds-heading h2 {
            font-size: 52px;
          }

          .ground-grid {
            grid-template-columns: 1fr;
            gap: 14px;
          }

          .ground-photo {
            height: 225px;
          }

          .ground-info h3 {
            font-size: 29px;
          }

          .research-grid {
            grid-template-columns: 1fr;
          }

          .suggest-section {
            grid-template-columns: 1fr;
          }

          .suggest-image {
            min-height: 280px;
          }

          .suggest-image-content strong {
            font-size: 52px;
          }

          .suggest-content {
            padding: 25px 20px;
          }

          .suggest-content h2 {
            margin-top: 25px;
            font-size: 44px;
          }

          .suggest-form {
            grid-template-columns: 1fr;
          }

          .suggest-form label,
          .suggest-form .full-field {
            grid-column: 1 / -1;
          }

          .hero-bottom {
            gap: 9px;
            font-size: 7px;
          }

          .hero-bottom-line {
            width: 15px;
          }

          .section-overline {
            gap: 8px;
            font-size: 8px;
          }

          .overline-city {
            font-size: 7px;
          }
        }

        @media (max-width: 380px) {
          .hero,
          .hero-inner {
            min-height: 570px;
          }

          .hero h1 {
            font-size: 63px;
          }

          .finder-heading h2 {
            font-size: 39px;
          }

          .finder-count strong {
            font-size: 31px;
          }

          .filter-control {
            flex-direction: column;
            align-items: flex-start;
            justify-content: center;
            gap: 5px;
          }

          .filter-control select {
            max-width: 100%;
            width: 100%;
          }

          .toggle-filter {
            font-size: 7px;
          }

          .ground-actions a {
            font-size: 7px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-photo {
            animation: none;
          }

          .ground-card,
          .hero-cta,
          .suggest-toggle {
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}
