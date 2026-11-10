import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidOwnerSession,
  OWNER_SESSION_COOKIE,
} from "@/lib/owner-session";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
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

const allowedCategories = ["JERSEY", "APPAREL", "ACCESSORY"];
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

function validText(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" && value.trim().length > 0 &&
    value.trim().length <= max;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("shop_products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Owner products query failed:", error.message);
      return json({ error: "Could not load products." }, 500);
    }

    return json({ products: data ?? [] });
  } catch (error) {
    console.error("Owner products GET failed:", error);
    return json({ error: "Request failed." }, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const form = await request.formData();
    const name = form.get("name");
    const description = form.get("description");
    const category = form.get("category");
    const price = Number(form.get("price_rupees"));
    const stock = Number(form.get("stock_quantity"));
    const sizesRaw = form.get("sizes");
    const image = form.get("image");

    if (
      !validText(name, 100) ||
      typeof description !== "string" ||
      description.length > 2000 ||
      typeof category !== "string" ||
      !allowedCategories.includes(category) ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > 1000000 ||
      !Number.isInteger(stock) ||
      stock < 0 ||
      stock > 100000 ||
      typeof sizesRaw !== "string" ||
      sizesRaw.length > 200
    ) {
      return json({ error: "Invalid product details." }, 400);
    }

    if (!(image instanceof File) || image.size < 1 ||
        image.size > 5 * 1024 * 1024 ||
        !allowedTypes.includes(image.type)) {
      return json(
        { error: "Upload a JPG, PNG or WebP image up to 5 MB." },
        400
      );
    }

    const sizes = sizesRaw
      .split(",")
      .map((size) => size.trim().toUpperCase())
      .filter(Boolean);

    if (sizes.length > 20 || sizes.some((size) => size.length > 12)) {
      return json({ error: "Invalid product sizes." }, 400);
    }

    const admin = createAdminClient();
    const extension =
      image.type === "image/jpeg" ? "jpg" :
      image.type === "image/png" ? "png" : "webp";
    const imagePath = `${auth.user.id}/${randomUUID()}.${extension}`;

    const { error: uploadError } = await admin.storage
      .from("shop-products")
      .upload(imagePath, image, {
        contentType: image.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Product image upload failed:", uploadError.message);
      return json({ error: "Image upload failed." }, 500);
    }

    const { data: publicUrl } = admin.storage
      .from("shop-products")
      .getPublicUrl(imagePath);

    const { data, error } = await admin
      .from("shop_products")
      .insert({
        name: (name as string).trim(),
        description: description.trim(),
        category,
        price_paise: Math.round(price * 100),
        image_url: publicUrl.publicUrl,
        sizes,
        stock_quantity: stock,
        active: form.get("active") === "true",
        created_by: auth.user.id,
      })
      .select("*")
      .single();

    if (error) {
      await admin.storage.from("shop-products").remove([imagePath]);
      console.error("Product creation failed:", error.message);
      return json({ error: "Could not create product." }, 500);
    }

    return json({ product: data }, 201);
  } catch (error) {
    console.error("Owner products POST failed:", error);
    return json({ error: "Request failed." }, 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const id = body?.id;

    if (typeof id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(id)) {
      return json({ error: "Invalid product ID." }, 400);
    }

    const update: Record<string, unknown> = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string" ||
          !body.name.trim() || body.name.length > 100) {
        return json({ error: "Invalid product name." }, 400);
      }
      update.name = body.name.trim();
    }

    if (body.description !== undefined) {
      if (typeof body.description !== "string" ||
          body.description.length > 2000) {
        return json({ error: "Invalid description." }, 400);
      }
      update.description = body.description.trim();
    }

    if (body.category !== undefined) {
      if (!allowedCategories.includes(body.category)) {
        return json({ error: "Invalid category." }, 400);
      }
      update.category = body.category;
    }

    if (body.price_rupees !== undefined) {
      const price = Number(body.price_rupees);
      if (!Number.isFinite(price) || price < 0 || price > 1000000) {
        return json({ error: "Invalid price." }, 400);
      }
      update.price_paise = Math.round(price * 100);
    }

    if (body.stock_quantity !== undefined) {
      if (!Number.isInteger(body.stock_quantity) ||
          body.stock_quantity < 0 || body.stock_quantity > 100000) {
        return json({ error: "Invalid stock quantity." }, 400);
      }
      update.stock_quantity = body.stock_quantity;
    }

    if (body.sizes !== undefined) {
      if (!Array.isArray(body.sizes) || body.sizes.length > 20 ||
          body.sizes.some((s: unknown) =>
            typeof s !== "string" || s.length > 12)) {
        return json({ error: "Invalid sizes." }, 400);
      }
      update.sizes = body.sizes.map((s: string) => s.trim().toUpperCase());
    }

    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") {
        return json({ error: "Invalid publish status." }, 400);
      }
      update.active = body.active;
    }

    if (body.sort_order !== undefined) {
      if (!Number.isInteger(body.sort_order)) {
        return json({ error: "Invalid sort order." }, 400);
      }
      update.sort_order = body.sort_order;
    }

    if (Object.keys(update).length === 0) {
      return json({ error: "No valid changes supplied." }, 400);
    }

    update.updated_at = new Date().toISOString();

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("shop_products")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("Product update failed:", error.message);
      return json({ error: "Could not update product." }, 500);
    }

    if (!data) return json({ error: "Product not found." }, 404);
    return json({ product: data });
  } catch (error) {
    console.error("Owner products PATCH failed:", error);
    return json({ error: "Request failed." }, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const body = await request.json();
    const id = body?.id;

    if (typeof id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(id)) {
      return json({ error: "Invalid product ID." }, 400);
    }

    const admin = createAdminClient();
    const { data: product, error: findError } = await admin
      .from("shop_products")
      .select("id,image_url")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      return json({ error: "Could not find product." }, 500);
    }
    if (!product) return json({ error: "Product not found." }, 404);

    const { error } = await admin
      .from("shop_products")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Product deletion failed:", error.message);
      return json({ error: "Could not delete product." }, 500);
    }

    const marker = "/storage/v1/object/public/shop-products/";
    const imagePath = product.image_url.split(marker)[1];

    if (imagePath) {
      await admin.storage.from("shop-products").remove([
        decodeURIComponent(imagePath),
      ]);
    }

    return json({ success: true });
  } catch (error) {
    console.error("Owner products DELETE failed:", error);
    return json({ error: "Request failed." }, 500);
  }
}
