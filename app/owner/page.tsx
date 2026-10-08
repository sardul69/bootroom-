"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

type Turf = {
  id: string;
  name: string;
  venues: {
  name: string;
  locality: string;
}[] | null;
};

export default function Owner() {
  const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
  const router = useRouter();

  const [turfs, setTurfs] = useState<Turf[]>([]);
  const [turfId, setTurfId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [capacity, setCapacity] = useState("10");
  const [playerFee, setPlayerFee] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("turfs")
        .select("id, name, venues(name, locality)")
        .order("name");

      if (data) {
        setTurfs(data as Turf[]);
      }
    }

    load();
  }, []);

  async function createGame() {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      if (!turfId || !start || !end || !capacity || !playerFee) {
        setMessage("Please fill every field.");
        return;
      }

      const { data, error } = await supabase.rpc("create_game", {
        p_turf_id: turfId,
        p_host_user_id: user.id,
        p_start: new Date(start).toISOString(),
        p_end: new Date(end).toISOString(),
        p_player_capacity: Number(capacity),
        p_player_fee: Number(playerFee),
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      const gameId =
        typeof data === "string"
          ? data
          : Array.isArray(data)
            ? data[0]?.id
            : data?.id;

      if (!gameId) {
        setMessage("Game created, but no game ID was returned.");
        return;
      }

      router.push(`/matches/${gameId}`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create game."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="wrap">
        <div className="label">HOST</div>

        <h1>Create a Game</h1>

        <p className="muted">
          Create a game at a turf. Players will see the game and join by
          paying only their individual player fee.
        </p>

        <div className="panel">
          <div className="label">SELECT TURF</div>

          <select
            value={turfId}
            onChange={(e) => setTurfId(e.target.value)}
          >
            <option value="">Choose a turf</option>

            {turfs.map((turf) => (
              <option key={turf.id} value={turf.id}>
                {turf.name}
                {turf.venues?.[0]?.locality
                  ? ` — ${turf.venues?.[0]?.locality}`
                  : ""}
              </option>
            ))}
          </select>

          <div className="label" style={{ marginTop: 18 }}>
            START
          </div>

          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />

          <div className="label" style={{ marginTop: 18 }}>
            END
          </div>

          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />

          <div className="label" style={{ marginTop: 18 }}>
            PLAYER CAPACITY
          </div>

          <input
            type="number"
            min="2"
            max="30"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />

          <div className="label" style={{ marginTop: 18 }}>
            PLAYER FEE
          </div>

          <input
            type="number"
            min="1"
            value={playerFee}
            onChange={(e) => setPlayerFee(e.target.value)}
            placeholder="Example: 170"
          />

          <p className="muted">
            Players will see only this individual fee. The turf rental total
            will not be shown to players.
          </p>

          {message && (
            <div className="empty" style={{ marginTop: 18 }}>
              {message}
            </div>
          )}

          <button
            className="btn green"
            type="button"
            onClick={createGame}
            disabled={loading}
            style={{ marginTop: 18 }}
          >
            {loading ? "CREATING GAME..." : "CREATE GAME"}
          </button>
        </div>
      </div>
    </main>
  );
}