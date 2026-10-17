
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
  const [suggestion, setSuggestion] =
    useState<Suggestion>(EMPTY_SUGGESTION);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [suggestMessage, setSuggestMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadTurfs() {
      setLoading(true);
      setLoadError("");

      // Public Turf pages must never fetch or display rental prices.
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

    const specificLocalities = [
      "garia",
      "tollygunge",
      "tolly",
      "topsia",
      "kasba",
      "salt lake",
      "new town",
      "narendrapur",
      "elgin",
    ];

    const specific = specificLocalities.find((locality) =>
      query.includes(locality),
    );

    return RESEARCH_LEADS.filter((lead) => {
      const text = `${lead.name} ${lead.locality}`.toLowerCase();

      if (specific && lead.locality.toLowerCase() === "kolkata") {
        return false;
      }

      return (
        text.includes(query) ||
        lead.locality.toLowerCase().includes(query)
      );
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
    <main className="forest-page">
      {/* This is the actual photograph, not a CSS forest illustration. */}
      <div className="forest-scene" aria-hidden="true" />

      <div className="forest-content">
        <section className="hero">
          <div className="eyebrow">
            <span /> THE GROUNDS OF THE GAME <span />
          </div>

          <p className="pretitle">YOUR NEXT CHAPTER STARTS HERE</p>

          <h1>
            FIND YOUR
            <br />
            <em>NEXT GROUND.</em>
          </h1>

          <p className="hero-copy">
            A better pitch. A better matchday. A football community that feels
            like home.
          </p>

          <div className="mantra">
            <span>DISCOVER</span>
            <i />
            <span>PLAY</span>
            <i />
            <span>BELONG</span>
          </div>
        </section>

        <section className="search-panel">
          <div className="panel-heading">
            THE GROUND FINDER <span>✦</span>
          </div>

          <form
            className="search-row"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch((value) => value.trim());
            }}
          >
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search city, locality or PIN code…"
                aria-label="Search city, locality or PIN code"
              />

              {search && (
                <button
                  type="button"
                  className="clear-search"
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
              <span>⌖</span> USE MY LOCATION
            </button>
          </form>

          <div className="filters">
            <label className="select-filter">
              <span>FORMAT</span>
              <select
                value={format}
                onChange={(event) => setFormat(event.target.value)}
              >
                <option value="ALL">All formats</option>
                {["5v5", "6v6", "7v7", "8v8", "11v11"].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="select-filter">
              <span>SURFACE</span>
              <select
                value={surface}
                onChange={(event) => setSurface(event.target.value)}
              >
                <option value="ALL">All surfaces</option>
                {[
                  "Artificial Grass",
                  "Natural Grass",
                  "Astro Turf",
                  "Indoor",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="check-filter">
              <input
                type="checkbox"
                checked={indoorOnly}
                onChange={(event) => setIndoorOnly(event.target.checked)}
              />
              INDOOR
            </label>

            <label className="check-filter">
              <input
                type="checkbox"
                checked={lightsOnly}
                onChange={(event) => setLightsOnly(event.target.checked)}
              />
              FLOODLIGHTS
            </label>
          </div>

          {locationMessage && (
            <p className="status-message" role="status">
              {locationMessage}
            </p>
          )}
        </section>

        <section className="results-section">
          <div className="results-heading">
            <div>
              <div className="eyebrow">VERIFIED GROUNDS</div>
              <h2>Curated for players.</h2>
            </div>

            <p className="trust-line">
              TRUSTED <i /> VERIFIED <i /> COMMUNITY-LED
            </p>
          </div>

          {loading ? (
            <div className="empty-state">Discovering the grounds…</div>
          ) : loadError ? (
            <div className="empty-state">
              <h3>We hit a small obstacle.</h3>
              <p>{loadError}</p>
              <button
                className="retry-button"
                type="button"
                onClick={() => window.location.reload()}
              >
                TRY AGAIN
              </button>
            </div>
          ) : filteredTurfs.length === 0 ? (
            <div className="empty-state">
              <span className="empty-star">✦</span>
              <h3>No verified grounds found yet.</h3>
              <p>
                {query
                  ? "Try another locality, or suggest a ground for review below."
                  : "As venues are verified and onboarded, they will appear here."}
              </p>
            </div>
          ) : (
            <div className="turf-grid">
              {filteredTurfs.map((turf, index) => (
                <article className="turf-card" key={turf.id}>
                  <div className={`pitch-image pitch-${index % 3}`}>
                    <span className="card-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="verified-mark">✦ VERIFIED</span>
                    <div className="pitch-lines" />
                    <div className="pitch-lights" />
                  </div>

                  <div className="turf-card-body">
                    <p className="locality">
                      ⌖ {turf.venues?.locality || "Kolkata"}
                    </p>

                    <h3>{turf.venues?.name || turf.name}</h3>

                    <p className="turf-subtitle">
                      {turf.name !== turf.venues?.name
                        ? turf.name
                        : "Football ground"}
                    </p>

                    <div className="tags">
                      {turf.format && <span>{turf.format}</span>}
                      {turf.surface && <span>{turf.surface}</span>}
                      {turf.indoor && <span>INDOOR</span>}
                      {turf.floodlights && <span>FLOODLIGHTS</span>}
                    </div>

                    <div className="card-actions">
                      <a
                        href={mapsSearch(
                          turf.venues?.name || turf.name,
                          turf.venues?.locality || "Kolkata",
                        )}
                        target="_blank"
                        rel="noreferrer"
                      >
                        DIRECTIONS ↗
                      </a>

                      <Link href={`/turfs/${turf.id}`}>
                        EXPLORE GROUND →
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {query && filteredLeads.length > 0 && (
            <section className="research-section">
              <div className="eyebrow">MORE GROUNDS TO EXPLORE</div>
              <h3>Worth discovering.</h3>
              <p>
                These are research leads, not verified BOOTROOM inventory.
                Check the location and details before travelling.
              </p>

              <div className="research-grid">
                {filteredLeads.map((lead) => (
                  <article className="research-card" key={lead.name}>
                    <span>✦</span>
                    <div>
                      <strong>{lead.name}</strong>
                      <small>{lead.locality} · Not yet verified</small>
                    </div>
                    <a
                      href={mapsSearch(lead.name, lead.locality)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Find ${lead.name} on Maps`}
                    >
                      ↗
                    </a>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>

        <section className="suggest-section">
          <div className="suggest-copy">
            <div className="eyebrow">KNOW A GREAT GROUND?</div>
            <h2>Help football find its home.</h2>
            <p>
              Suggest a local pitch. Our team can review it before it joins the
              verified grounds.
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
          </div>

          {showSuggest && (
            <form className="suggest-form" onSubmit={submitSuggestion}>
              <label>
                GROUND NAME
                <input
                  required
                  maxLength={120}
                  value={suggestion.venue_name}
                  onChange={(event) =>
                    setSuggestion({
                      ...suggestion,
                      venue_name: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                LOCALITY / PIN CODE
                <input
                  required
                  maxLength={120}
                  value={suggestion.locality}
                  onChange={(event) =>
                    setSuggestion({
                      ...suggestion,
                      locality: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                ADDRESS (OPTIONAL)
                <input
                  maxLength={300}
                  value={suggestion.address}
                  onChange={(event) =>
                    setSuggestion({
                      ...suggestion,
                      address: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                MAPS LINK (OPTIONAL)
                <input
                  type="url"
                  maxLength={1000}
                  placeholder="https://maps.google.com/…"
                  value={suggestion.maps_url}
                  onChange={(event) =>
                    setSuggestion({
                      ...suggestion,
                      maps_url: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                EXTRA DETAILS (OPTIONAL)
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={suggestion.details}
                  onChange={(event) =>
                    setSuggestion({
                      ...suggestion,
                      details: event.target.value,
                    })
                  }
                />
              </label>

              <button disabled={suggestBusy} type="submit">
                {suggestBusy ? "SENDING…" : "SEND FOR REVIEW →"}
              </button>

              {suggestMessage && (
                <p className="status-message" role="status">
                  {suggestMessage}
                </p>
              )}
            </form>
          )}
        </section>

        <footer className="forest-footer">
          BOOTROOM <span>✦</span> FOR THE LOVE OF THE GAME
        </footer>
      </div>

      <style jsx>{`
        .forest-page {
          position: relative;
          isolation: isolate;
          min-height: 100vh;
          overflow: clip;
          padding-bottom: 120px;
          background: #050b08;
          color: #f4ecd8;
        }

        /*
         * CRITICAL LAYER FIX:
         * Photograph is above the page background and behind all content.
         * Do not change this to z-index: -1.
         */
        .forest-scene {
          position: absolute;
          z-index: 0;
          inset: 0 0 auto;
          height: min(1450px, 150vh);
          pointer-events: none;
          background-color: #07100b;
          background-image:
            linear-gradient(
              180deg,
              rgba(5, 11, 8, 0.02) 0%,
              rgba(5, 11, 8, 0.04) 38%,
              rgba(5, 11, 8, 0.20) 62%,
              rgba(5, 11, 8, 0.65) 82%,
              #050b08 100%
            ),
            url("/brand/forest-night.png");
          background-position: center top;
          background-size: cover;
          background-repeat: no-repeat;
        }

        .forest-content {
          position: relative;
          z-index: 1;
          width: min(1120px, calc(100% - 34px));
          margin: 0 auto;
        }

        /*
         * Keep the hero transparent so the real photograph is visible
         * directly behind the headline and introductory text.
         */
        .forest-content .hero {
          position: relative;
          isolation: isolate;
          min-height: 490px;
          padding: 105px 0 40px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
          backdrop-filter: none !important;
        }

        .forest-content .hero::before,
        .forest-content .hero::after {
          content: none !important;
          display: none !important;
          background: transparent !important;
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: 12px;
          color: #e4ca86;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.23em;
          text-shadow: 0 2px 12px #000;
        }

        .eyebrow > span {
          display: inline-block;
          width: 22px;
          height: 1px;
          background: #c4a65c;
        }

        .pretitle {
          margin: 30px 0 8px;
          color: #f1e4c3;
          font-size: 11px;
          letter-spacing: 0.3em;
          text-shadow: 0 2px 12px #000;
        }

        .hero h1 {
          margin: 0;
          color: #fff3d8;
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(46px, 8.5vw, 104px);
          font-weight: 400;
          letter-spacing: -0.045em;
          line-height: 0.98;
          text-shadow: 0 3px 18px #000, 0 8px 40px #000b;
        }

        .hero h1 em {
          color: #e6c779;
          font-style: normal;
          font-weight: 400;
        }

        .hero-copy {
          max-width: 520px;
          margin: 22px 0;
          color: #fff9ec;
          font-size: 14px;
          line-height: 1.8;
          text-shadow: 0 2px 10px #000, 0 2px 22px #000;
        }

        .mantra {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 18px;
          color: #f0d18b;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 11px;
          letter-spacing: 0.26em;
          text-shadow: 0 2px 10px #000;
        }

        .mantra i {
          width: 24px;
          height: 1px;
          background: #d2b46e;
        }

        .search-panel {
          padding: clamp(19px, 3vw, 34px);
          border: 1px solid #bfa05a88;
          border-radius: 5px;
          background: rgba(4, 12, 8, 0.91);
          box-shadow: 0 24px 80px #0008, inset 0 1px #ffffff08;
          backdrop-filter: blur(8px);
        }

        .panel-heading {
          margin-bottom: 18px;
          color: #e1c984;
          font-size: 10px;
          letter-spacing: 0.2em;
        }

        .panel-heading span {
          float: right;
          color: #d3b56b;
        }

        .search-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 12px;
        }

        .search-box {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          min-height: 54px;
          padding: 0 15px;
          border: 1px solid #c5ad7b99;
          border-radius: 5px;
          background: rgba(2, 8, 6, 0.94);
          color: #e3c980;
        }

        .search-box > span {
          font-size: 28px;
        }

        .search-box input {
          flex: 1;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: #fff5dd;
          font-size: 14px;
        }

        .search-box input::placeholder {
          color: #a0a79b;
        }

        .clear-search {
          border: 0;
          background: none;
          color: #c7b88f;
          font-size: 22px;
          cursor: pointer;
        }

        .location-button {
          min-height: 54px;
          padding: 0 18px;
          border: 1px solid #8d7744aa;
          border-radius: 5px;
          background: #0a1710;
          color: #e4ce93;
          font-size: 10px;
          letter-spacing: 0.1em;
          cursor: pointer;
        }

        .location-button span {
          margin-right: 8px;
          font-size: 19px;
        }

        .filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 11px;
          margin-top: 16px;
        }

        .select-filter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 9px;
          min-height: 42px;
          padding: 0 10px;
          border: 1px solid #c0a76355;
          border-radius: 4px;
          background: rgba(8, 17, 13, 0.96);
        }

        .filters label > span {
          color: #d9c58f;
          font-size: 9px;
          letter-spacing: 0.12em;
        }

        .filters select {
          max-width: 170px;
          padding: 6px;
          border: 0;
          outline: 0;
          background: #08110d;
          color: #f2e8d2;
          font-size: 12px;
        }

        .check-filter {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 42px;
          padding: 0 10px;
          border: 1px solid #c0a76355;
          border-radius: 4px;
          color: #d9c58f;
          font-size: 9px;
          letter-spacing: 0.12em;
        }

        .check-filter input {
          width: 15px;
          height: 15px;
          accent-color: #c8aa60;
        }

        .status-message {
          margin: 13px 0 0;
          color: #e6d19b;
          font-size: 12px;
          line-height: 1.6;
        }

        .results-section {
          padding: 55px 0 15px;
        }

        .results-heading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 24px;
        }

        .results-heading h2,
        .suggest-copy h2 {
          margin: 8px 0 0;
          color: #f0dfbd;
          font: 400 clamp(30px, 4.4vw, 48px)/1.1 Georgia,
            "Times New Roman", serif;
          text-shadow: 0 2px 12px #000;
        }

        .trust-line {
          color: #d4c08c;
          font-size: 9px;
          letter-spacing: 0.15em;
          white-space: nowrap;
          text-shadow: 0 2px 10px #000;
        }

        .trust-line i {
          display: inline-block;
          width: 4px;
          height: 4px;
          margin: 0 10px 2px;
          border-radius: 50%;
          background: #d2b36b;
        }

        .empty-state {
          padding: 40px 20px;
          border: 1px solid #bfa05a55;
          background: rgba(5, 13, 9, 0.94);
          color: #e0ddcf;
          line-height: 1.7;
          text-align: center;
        }

        .empty-state h3 {
          margin: 10px;
          color: #f0dfbd;
          font: 400 27px Georgia, serif;
        }

        .empty-state p {
          max-width: 520px;
          margin: 0 auto;
          font-size: 13px;
        }

        .empty-star {
          color: #d5b76e;
          font-size: 24px;
        }

        .retry-button {
          margin-top: 16px;
          padding: 12px 18px;
          border: 1px solid #d8bd76;
          background: #c9aa60;
          color: #11170f;
          cursor: pointer;
        }

        .turf-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
        }

        .turf-card {
          min-width: 0;
          border: 1px solid #b99b5c66;
          background: #06100c;
          transition: transform 0.25s, border-color 0.25s,
            box-shadow 0.25s;
        }

        .turf-card:hover {
          transform: translateY(-4px);
          border-color: #d9bb71;
          box-shadow: 0 16px 40px #0008;
        }

        .pitch-image {
          position: relative;
          height: 175px;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 50% 80%, #5b8749 0 17%, #23462c 18% 31%, transparent 32%),
            linear-gradient(180deg, #091b20, #142d2a 48%, #07110c);
        }

        .pitch-1 {
          background:
            radial-gradient(ellipse at 50% 85%, #71945a 0 20%, #2e5734 21% 37%, transparent 38%),
            linear-gradient(180deg, #15282e, #0b1916 75%);
        }

        .pitch-2 {
          background:
            radial-gradient(ellipse at 50% 80%, #63884c 0 18%, #27462b 19% 34%, transparent 35%),
            linear-gradient(180deg, #101e23, #1d3427 70%);
        }

        .pitch-image::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, transparent, #030806bb),
            repeating-linear-gradient(
              90deg,
              transparent 0 17%,
              #d7c99412 18% 18.4%
            );
        }

        .card-number {
          position: absolute;
          top: 12px;
          left: 12px;
          display: grid;
          width: 34px;
          height: 34px;
          place-items: center;
          border: 1px solid #d8bd76;
          border-radius: 50%;
          background: #07100be8;
          color: #f1dca3;
          font: 14px Georgia, serif;
        }

        .verified-mark {
          position: absolute;
          top: 18px;
          right: 12px;
          color: #f0d28a;
          font-size: 8px;
          letter-spacing: 0.13em;
        }

        .pitch-lines {
          position: absolute;
          top: 25%;
          right: 20%;
          bottom: 12%;
          left: 20%;
          border: 1px solid #d5e1b366;
          background: linear-gradient(
            90deg,
            transparent 49.7%,
            #d5e1b366 50%,
            transparent 50.3%
          );
          transform: perspective(150px) rotateX(8deg);
        }

        .pitch-lights {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at 15% 10%, #fff3c455, transparent 15%),
            radial-gradient(ellipse at 85% 10%, #fff3c455, transparent 15%);
        }

        .turf-card-body {
          padding: 17px;
        }

        .locality {
          margin: 0 0 9px;
          color: #d4b777;
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .turf-card-body h3 {
          margin: 0 0 5px;
          color: #f1e2c3;
          font: 400 22px/1.2 Georgia, serif;
        }

        .turf-subtitle {
          margin: 0;
          color: #b7c0b2;
          font-size: 12px;
        }

        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin: 15px 0;
        }

        .tags span {
          padding: 5px 7px;
          border: 1px solid #bba15d55;
          color: #d7d8ca;
          font-size: 9px;
        }

        .card-actions {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          padding-top: 13px;
          border-top: 1px solid #bba15d44;
        }

        .card-actions a {
          color: #dfc47d;
          font-size: 9px;
          letter-spacing: 0.07em;
          text-decoration: none;
        }

        .card-actions a:hover {
          color: #fff0c5;
        }

        .research-section {
          margin-top: 42px;
          padding-top: 26px;
          border-top: 1px solid #c5a65a55;
        }

        .research-section h3 {
          margin: 7px 0;
          color: #ead9b6;
          font: 400 28px Georgia, serif;
        }

        .research-section > p {
          color: #c1c8ba;
          font-size: 12px;
          line-height: 1.6;
        }

        .research-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
          margin-top: 18px;
        }

        .research-card {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          padding: 13px;
          border: 1px solid #bba15d44;
          background: rgba(5, 13, 9, 0.95);
        }

        .research-card > span {
          color: #d4b46b;
        }

        .research-card div {
          flex: 1;
          min-width: 0;
        }

        .research-card strong,
        .research-card small {
          display: block;
          overflow-wrap: anywhere;
        }

        .research-card strong {
          color: #f0e2c5;
          font: 16px Georgia, serif;
        }

        .research-card small {
          margin-top: 4px;
          color: #b9c1b3;
          font-size: 10px;
        }

        .research-card a {
          color: #d7bb74;
          font-size: 20px;
          text-decoration: none;
        }

        .suggest-section {
          display: grid;
          grid-template-columns: 0.8fr 1.2fr;
          gap: 30px;
          align-items: start;
          margin-top: 45px;
          padding: clamp(20px, 4vw, 36px);
          border: 1px solid #bfa05a66;
          background: rgba(5, 13, 9, 0.95);
          box-shadow: 0 20px 60px #0007;
        }

        .suggest-copy > p {
          max-width: 400px;
          color: #c2c9bc;
          font-size: 13px;
          line-height: 1.8;
        }

        .suggest-toggle {
          margin-top: 10px;
          padding: 13px 15px;
          border: 1px solid #e3c77c;
          background: #c9aa60;
          color: #12180f;
          font-size: 10px;
          letter-spacing: 0.1em;
          font-weight: 700;
          cursor: pointer;
        }

        .suggest-form {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 13px;
        }

        .suggest-form label {
          color: #d8c58f;
          font-size: 9px;
          letter-spacing: 0.13em;
        }

        .suggest-form input,
        .suggest-form textarea {
          display: block;
          box-sizing: border-box;
          width: 100%;
          margin-top: 7px;
          padding: 12px;
          border: 1px solid #bda15b66;
          border-radius: 3px;
          outline: 0;
          background: #030906;
          color: #f4ecd8;
          font: 13px Arial, sans-serif;
        }

        .suggest-form input:focus,
        .suggest-form textarea:focus {
          border-color: #d8bd76;
        }

        .suggest-form label:nth-child(n + 3),
        .suggest-form > button,
        .suggest-form > .status-message {
          grid-column: 1 / -1;
        }

        .suggest-form > button {
          padding: 14px;
          border: 0;
          background: linear-gradient(110deg, #e0c77f, #b18b42);
          color: #11170f;
          font-size: 10px;
          letter-spacing: 0.13em;
          font-weight: 800;
          cursor: pointer;
        }

        .suggest-form > button:disabled {
          opacity: 0.55;
          cursor: wait;
        }

        .forest-footer {
          padding: 48px 0 0;
          color: #c1c4b4;
          font-size: 9px;
          letter-spacing: 0.18em;
          text-align: center;
          text-shadow: 0 2px 10px #000;
        }

        .forest-footer span {
          margin: 0 10px;
          color: #d7b76d;
        }

        @media (max-width: 760px) {
          .forest-content .hero {
            min-height: 440px;
            padding-top: 90px;
          }

          .search-row {
            grid-template-columns: 1fr;
          }

          .location-button {
            width: 100%;
          }

          .turf-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .pitch-image {
            height: 145px;
          }

          .results-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .trust-line {
            white-space: normal;
          }

          .suggest-section {
            grid-template-columns: 1fr;
          }

          .suggest-form {
            grid-template-columns: 1fr;
          }

          .suggest-form label {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 480px) {
          .forest-content {
            width: calc(100% - 24px);
          }

          .forest-content .hero {
            min-height: 400px;
            padding-top: 78px;
          }

          .hero h1 {
            font-size: clamp(42px, 12vw, 64px);
          }

          .hero-copy {
            font-size: 13px;
          }

          .mantra {
            gap: 10px;
            font-size: 9px;
          }

          .mantra i {
            width: 12px;
          }

          .search-panel {
            padding: 17px 13px;
          }

          .filters {
            gap: 7px;
          }

          .select-filter {
            width: 100%;
          }

          .filters select {
            max-width: 60%;
          }

          .check-filter {
            flex: 1;
            justify-content: center;
            padding: 0 6px;
          }

          .turf-grid {
            grid-template-columns: 1fr;
          }

          .pitch-image {
            height: 190px;
          }

          .research-grid {
            grid-template-columns: 1fr;
          }

          .card-actions a {
            font-size: 8px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .turf-card {
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}
