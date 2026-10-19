
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please sign in to view your wallet." },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const [walletResult, transactionsResult, couponsResult, ownedResult] =
      await Promise.all([
        supabase
          .from("reward_wallets")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle(),

        supabase
          .from("reward_transactions")
          .select(
            "id, amount, balance_after, transaction_type, description, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(25),

        supabase
          .from("reward_coupons")
          .select(
            "id, code, title, description, coin_cost, discount_paise, is_free_game"
          )
          .eq("active", true)
          .order("sort_order", { ascending: true }),

        supabase
          .from("player_coupons")
          .select(
            "id, status, created_at, reward_coupons(id, code, title, description, coin_cost, discount_paise, is_free_game)"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    if (
      walletResult.error ||
      transactionsResult.error ||
      couponsResult.error ||
      ownedResult.error
    ) {
      // Keep detailed database errors in server logs, not in the response.
      console.error("Rewards wallet query failed", {
        wallet: walletResult.error?.message,
        transactions: transactionsResult.error?.message,
        coupons: couponsResult.error?.message,
        ownedCoupons: ownedResult.error?.message,
      });

      return NextResponse.json(
        { error: "Your rewards wallet is temporarily unavailable." },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        balance: walletResult.data?.balance ?? 0,
        transactions: transactionsResult.data ?? [],
        coupons: couponsResult.data ?? [],
        ownedCoupons: ownedResult.data ?? [],
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (error) {
    console.error("Rewards wallet API failed", error);

    return NextResponse.json(
      { error: "Your rewards wallet is temporarily unavailable." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
