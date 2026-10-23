"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Row = Record<string, any>;

type DashboardData = {
  games: Row[];
  players: Row[];
  suggestions: Row[];
  finance: Row;
};

const initialData: DashboardData = {
  games: [],
  players: [],
  suggestions: [],
  finance: {},
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #2b4438",
  borderRadius: 10,
  background: "#080f0c",
  color: "#f3f6f2",
  padding: "11px 12px",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid #476a54",
  borderRadius: 10,
  padding: "9px 12px",
  background: "#10251a",
  color: "#c5ffd4",
  cursor: "pointer",
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  background: "linear-gradient(145deg,#0d1712,#080d0b)",
  border: "1px solid #263b30",
  borderRadius: 16,
  padding: 16,
  minWidth: 0,
};

const mutedStyle: React.CSSProperties = {
  color: "#9db0a4",
  fontSize: 13,
};

export default function OwnerOperations() {
  const [data, setData] =
    useState<DashboardData>(initialData);

  const [tab, setTab] = useState("games");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/owner/access/operations", {
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || "Could not load operations."
        );
      }

      setData({ ...initialData, ...json });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not load operations."
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    payload: Row,
    confirmation?: string
  ) {
    if (
      confirmation &&
      !window.confirm(confirmation)
    ) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/owner/access/operations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify(payload),
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Action failed.");
      }

      setMessage(json.message || "Saved.");
      setEditing(null);

      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Action failed."
      );
    } finally {
      setBusy(false);
    }
  }

  const filteredGames = useMemo(
    () =>
      data.games.filter((game) =>
        `${game.turfs?.name ?? ""} ${game.status} ${game.id}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [data.games, search]
  );

  const filteredPlayers = useMemo(
    () =>
      data.players.filter((player) =>
        `${player.full_name ?? ""} ${player.phone ?? ""} ${player.locality ?? ""} ${player.position ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [data.players, search]
  );

  const filteredSuggestions = useMemo(
    () =>
      data.suggestions.filter((suggestion) =>
        `${suggestion.venue_name ?? ""} ${suggestion.locality ?? ""} ${suggestion.status ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [data.suggestions, search]
  );

  const tabs: [string, string, number | null][] = [
    ["games", "GAMES", data.games.length],
    ["players", "PLAYERS", data.players.length],
    [
      "turfs",
      "TURF INBOX",
      data.suggestions.filter(
        (item) => item.status === "NEW"
      ).length,
    ],
    ["finance", "FINANCE", null],
  ];

  const statFields = [
    "overall_rating",
    "pace",
    "shooting",
    "passing",
    "dribbling",
    "defending",
    "physical",
    "attack",
    "composure",
    "appearances",
    "goals",
    "assists",
  ];

  return (
    <section
      style={{
        marginTop: 26,
        color: "#f3f6f2",
        display: "grid",
        gap: 16,
      }}
    >
      <div
        style={{
          ...cardStyle,
          borderColor: "#506d4f",
          background:
            "radial-gradient(ellipse at top right,#183323 0%,#0a110d 62%)",
        }}
      >
        <div
          style={{
            ...mutedStyle,
            letterSpacing: 2,
            fontWeight: 800,
          }}
        >
          BOOTROOM • OPERATIONS
        </div>

        <h2 style={{ fontSize: 25, margin: "8px 0" }}>
          Command Centre
        </h2>

        <p style={{ ...mutedStyle, margin: 0 }}>
          Games, player cards, turf suggestions and
          recorded payment totals.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            onClick={() => {
              setTab(id);
              setSearch("");
            }}
            style={{
              ...buttonStyle,
              background:
                tab === id ? "#21452e" : "#0b1510",
              borderColor:
                tab === id ? "#8acb91" : "#2b4438",
            }}
          >
            {label}
            {count !== null ? ` · ${count}` : ""}
          </button>
        ))}

        <button
          style={{
            ...buttonStyle,
            marginLeft: "auto",
          }}
          onClick={() => void load()}
          disabled={busy}
        >
          {busy ? "LOADING…" : "↻ REFRESH"}
        </button>
      </div>

      {message && (
        <div
          role="status"
          style={{
            ...cardStyle,
            borderColor: "#806b38",
            color: "#f4dfa0",
          }}
        >
          {message}
        </div>
      )}

      {tab !== "finance" && (
        <input
          aria-label="Search records"
          value={search}
          onChange={(event) =>
            setSearch(event.target.value)
          }
          placeholder="Search records…"
          style={inputStyle}
        />
      )}

      {tab === "games" && (
        <div style={{ display: "grid", gap: 10 }}>
          {filteredGames.map((game) => (
            <article
              key={game.id}
              style={cardStyle}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <strong>
                    {game.turfs?.name ||
                      "Turf not available"}
                  </strong>

                  <div style={mutedStyle}>
                    {new Date(
                      game.slot_start
                    ).toLocaleString()}
                    {" – "}
                    {new Date(
                      game.slot_end
                    ).toLocaleTimeString()}
                  </div>

                  <div style={mutedStyle}>
                    ₹
                    {Number(
                      game.player_fee
                    ).toFixed(0)}{" "}
                    per player · capacity{" "}
                    {game.player_capacity}
                  </div>

                  <div
                    style={{
                      ...mutedStyle,
                      marginTop: 5,
                    }}
                  >
                    Status: <strong>{game.status}</strong>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "start",
                    flexWrap: "wrap",
                  }}
                >
                  {game.status !== "CANCELLED" &&
                    game.status !== "COMPLETED" && (
                      <button
                        style={buttonStyle}
                        disabled={busy}
                        onClick={() =>
                          void act(
                            {
                              action: "cancel-game",
                              id: game.id,
                            },
                            "Cancel this game? Payment records will be preserved. This action does not issue refunds."
                          )
                        }
                      >
                        CANCEL GAME
                      </button>
                    )}

                  <button
                    style={{
                      ...buttonStyle,
                      borderColor: "#7b4c4c",
                      color: "#ffc5c5",
                    }}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        {
                          action: "delete-game",
                          id: game.id,
                        },
                        "Attempt to delete this game? Deletion is permitted only if no linked booking, player, payment, reconciliation or reward records exist."
                      )
                    }
                  >
                    DELETE
                  </button>
                </div>
              </div>
            </article>
          ))}

          {!filteredGames.length && (
            <p style={mutedStyle}>
              No games match this search.
            </p>
          )}
        </div>
      )}

      {tab === "players" && (
        <div style={{ display: "grid", gap: 10 }}>
          {filteredPlayers.map((player) => {
            const playerCard = Array.isArray(
              player.player_cards
            )
              ? player.player_cards[0]
              : player.player_cards;

            return (
              <article
                key={player.id}
                style={cardStyle}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>
                      {player.full_name ||
                        "Unnamed player"}
                    </strong>

                    <div style={mutedStyle}>
                      {[
                        player.position,
                        player.locality,
                        player.phone,
                      ]
                        .filter(Boolean)
                        .join(" · ") ||
                        "No extra profile details"}
                    </div>

                    <div
                      style={{
                        ...mutedStyle,
                        marginTop: 5,
                      }}
                    >
                      OVR{" "}
                      {playerCard?.overall_rating ?? 50}
                      {" · "}Apps{" "}
                      {playerCard?.appearances ?? 0}
                      {" · "}Goals{" "}
                      {playerCard?.goals ?? 0}
                      {" · "}Assists{" "}
                      {playerCard?.assists ?? 0}
                    </div>
                  </div>

                  <button
                    style={buttonStyle}
                    onClick={() =>
                      setEditing({
                        profileId: player.id,
                        name:
                          player.full_name || "Player",
                        ...(playerCard || {}),
                      })
                    }
                  >
                    EDIT PLAYER CARD
                  </button>
                </div>
              </article>
            );
          })}

          {!filteredPlayers.length && (
            <p style={mutedStyle}>
              No players match this search.
            </p>
          )}
        </div>
      )}

      {tab === "turfs" && (
        <div style={{ display: "grid", gap: 10 }}>
          <p style={mutedStyle}>
            Approval records a review decision only.
            It does not publish a verified bookable
            turf listing.
          </p>

          {filteredSuggestions.map((item) => (
            <article
              key={item.id}
              style={cardStyle}
            >
              <strong>{item.venue_name}</strong>

              <div style={mutedStyle}>
                {item.locality} · {item.status}
                {" · "}
                {item.created_at
                  ? new Date(
                      item.created_at
                    ).toLocaleString()
                  : ""}
              </div>

              {item.address && (
                <p
                  style={{
                    ...mutedStyle,
                    margin: "8px 0",
                  }}
                >
                  {item.address}
                </p>
              )}

              {item.details && (
                <p
                  style={{
                    ...mutedStyle,
                    margin: "8px 0",
                  }}
                >
                  {item.details}
                </p>
              )}

              {item.maps_url && (
                <p>
                  <a
                    style={{ color: "#a7e5b2" }}
                    href={item.maps_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open map reference ↗
                  </a>
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  style={buttonStyle}
                  disabled={busy}
                  onClick={() =>
                    void act(
                      {
                        action: "review-suggestion",
                        id: item.id,
                        status: "APPROVED",
                      },
                      "Mark approved for review? This does not publish a bookable listing."
                    )
                  }
                >
                  APPROVE
                </button>

                <button
                  style={{
                    ...buttonStyle,
                    color: "#ffc5c5",
                    borderColor: "#7b4c4c",
                  }}
                  disabled={busy}
                  onClick={() =>
                    void act(
                      {
                        action: "review-suggestion",
                        id: item.id,
                        status: "REJECTED",
                      },
                      "Reject this turf suggestion?"
                    )
                  }
                >
                  REJECT
                </button>

                {item.status !== "NEW" && (
                  <button
                    style={buttonStyle}
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "review-suggestion",
                        id: item.id,
                        status: "NEW",
                      })
                    }
                  >
                    REOPEN
                  </button>
                )}
              </div>
            </article>
          ))}

          {!filteredSuggestions.length && (
            <p style={mutedStyle}>
              No suggestions match this search.
            </p>
          )}
        </div>
      )}

      {tab === "finance" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={cardStyle}>
            <div style={mutedStyle}>
              CAPTURED BATCH PAYMENT RECORDS
            </div>

            <strong style={{ fontSize: 27 }}>
              {data.finance.capturedBatchRecords ?? "—"}
            </strong>

            <div style={mutedStyle}>
              Total recorded: ₹
              {Number(
                data.finance.capturedBatchAmount || 0
              ).toLocaleString("en-IN")}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={mutedStyle}>
              CAPTURED SINGLE PAYMENT RECORDS
            </div>

            <strong style={{ fontSize: 27 }}>
              {data.finance.capturedSinglePaymentRecords ??
                "—"}
            </strong>

            <div style={mutedStyle}>
              Total recorded: ₹
              {Number(
                data.finance.capturedSinglePaymentAmount ||
                  0
              ).toLocaleString("en-IN")}
            </div>
          </div>

          <p style={mutedStyle}>
            {data.finance.note ||
              "Captured records only; not net revenue or profit."}
          </p>
        </div>
      )}

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit player card"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "#000b",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();

              const form = new FormData(
                event.currentTarget
              );

              const payload: Row = {
                action: "update-player-card",
                profileId: editing.profileId,
              };

              statFields.forEach((field) => {
                payload[field] = Number(
                  form.get(field)
                );
              });

              payload.is_verified =
                form.get("is_verified") === "on";

              void act(payload);
            }}
            style={{
              ...cardStyle,
              width: "min(680px,100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "#0b130e",
            }}
          >
            <h3 style={{ marginTop: 0 }}>
              Edit · {editing.name}
            </h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit,minmax(130px,1fr))",
                gap: 10,
              }}
            >
              {statFields.map((field) => {
                const isStat = [
                  "appearances",
                  "goals",
                  "assists",
                ].includes(field);

                return (
                  <label
                    key={field}
                    style={{
                      ...mutedStyle,
                      textTransform: "capitalize",
                    }}
                  >
                    {field.replaceAll("_", " ")}

                    <input
                      name={field}
                      type="number"
                      min="0"
                      max={isStat ? 1000000 : 99}
                      defaultValue={
                        editing[field] ??
                        (isStat ? 0 : 50)
                      }
                      required
                      style={{
                        ...inputStyle,
                        marginTop: 5,
                      }}
                    />
                  </label>
                );
              })}
            </div>

            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                margin: "14px 0",
              }}
            >
              <input
                name="is_verified"
                type="checkbox"
                defaultChecked={Boolean(
                  editing.is_verified
                )}
              />
              Mark player card verified
            </label>

            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "end",
              }}
            >
              <button
                type="button"
                style={buttonStyle}
                onClick={() => setEditing(null)}
              >
                CLOSE
              </button>

              <button
                type="submit"
                style={buttonStyle}
                disabled={busy}
              >
                {busy ? "SAVING…" : "SAVE PLAYER CARD"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}