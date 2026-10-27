
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidOwnerSession,
  OWNER_SESSION_COOKIE,
} from "@/lib/owner-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function authorize(request: NextRequest) {
  if (request.method !== "GET" && !sameOrigin(request)) {
    return { error: json({ error: "Request rejected." }, 403) };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: json({ error: "Please sign in again." }, 401) };
  }

  const { data: isOwner, error: ownerError } =
    await supabase.rpc("current_user_is_owner");

  if (ownerError || isOwner !== true) {
    return {
      error: json({ error: "Owner privileges required." }, 403),
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;

  if (!isValidOwnerSession(token, user.id)) {
    return {
      error: json(
        { error: "Owner Console is locked. Unlock it and retry." },
        401
      ),
    };
  }

  return { user };
}

/**
 * Fetch every player profile in pages rather than silently stopping at 300.
 * A stable secondary order prevents records with matching names from being
 * skipped between pages.
 */
async function fetchAllPlayers(admin: ReturnType<typeof createAdminClient>) {
  const pageSize = 1000;
  const allPlayers: Record<string, unknown>[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("profiles")
      .select(
        "id,full_name,phone,locality,position,skill,preferred_foot,player_cards(overall_rating,pace,shooting,passing,dribbling,defending,physical,attack,composure,appearances,goals,assists,average_rating,is_verified)"
      )
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      return { data: null, error };
    }

    const page = data ?? [];
    allPlayers.push(...page);

    if (page.length < pageSize) {
      break;
    }
  }

  return { data: allPlayers, error: null };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const admin = createAdminClient();

    const [games, players, suggestions, batches, payments] =
      await Promise.all([
        admin
          .from("games")
          .select(
            "id,turf_id,booking_id,slot_start,slot_end,player_capacity,player_fee,status,created_at,turfs(name)"
          )
          .order("slot_start", { ascending: false })
          .limit(100),

        fetchAllPlayers(admin),

        admin
          .from("turf_suggestions")
          .select(
            "id,venue_name,locality,address,maps_url,details,submitted_by,status,created_at"
          )
          .order("created_at", { ascending: false })
          .limit(100),

        admin
          .from("game_payment_batches")
          .select("id,amount,status,provider_payment_id,created_at,game_id")
          .eq("status", "CAPTURED")
          .limit(1000),

        admin
          .from("game_payments")
          .select(
            "id,amount,status,provider_payment_id,created_at,game_player_id"
          )
          .eq("status", "CAPTURED")
          .limit(1000),
      ]);

    if (games.error || players.error || suggestions.error) {
      console.error("Owner dashboard read failed", {
        games: games.error?.message,
        players: players.error?.message,
        suggestions: suggestions.error?.message,
      });

      return json(
        {
          error:
            "Unable to load dashboard records. Check server logs.",
        },
        500
      );
    }

    if (batches.error || payments.error) {
      console.error("Owner finance read failed", {
        batches: batches.error?.message,
        payments: payments.error?.message,
      });

      return json(
        {
          error:
            "Unable to verify payment totals. No finance figures displayed.",
        },
        500
      );
    }

    return json({
      games: games.data ?? [],
      players: players.data ?? [],
      suggestions: suggestions.data ?? [],
      finance: {
        capturedBatchRecords: batches.data?.length ?? 0,
        capturedSinglePaymentRecords: payments.data?.length ?? 0,
        capturedBatchAmount: (batches.data ?? []).reduce(
          (sum, row) => sum + Number(row.amount || 0),
          0
        ),
        capturedSinglePaymentAmount: (payments.data ?? []).reduce(
          (sum, row) => sum + Number(row.amount || 0),
          0
        ),
        note:
          "Gross captured records only. These figures are not net revenue, profit, or proof of payout. Batch and single-payment totals are separate.",
      },
    });
  } catch (error) {
    console.error("Owner dashboard GET failed", error);
    return json(
      { error: "Unable to load Owner Console operations." },
      500
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    if (
      !(request.headers.get("content-type") ?? "")
        .toLowerCase()
        .includes("application/json")
    ) {
      return json({ error: "JSON request required." }, 415);
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Invalid request." }, 400);
    }

    const admin = createAdminClient();

    // Create a reusable turf from a manually entered name.
    if (body.action === "create-turf") {
      const name =
        typeof body.name === "string" ? body.name.trim() : "";

      if (name.length < 2 || name.length > 120) {
        return json(
          { error: "Enter a turf name between 2 and 120 characters." },
          400
        );
      }

      // Reuse a matching name instead of creating duplicate listings.
      const { data: matchingTurfs, error: lookupError } = await admin
        .from("turfs")
        .select("id,name")
        .ilike("name", name)
        .limit(100);

      if (lookupError) {
        console.error("Turf lookup failed:", lookupError.message);
        return json(
          { error: "Could not check existing turfs." },
          500
        );
      }

      const existing = (matchingTurfs ?? []).find(
        (turf) =>
          turf.name.trim().toLowerCase() === name.toLowerCase()
      );

      if (existing) {
        return json({ id: existing.id, name: existing.name });
      }

      // A manually entered name does not verify the real-world location.
      const { data: venue, error: venueError } = await admin
        .from("venues")
        .insert({
          owner_id: auth.user.id,
          name,
          locality: "Kolkata",
          address: name,
          verified: false,
          active: true,
        })
        .select("id")
        .single();

      if (venueError || !venue) {
        console.error(
          "Venue creation failed:",
          venueError?.message
        );
        return json(
          { error: "Could not create the venue record." },
          500
        );
      }

      const { data: turf, error: turfError } = await admin
        .from("turfs")
        .insert({
          venue_id: venue.id,
          name,
          format: "5-a-side",
          surface: "artificial",
          active: true,
        })
        .select("id,name")
        .single();

      if (turfError || !turf) {
        console.error(
          "Turf creation failed:",
          turfError?.message
        );

        // Clean up the venue created by this request.
        const { error: cleanupError } = await admin
          .from("venues")
          .delete()
          .eq("id", venue.id);

        if (cleanupError) {
          console.error(
            "Venue cleanup failed:",
            cleanupError.message
          );
        }

        return json(
          { error: "Could not save the new turf." },
          500
        );
      }

      // OwnerConsole.tsx expects id and name at the top level.
      return json({ id: turf.id, name: turf.name });
    }

    // Cancel without deleting payment or booking history.
    if (body.action === "cancel-game") {
      const id = typeof body.id === "string" ? body.id : "";

      if (!id) return json({ error: "Game ID required." }, 400);

      const { data: game, error: readError } = await admin
        .from("games")
        .select("id,status")
        .eq("id", id)
        .maybeSingle();

      if (readError || !game) {
        return json({ error: "Game not found." }, 404);
      }

      if (game.status === "CANCELLED") {
        return json({
          ok: true,
          message: "Game is already cancelled.",
        });
      }

      if (game.status === "COMPLETED") {
        return json(
          { error: "Completed games cannot be cancelled here." },
          409
        );
      }

      const { error } = await admin
        .from("games")
        .update({
          status: "CANCELLED",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) {
        console.error("Game cancellation failed", error.message);
        return json(
          { error: "Could not cancel this game." },
          500
        );
      }

      return json({
        ok: true,
        message:
          "Game cancelled. Payment records were preserved. This action does not issue refunds.",
      });
    }

    // Delete only an empty, unlinked game.
    if (body.action === "delete-game") {
      const id = typeof body.id === "string" ? body.id : "";

      if (!id) return json({ error: "Game ID required." }, 400);

      const { data: game, error: gameError } = await admin
        .from("games")
        .select("id,booking_id")
        .eq("id", id)
        .maybeSingle();

      if (gameError || !game) {
        return json({ error: "Game not found." }, 404);
      }

      if (game.booking_id) {
        return json(
          {
            error:
              "Deletion blocked: this game has a linked venue booking. Cancel it instead.",
          },
          409
        );
      }

      const { data: linkedPlayers, error: playersError } =
        await admin
          .from("game_players")
          .select("id")
          .eq("game_id", id);

      if (playersError) {
        return json(
          {
            error:
              "Could not verify player records. Deletion blocked.",
          },
          500
        );
      }

      const playerIds = (linkedPlayers ?? []).map(
        (row) => row.id
      );

      const checks = await Promise.all([
        admin
          .from("game_players")
          .select("id", { count: "exact", head: true })
          .eq("game_id", id),

        playerIds.length
          ? admin
              .from("game_payments")
              .select("id", { count: "exact", head: true })
              .in("game_player_id", playerIds)
          : Promise.resolve({ count: 0, error: null }),

        admin
          .from("game_payment_batches")
          .select("id", { count: "exact", head: true })
          .eq("game_id", id),

        admin
          .from("game_slot_bookings")
          .select("id", { count: "exact", head: true })
          .eq("game_id", id),

        admin
          .from("payment_reconciliation")
          .select("id", { count: "exact", head: true })
          .eq("game_id", id),

        admin
          .from("game_reward_awards")
          .select("game_id", { count: "exact", head: true })
          .eq("game_id", id),
      ]);

      if (checks.some((check) => check.error)) {
        return json(
          {
            error:
              "Could not verify all linked records. Deletion blocked.",
          },
          500
        );
      }

      if (checks.some((check) => (check.count ?? 0) > 0)) {
        return json(
          {
            error:
              "Deletion blocked: this game has linked player, payment, booking, reconciliation, or reward records. Cancel it instead.",
          },
          409
        );
      }

      const { error } = await admin
        .from("games")
        .delete()
        .eq("id", id)
        .is("booking_id", null);

      if (error) {
        console.error("Game deletion failed", error.message);
        return json(
          {
            error:
              "Database rejected deletion. The game was not removed.",
          },
          409
        );
      }

      return json({
        ok: true,
        message: "Empty, unlinked game deleted.",
      });
    }

    // Review turf suggestions; approval does not publish a bookable turf.
    if (body.action === "review-suggestion") {
      const id = typeof body.id === "string" ? body.id : "";
      const status = body.status;

      if (
        !id ||
        typeof status !== "string" ||
        !["APPROVED", "REJECTED", "NEW"].includes(status)
      ) {
        return json(
          { error: "Valid suggestion ID and status required." },
          400
        );
      }

      const { error } = await admin
        .from("turf_suggestions")
        .update({ status })
        .eq("id", id);

      if (error) {
        console.error("Suggestion review failed", error.message);
        return json(
          { error: "Could not update this suggestion." },
          500
        );
      }

      return json({
        ok: true,
        message: `Suggestion marked ${status}. This does not create or verify a bookable turf listing.`,
      });
    }

    // Edit player ratings and stats.
    if (body.action === "update-player-card") {
      const profileId =
        typeof body.profileId === "string" ? body.profileId : "";

      if (!profileId) {
        return json(
          { error: "Player profile ID required." },
          400
        );
      }

      const fields = [
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

      const update: Record<string, number> = {};

      for (const field of fields) {
        if (body[field] === undefined) continue;

        const value = Number(body[field]);
        const max = [
          "appearances",
          "goals",
          "assists",
        ].includes(field)
          ? 1000000
          : 99;

        if (
          !Number.isInteger(value) ||
          value < 0 ||
          value > max
        ) {
          return json(
            { error: `Invalid value for ${field}.` },
            400
          );
        }

        update[field] = value;
      }

      if (!Object.keys(update).length) {
        return json(
          { error: "No player-card fields supplied." },
          400
        );
      }

      const { error } = await admin
        .from("player_cards")
        .upsert(
          {
            profile_id: profileId,
            ...update,
            is_verified: body.is_verified === true,
            updated_by: auth.user.id,
          },
          { onConflict: "profile_id" }
        );

      if (error) {
        console.error(
          "Player card update failed",
          error.message
        );
        return json(
          { error: "Could not update the player card." },
          500
        );
      }

      return json({
        ok: true,
        message: "Player card saved.",
      });
    }

    return json({ error: "Unknown operation." }, 400);
  } catch (error) {
    console.error("Owner operations POST failed", error);
    return json(
      { error: "Unable to complete Owner Console action." },
      500
    );
  }
}
