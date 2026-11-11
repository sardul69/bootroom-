
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("shop_products")
      .select(`
        id,
        name,
        description,
        category,
        price_paise,
        image_url,
        sizes,
        stock_quantity,
        brand_name,
        collection_title,
        collection_year,
        sku,
        product_type,
        regular_price_paise,
        sale_price_paise,
        sale_start_at,
        sale_end_at,
        gallery_urls,
        player_image_url,
        hero_layout,
        hero_image_position,
        player_image_position,
        player_image_opacity,
        allow_preorder,
        featured,
        product_tags,
        attributes,
        dimensions,
        weight_kg,
        seo_title,
        seo_description,
        publication_status,
        sort_order,
        shop_product_variants (
          id,
          size,
          sku,
          stock_quantity,
          price_paise,
          active,
          sort_order
        )
      `)
      .eq("active", true)
      .eq("publication_status", "PUBLISHED")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Shop products query failed:", error.message);

      return NextResponse.json(
        { error: "Unable to load products." },
        { status: 500, headers: responseHeaders }
      );
    }

    const now = Date.now();

    const products = (data ?? []).map((product) => {
      const saleStart = product.sale_start_at
        ? new Date(product.sale_start_at).getTime()
        : null;

      const saleEnd = product.sale_end_at
        ? new Date(product.sale_end_at).getTime()
        : null;

      const saleIsActive =
        product.sale_price_paise !== null &&
        (saleStart === null || now >= saleStart) &&
        (saleEnd === null || now < saleEnd);

      const variants = (product.shop_product_variants ?? [])
        .filter((variant) => variant.active)
        .sort((a, b) => a.sort_order - b.sort_order);

      const totalVariantStock = variants.reduce(
        (total, variant) => total + variant.stock_quantity,
        0
      );

      const hasActiveVariants =
        product.product_type === "VARIABLE" && variants.length > 0;

      return {
        ...product,
        variants,
        effective_price_paise: saleIsActive
          ? product.sale_price_paise
          : product.regular_price_paise ?? product.price_paise,
        sale_is_active: saleIsActive,
        available_stock: hasActiveVariants
          ? totalVariantStock
          : product.stock_quantity,
        in_stock: hasActiveVariants
          ? totalVariantStock > 0
          : product.stock_quantity > 0,
      };
    });

    return NextResponse.json(
      { products },
      { headers: responseHeaders }
    );
  } catch (error) {
    console.error("Shop products API failed:", error);

    return NextResponse.json(
      { error: "Unable to load products." },
      { status: 500, headers: responseHeaders }
    );
  }
}
