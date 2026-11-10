import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("shop_products")
      .select(
        "id,name,description,category,price_paise,image_url,sizes,stock_quantity"
      )
      .eq("active", true)
      .gt("stock_quantity", 0)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Shop products query failed:", error.message);
      return NextResponse.json(
        { error: "Unable to load products." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { products: data ?? [] },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    console.error("Shop products API failed:", error);
    return NextResponse.json(
      { error: "Unable to load products." },
      { status: 500 }
    );
  }
}
