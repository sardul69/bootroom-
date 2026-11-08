import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return false;

  try {
    const parsed = new URL(origin);
    return (
      ["https:", "http:"].includes(parsed.protocol) &&
      parsed.host === host
    );
  } catch {
    return false;
  }
}

function validUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function parseIstDate(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  ) {
    return null;
  }

  const parsed = new Date(`${value}:00+05:30`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 16) !==
      new Date(`${value}:00+05:30`).toISOString().slice(0, 16)
  ) {
    return null;
  }

  return parsed.toISOString();
}

export async function GET() {
  try {
    const auth = await authorizeAdmin("games.create");

    if (!auth.ok) {
      return json({ error: auth.error }, auth.status);
    }

    const [{ data: turfs, error: turfError }, { data: userData, error: userError }] =
      await Promise.all([
        auth.admin
          .from("turfs")
          .select(`
            id,
            name,
            format,
            surface,
            starting_price,
            venue:venues (
              name,
              locality,
              address
            )
          `)
          .eq("active", true)
          .order("name"),
        auth.admin.auth.admin.getUserById(auth.userId),
      ]);

    if (turfError || userError) {
      console.error("Admin dashboard data error:", turfError || userError);
      return json({ error: "Unable to load dashboard data." }, 500);
    }

    return json({
      ok: true,
      email: userData.user.email ?? "",
      turfs: turfs ?? [],
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return json({ error: "Unable to load dashboard." }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return json({ error: "Request rejected." }, 403);
    }

    const auth = await authorizeAdmin("games.create");

    if (!auth.ok) {
      return json({ error: auth.error }, auth.status);
    }

    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ error: "Unsupported request format." }, 415);
    }

    const length = Number(request.headers.get("content-length") ?? "0");

    if (Number.isFinite(length) && length > 4096) {
      return json({ error: "Request too large." }, 413);
    }

    const body = await request.json().catch(() => null);

    if (!body || !validUuid(body.turfId)) {
      return json({ error: "Select a valid turf." }, 400);
    }

    const start = parseIstDate(body.start);
    const end = parseIstDate(body.end);

    const capacity = Number(body.capacity);
    const fee = Number(body.playerFee);
    const bookingAmount = Number(body.bookingAmount);

    if (
      !start ||
      !end ||
      new Date(end).getTime() <= new Date(start).getTime()
    ) {
      return json({ error: "Enter valid game dates and times." }, 400);
    }

    if (
      !Number.isInteger(capacity) ||
      capacity < 2 ||
      capacity > 30
    ) {
      return json({ error: "Capacity must be between 2 and 30." }, 400);
    }

    if (
      !Number.isFinite(fee) ||
      fee <= 0 ||
      fee > 100000 ||
      !Number.isFinite(bookingAmount) ||
      bookingAmount <= 0 ||
      bookingAmount > fee
    ) {
      return json({
        error: "Enter valid player fee and booking amount.",
      }, 400);
    }

    // Verify the selected turf is still active.
    const { data: turf, error: turfError } = await auth.admin
      .from("turfs")
      .select("id")
      .eq("id", body.turfId)
      .eq("active", true)
      .maybeSingle();

    if (turfError || !turf) {
      return json({ error: "Selected turf is unavailable." }, 400);
    }

    const { data: game, error } = await auth.admin.rpc(
      "create_game_as_admin",
      {
        p_turf_id: body.turfId,
        p_host_user_id: auth.userId,
        p_start: start,
        p_end: end,
        p_player_capacity: capacity,
        p_player_fee: fee,
        p_booking_amount: bookingAmount,
      },
    );

    if (error) {
      console.error("Admin game creation failed:", error.message);
      return json({
        error: error.message || "Unable to create game.",
      }, 400);
    }

    return json({ ok: true, game });
  } catch (error) {
    console.error("Admin game API failed:", error);
    return json({ error: "Unable to process request." }, 500);
  }
}
