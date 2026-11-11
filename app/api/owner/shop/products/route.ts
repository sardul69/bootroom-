
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isValidOwnerSession,
  OWNER_SESSION_COOKIE,
} from "@/lib/owner-session";
import { stringFromBase64URL } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "shop-products";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 12;
const MAX_VARIANTS = 20;
const MAX_BODY_SIZE = 20 * 1024 * 1024;

const ALLOWED_CATEGORIES = [
  "JERSEY",
  "APPAREL",
  "ACCESSORY",
] as const;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

type AnyBody = Record<string, any>;
type AdminClient = ReturnType<typeof createAdminClient>;

type AuthResult =
  | { user: { id: string } }
  | { error: NextResponse };

type ParsedRequest = {
  body: AnyBody;
  form: FormData | null;
};

class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/* -------------------------------------------------------------------------- */
/* Authentication and request protection                                     */
/* -------------------------------------------------------------------------- */

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");

  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function authorize(request: NextRequest): Promise<AuthResult> {
  if (request.method !== "GET" && !sameOrigin(request)) {
    return {
      error: json({ error: "Request rejected." }, 403),
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: json(
        { error: "Please sign in again." },
        401
      ),
    };
  }

  const { data: isOwner, error: ownerError } =
    await supabase.rpc("current_user_is_owner");

  if (ownerError || isOwner !== true) {
    return {
      error: json(
        { error: "Owner privileges required." },
        403
      ),
    };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;

  if (!isValidOwnerSession(token, user.id)) {
    return {
      error: json(
        {
          error:
            "Owner Console is locked. Unlock it and retry.",
        },
        401
      ),
    };
  }

  return { user };
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return undefined;

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseBoolean(value: unknown): boolean | null {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function readArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;

  const parsed = parseJson(value);
  return Array.isArray(parsed) ? parsed : null;
}

async function readRequestBody(
  request: NextRequest
): Promise<ParsedRequest> {
  const contentType =
    request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const body: AnyBody = {};

    for (const [key, value] of form.entries()) {
      if (value instanceof File) continue;

      // The editor serializes its fields with JSON.stringify.
      // Parse JSON values, but retain ordinary legacy strings.
      try {
        body[key] = JSON.parse(value);
      } catch {
        body[key] = value;
      }
    }

    return { body, form };
  }

  if (!contentType.includes("application/json")) {
    throw new ApiError(
      "Unsupported request content type.",
      415
    );
  }

  const contentLength = Number(
    request.headers.get("content-length") ?? 0
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > MAX_BODY_SIZE
  ) {
    throw new ApiError("Request body is too large.", 413);
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiError("Invalid JSON request body.");
  }

  if (!isRecord(body)) {
    throw new ApiError("Invalid request body.");
  }

  return { body, form: null };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

function validString(
  value: unknown,
  maxLength: number,
  allowEmpty = true
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length <= maxLength &&
    (allowEmpty || value.trim().length > 0)
  );
}

function validInteger(
  value: unknown,
  min = 0,
  max = 1000000
): boolean {
  return (
    Number.isInteger(value) &&
    Number(value) >= min &&
    Number(value) <= max
  );
}

function parsePrice(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 1000000
  ) {
    return null;
  }

  return Math.round(amount * 100);
}

function parsePaise(
  value: unknown
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const amount = Number(value);

  if (
    !Number.isInteger(amount) ||
    amount < 0 ||
    amount > 100000000
  ) {
    return undefined;
  }

  return amount;
}

function normalizeSizes(value: unknown): string[] | null {
  const values =
    readArray(value) ??
    (typeof value === "string" ? value.split(",") : null);

  if (!values || values.length > MAX_VARIANTS) {
    return null;
  }

  const sizes = values.map((item: unknown) =>
    typeof item === "string"
      ? item.trim().toUpperCase()
      : ""
  );

  if (
    sizes.some(
      (size: string) => !size || size.length > 24
    )
  ) {
    return null;
  }

  if (new Set(sizes).size !== sizes.length) {
    return null;
  }

  return sizes;
}

function normalizeTags(value: unknown): string[] | null {
  const values = readArray(value);

  if (!values || values.length > 30) return null;

  const tags = values.map((item: unknown) =>
    typeof item === "string"
      ? item.trim().slice(0, 40)
      : ""
  );

  if (tags.some((tag: string) => !tag)) return null;

  return [...new Set(tags)];
}

function normalizeAttributes(
  value: unknown
): Record<string, unknown> | null {
  const parsed =
    typeof value === "string"
      ? parseJson(value)
      : value;

  if (!isRecord(parsed)) return null;

  try {
    if (JSON.stringify(parsed).length > 10000) {
      return null;
    }
  } catch {
    return null;
  }

  return parsed;
}

function validateCommon(body: AnyBody): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (!validString(body.name, 100, false)) {
      throw new ApiError(
        "Product name must be 1–100 characters."
      );
    }

    result.name = body.name.trim();
  }

  if (body.description !== undefined) {
    if (!validString(body.description, 5000)) {
      throw new ApiError("Description is too long.");
    }

    result.description = body.description.trim();
  }

  if (body.category !== undefined) {
    if (
      typeof body.category !== "string" ||
      !ALLOWED_CATEGORIES.includes(
        body.category as (typeof ALLOWED_CATEGORIES)[number]
      )
    ) {
      throw new ApiError("Invalid product category.");
    }

    result.category = body.category;
  }

  if (body.brand_name !== undefined) {
    if (!validString(body.brand_name, 100)) {
      throw new ApiError("Invalid brand name.");
    }

    result.brand_name = body.brand_name.trim();
  }

  if (body.collection_title !== undefined) {
    if (!validString(body.collection_title, 120)) {
      throw new ApiError("Invalid collection title.");
    }

    result.collection_title =
      body.collection_title.trim();
  }

  if (body.collection_year !== undefined) {
    if (
      body.collection_year !== null &&
      body.collection_year !== "" &&
      !validInteger(
        Number(body.collection_year),
        1900,
        2200
      )
    ) {
      throw new ApiError("Invalid collection year.");
    }

    result.collection_year =
      body.collection_year === "" ||
      body.collection_year === null
        ? null
        : Number(body.collection_year);
  }

  if (body.sku !== undefined) {
    if (!validString(body.sku, 80)) {
      throw new ApiError("Invalid SKU.");
    }

    result.sku = body.sku.trim() || null;
  }

  if (body.product_type !== undefined) {
    if (
      !["SIMPLE", "VARIABLE"].includes(body.product_type)
    ) {
      throw new ApiError("Invalid product type.");
    }

    result.product_type = body.product_type;
  }

  if (body.price_rupees !== undefined) {
    const price = parsePrice(body.price_rupees);

    if (price === null) {
      throw new ApiError("Invalid product price.");
    }

    result.price_paise = price;
  }

  for (const key of [
    "regular_price_paise",
    "sale_price_paise",
  ]) {
    if (body[key] !== undefined) {
      const price = parsePaise(body[key]);

      if (price === undefined) {
        throw new ApiError(`Invalid ${key}.`);
      }

      result[key] = price;
    }
  }

  for (const key of ["sale_start_at", "sale_end_at"]) {
    if (body[key] !== undefined) {
      if (body[key] === "" || body[key] === null) {
        result[key] = null;
      } else if (
        typeof body[key] !== "string" ||
        !Number.isFinite(Date.parse(body[key]))
      ) {
        throw new ApiError(`Invalid ${key}.`);
      } else {
        result[key] = new Date(
          body[key]
        ).toISOString();
      }
    }
  }

  if (body.sizes !== undefined) {
    const sizes = normalizeSizes(body.sizes);

    if (!sizes) {
      throw new ApiError("Invalid product sizes.");
    }

    result.sizes = sizes;
  }

  if (body.stock_quantity !== undefined) {
    const stock = Number(body.stock_quantity);

    if (!validInteger(stock, 0, 100000)) {
      throw new ApiError("Invalid stock quantity.");
    }

    result.stock_quantity = stock;
  }

  if (body.hero_layout !== undefined) {
    if (!["ORIGINAL", "LAYERED"].includes(body.hero_layout)) {
      throw new ApiError("Invalid visual layout.");
    }

    result.hero_layout = body.hero_layout;
  }

  for (const key of [
    "hero_image_position",
    "player_image_position",
  ]) {
    if (body[key] !== undefined) {
      if (!validString(body[key], 40, false)) {
        throw new ApiError(`Invalid ${key}.`);
      }

      result[key] = body[key].trim();
    }
  }

  if (body.player_image_opacity !== undefined) {
    const opacity = Number(body.player_image_opacity);

    if (
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1
    ) {
      throw new ApiError(
        "Opacity must be between 0 and 1."
      );
    }

    result.player_image_opacity = opacity;
  }

  for (const key of ["allow_preorder", "featured"]) {
    if (body[key] !== undefined) {
      const value = parseBoolean(body[key]);

      if (value === null) {
        throw new ApiError(`Invalid ${key} setting.`);
      }

      result[key] = value;
    }
  }

  if (body.product_tags !== undefined) {
    const tags = normalizeTags(body.product_tags);

    if (!tags) {
      throw new ApiError("Invalid product tags.");
    }

    result.product_tags = tags;
  }

  if (body.attributes !== undefined) {
    const attributes = normalizeAttributes(
      body.attributes
    );

    if (!attributes) {
      throw new ApiError("Invalid product attributes.");
    }

    result.attributes = attributes;
  }

  if (body.dimensions !== undefined) {
    if (!validString(body.dimensions, 120)) {
      throw new ApiError("Invalid dimensions.");
    }

    result.dimensions = body.dimensions.trim();
  }

  if (body.weight_kg !== undefined) {
    const weight =
      body.weight_kg === "" ||
      body.weight_kg === null
        ? null
        : Number(body.weight_kg);

    if (
      weight !== null &&
      (!Number.isFinite(weight) ||
        weight < 0 ||
        weight > 10000)
    ) {
      throw new ApiError("Invalid product weight.");
    }

    result.weight_kg = weight;
  }

  if (body.seo_title !== undefined) {
    if (!validString(body.seo_title, 70)) {
      throw new ApiError("SEO title is too long.");
    }

    result.seo_title = body.seo_title.trim();
  }

  if (body.seo_description !== undefined) {
    if (!validString(body.seo_description, 200)) {
      throw new ApiError("SEO description is too long.");
    }

    result.seo_description =
      body.seo_description.trim();
  }

  if (body.publication_status !== undefined) {
    if (
      !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(
        body.publication_status
      )
    ) {
      throw new ApiError("Invalid publication status.");
    }

    result.publication_status =
      body.publication_status;
  }

  if (body.active !== undefined) {
    const active = parseBoolean(body.active);

    if (active === null) {
      throw new ApiError("Invalid active setting.");
    }

    result.active = active;
  }

  if (body.sort_order !== undefined) {
    const order = Number(body.sort_order);

    if (
      !Number.isInteger(order) ||
      Math.abs(order) > 1000000
    ) {
      throw new ApiError("Invalid sort order.");
    }

    result.sort_order = order;
  }

  return result;
}

function validatePriceCombination(
  current: Record<string, any>,
  update: Record<string, unknown>
) {
  const regular =
    update.regular_price_paise !== undefined
      ? update.regular_price_paise
      : current.regular_price_paise;

  const sale =
    update.sale_price_paise !== undefined
      ? update.sale_price_paise
      : current.sale_price_paise;

  const start =
    update.sale_start_at !== undefined
      ? update.sale_start_at
      : current.sale_start_at;

  const end =
    update.sale_end_at !== undefined
      ? update.sale_end_at
      : current.sale_end_at;

  if (
    regular != null &&
    sale != null &&
    Number(sale) > Number(regular)
  ) {
    throw new ApiError(
      "Sale price cannot exceed regular price."
    );
  }

  if (
    start &&
    end &&
    Date.parse(String(end)) <= Date.parse(String(start))
  ) {
    throw new ApiError(
      "Sale end must be after sale start."
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Image storage                                                               */
/* -------------------------------------------------------------------------- */

function validImage(file: unknown): file is File {
  return (
    typeof File !== "undefined" &&
    file instanceof File &&
    file.size > 0 &&
    file.size <= MAX_IMAGE_SIZE &&
    ALLOWED_IMAGE_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
    )
  );
}

function extensionFor(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  return "webp";
}

async function uploadImage(
  admin: AdminClient,
  userId: string,
  productId: string,
  file: File
): Promise<string> {
  if (!validImage(file)) {
    throw new ApiError(
      "Upload JPG, PNG or WebP images up to 5 MB each."
    );
  }

  const path =
    `${userId}/${productId}/${randomUUID()}.` +
    extensionFor(file.type);

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error("Storage upload failed:", error.message);
    throw new ApiError("Image upload failed.", 500);
  }

  return admin.storage
    .from(BUCKET)
    .getPublicUrl(path).data.publicUrl;
}

function getOwnedStoragePath(
  url: unknown,
  userId: string
): string | null {
  if (typeof url !== "string") return null;

  try {
    const parsed = new URL(url);
    const marker =
      `/storage/v1/object/public/${BUCKET}/`;
    const index = parsed.pathname.indexOf(marker);

    if (index < 0) return null;

    const path = decodeURIComponent(
      parsed.pathname.slice(index + marker.length)
    );

    if (!path.startsWith(`${userId}/`)) return null;

    return path;
  } catch {
    return null;
  }
}

async function removeUploadedImages(
  admin: AdminClient,
  urls: string[],
  userId: string
) {
  const paths = urls
    .map((url: string) =>
      getOwnedStoragePath(url, userId)
    )
    .filter((path): path is string => !!path);

  if (!paths.length) return;

  const { error } = await admin.storage
    .from(BUCKET)
    .remove([...new Set(paths)]);

  if (error) {
    console.error(
      "Uploaded media cleanup failed:",
      error.message
    );
  }
}

async function removeReplacedImages(
  admin: AdminClient,
  oldUrls: unknown[],
  newUrls: unknown[],
  userId: string
) {
  const retained = new Set(
    newUrls.filter(
      (url: unknown): url is string =>
        typeof url === "string"
    )
  );

  const obsolete = oldUrls.filter(
    (url: unknown): url is string =>
      typeof url === "string" &&
      !retained.has(url)
  );

  await removeUploadedImages(admin, obsolete, userId);
}

/* -------------------------------------------------------------------------- */
/* Product variants                                                            */
/* -------------------------------------------------------------------------- */

async function saveVariants(
  admin: AdminClient,
  productId: string,
  variants: unknown
) {
  if (!Array.isArray(variants)) {
    throw new ApiError("Variants must be an array.");
  }

  if (variants.length > MAX_VARIANTS) {
    throw new ApiError(
      `Maximum ${MAX_VARIANTS} variants per product.`
    );
  }

  const normalized = variants.map((item: unknown) => {
    if (!isRecord(item)) {
      throw new ApiError("Invalid variant.");
    }

    const size =
      typeof item.size === "string"
        ? item.size.trim().toUpperCase()
        : "";

    const stock = Number(item.stock_quantity);

    const price =
      item.price_paise === undefined ||
      item.price_paise === null ||
      item.price_paise === ""
        ? null
        : Number(item.price_paise);

    const sku =
      typeof item.sku === "string"
        ? item.sku.trim() || null
        : null;

    const active =
      item.active === undefined
        ? true
        : item.active;

    const sortOrder =
      item.sort_order === undefined
        ? 0
        : Number(item.sort_order);

    if (!size || size.length > 24) {
      throw new ApiError("Invalid variant size.");
    }

    if (!validInteger(stock, 0, 100000)) {
      throw new ApiError(
        `Invalid stock for size ${size}.`
      );
    }

    if (
      price !== null &&
      !validInteger(price, 0, 100000000)
    ) {
      throw new ApiError(
        `Invalid price for size ${size}.`
      );
    }

    if (sku !== null && sku.length > 80) {
      throw new ApiError(
        `Invalid SKU for size ${size}.`
      );
    }

    if (typeof active !== "boolean") {
      throw new ApiError(
        `Invalid active status for size ${size}.`
      );
    }

    if (
      !Number.isInteger(sortOrder) ||
      Math.abs(sortOrder) > 1000000
    ) {
      throw new ApiError(
        `Invalid sort order for size ${size}.`
      );
    }

    return {
      size,
      sku,
      stock_quantity: stock,
      price_paise: price,
      active,
      sort_order: sortOrder,
    };
  });

  const sizes = normalized.map(
    (variant: { size: string }) => variant.size
  );

  if (new Set(sizes).size !== sizes.length) {
    throw new ApiError(
      "Each variant size must be unique."
    );
  }

  const skus = normalized
    .map(
      (variant: { sku: string | null }) =>
        variant.sku?.toLowerCase()
    )
    .filter(
      (sku: string | undefined): sku is string =>
        !!sku
    );

  if (new Set(skus).size !== skus.length) {
    throw new ApiError(
      "Variant SKUs must be unique."
    );
  }

  const { data, error } = await admin.rpc(
    "replace_shop_product_variants",
    {
      p_product_id: productId,
      p_variants: normalized,
    }
  );

  if (error) {
    console.error(
      "Variant replacement failed:",
      error.message
    );

    if (error.code === "23505") {
      throw new ApiError(
        "A variant size or SKU is already in use."
      );
    }

    throw new ApiError(
      "Could not save product variants.",
      500
    );
  }

  return data;
}

/* -------------------------------------------------------------------------- */
/* Recovery and error handling                                                 */
/* -------------------------------------------------------------------------- */

async function compensateProductInsert(
  admin: AdminClient,
  productId: string
) {
  const { error } = await admin
    .from("shop_products")
    .delete()
    .eq("id", productId);

  if (error) {
    console.error(
      "Product insert compensation failed:",
      error.message
    );
  }
}

async function compensateProductUpdate(
  admin: AdminClient,
  productId: string,
  previous: Record<string, any>,
  changedKeys: string[]
) {
  const rollback: Record<string, unknown> = {};

  for (const key of changedKeys) {
    if (key in previous) {
      rollback[key] = previous[key];
    }
  }

  rollback.updated_at = new Date().toISOString();

  if (Object.keys(rollback).length <= 1) return;

  const { error } = await admin
    .from("shop_products")
    .update(rollback)
    .eq("id", productId);

  if (error) {
    console.error(
      "Product update compensation failed:",
      error.message
    );
  }
}

function handleError(error: unknown, label: string) {
  if (error instanceof ApiError) {
    return json(
      { error: error.message },
      error.status
    );
  }

  console.error(`${label}:`, error);

  return json(
    { error: "An unexpected server error occurred." },
    500
  );
}

/* -------------------------------------------------------------------------- */
/* GET — Owner product inventory                                               */
/* -------------------------------------------------------------------------- */

export async function GET(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const admin = createAdminClient();

    const { data, error } = await admin
      .from("shop_products")
      .select("*, shop_product_variants(*)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "Owner products query failed:",
        error.message
      );

      return json(
        { error: "Could not load products." },
        500
      );
    }

    return json({
      products: data ?? [],
    });
  } catch (error) {
    return handleError(
      error,
      "Owner products GET failed"
    );
  }
}

/* -------------------------------------------------------------------------- */
/* POST — Create product                                                       */
/* -------------------------------------------------------------------------- */

export async function POST(request: NextRequest) {
  const uploadedUrls: string[] = [];

  let admin: AdminClient | null = null;
  let createdProductId: string | null = null;
  let userId: string | null = null;

  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    userId = auth.user.id;

    const { body, form } =
      await readRequestBody(request);

    const update = validateCommon(body);

    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      typeof body.category !== "string" ||
      !ALLOWED_CATEGORIES.includes(
        body.category as (typeof ALLOWED_CATEGORIES)[number]
      )
    ) {
      throw new ApiError(
        "Product name and category are required."
      );
    }

    admin = createAdminClient();

    const image = form?.get("image");

    if (!validImage(image)) {
      throw new ApiError(
        "Upload a JPG, PNG or WebP main image up to 5 MB."
      );
    }

    const productId = randomUUID();
    createdProductId = productId;

    const galleryFiles = (
      form?.getAll("gallery_images") ?? []
    ).filter(
      (file): file is File =>
        file instanceof File && file.size > 0
    );

    const playerFile = form?.get("player_image");

    if (
      playerFile instanceof File &&
      playerFile.size > 0 &&
      !validImage(playerFile)
    ) {
      throw new ApiError("Invalid player image.");
    }

    if (
      galleryFiles.length > MAX_GALLERY_IMAGES ||
      galleryFiles.some((file) => !validImage(file))
    ) {
      throw new ApiError(
        "Gallery supports up to 12 valid images."
      );
    }

    const mainUrl = await uploadImage(
      admin,
      userId,
      productId,
      image
    );

    uploadedUrls.push(mainUrl);

    const galleryUrls: string[] = [];

    for (const file of galleryFiles) {
      const url = await uploadImage(
        admin,
        userId,
        productId,
        file
      );

      galleryUrls.push(url);
      uploadedUrls.push(url);
    }

    let playerUrl: string | null = null;

    if (
      playerFile instanceof File &&
      playerFile.size > 0
    ) {
      playerUrl = await uploadImage(
        admin,
        userId,
        productId,
        playerFile
      );

      uploadedUrls.push(playerUrl);
    }

    const status =
      typeof body.publication_status === "string"
        ? body.publication_status
        : parseBoolean(body.active) === true
          ? "PUBLISHED"
          : "DRAFT";

    if (
      !["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)
    ) {
      throw new ApiError(
        "Invalid publication status."
      );
    }

    const insert: Record<string, unknown> = {
      id: productId,
      ...update,
      name: body.name.trim(),
      category: body.category,
      image_url: mainUrl,
      gallery_urls: galleryUrls,
      player_image_url: playerUrl,
      publication_status: status,
      active: status === "PUBLISHED",
      created_by: userId,
    };

    validatePriceCombination({}, insert);

    if (
      insert.product_type === "SIMPLE" &&
      body.variants !== undefined &&
      Array.isArray(body.variants) &&
      body.variants.length > 0
    ) {
      throw new ApiError(
        "Simple products cannot contain variants."
      );
    }

    const { data, error } = await admin
      .from("shop_products")
      .insert(insert)
      .select("*")
      .single();

    if (error) {
      console.error(
        "Product creation failed:",
        error.message
      );

      if (error.code === "23505") {
        throw new ApiError(
          "That SKU is already in use."
        );
      }

      throw new ApiError(
        "Could not create product.",
        500
      );
    }

    let variants = null;

    if (data.product_type === "VARIABLE") {
      if (body.variants !== undefined) {
        variants = await saveVariants(
          admin,
          productId,
          body.variants
        );
      } else {
        variants = await saveVariants(
          admin,
          productId,
          []
        );
      }
    } else if (body.variants !== undefined) {
      throw new ApiError(
        "Simple products cannot contain variants."
      );
    }

    return json(
      {
        product: {
          ...data,
          variants,
        },
      },
      201
    );
  } catch (error) {
    if (admin && createdProductId) {
      await compensateProductInsert(
        admin,
        createdProductId
      );
    }

    if (
      admin &&
      userId &&
      uploadedUrls.length
    ) {
      await removeUploadedImages(
        admin,
        uploadedUrls,
        userId
      );
    }

    return handleError(
      error,
      "Owner products POST failed"
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH — Update product                                                      */
/* -------------------------------------------------------------------------- */

export async function PATCH(request: NextRequest) {
  const uploadedUrls: string[] = [];

  let admin: AdminClient | null = null;
  let userId: string | null = null;
  let productId: string | null = null;

  let previous: Record<string, any> | null = null;
  let changedKeys: string[] = [];
  let productUpdateCommitted = false;

  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    userId = auth.user.id;

    const { body, form } =
      await readRequestBody(request);

    const id = body.id;

    if (!isUuid(id)) {
      throw new ApiError("Invalid product ID.");
    }

    productId = id;
    admin = createAdminClient();

    const { data: existing, error: findError } =
      await admin
        .from("shop_products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (findError) {
      throw new ApiError(
        "Could not find product.",
        500
      );
    }

    if (!existing) {
      throw new ApiError(
        "Product not found.",
        404
      );
    }

    previous = existing;

    const update = validateCommon(body);

    validatePriceCombination(existing, update);

    const galleryFiles = (
      form?.getAll("gallery_images") ?? []
    ).filter(
      (file): file is File =>
        file instanceof File && file.size > 0
    );

    if (
      galleryFiles.length > MAX_GALLERY_IMAGES ||
      galleryFiles.some((file) => !validImage(file))
    ) {
      throw new ApiError(
        "Gallery supports up to 12 valid images."
      );
    }

    /* Main image replacement */

    const mainFile = form?.get("image");

    if (mainFile instanceof File && mainFile.size > 0) {
      if (!validImage(mainFile)) {
        throw new ApiError("Invalid main image.");
      }

      const url = await uploadImage(
        admin,
        userId,
        id,
        mainFile
      );

      uploadedUrls.push(url);
      update.image_url = url;
    }

    /* Player image replacement */

    const playerFile = form?.get("player_image");

    if (
      playerFile instanceof File &&
      playerFile.size > 0
    ) {
      if (!validImage(playerFile)) {
        throw new ApiError("Invalid player image.");
      }

      const url = await uploadImage(
        admin,
        userId,
        id,
        playerFile
      );

      uploadedUrls.push(url);
      update.player_image_url = url;
    }

    /* Gallery management */

    const oldGallery: string[] = Array.isArray(
      existing.gallery_urls
    )
      ? existing.gallery_urls
      : [];

    if (
      body.gallery_urls !== undefined ||
      galleryFiles.length > 0
    ) {
      const supplied = readArray(body.gallery_urls);

      const requested: unknown[] =
        body.gallery_urls === undefined
          ? oldGallery
          : supplied ?? [];

      if (
        !supplied && body.gallery_urls !== undefined
      ) {
        throw new ApiError("Invalid gallery URLs.");
      }

      if (
        requested.length > MAX_GALLERY_IMAGES ||
        requested.some(
          (url: unknown) =>
            typeof url !== "string" ||
            url.length > 2000 ||
            !oldGallery.includes(url)
        )
      ) {
        throw new ApiError(
          "Gallery contains an invalid or unowned image URL."
        );
      }

      const newUrls: string[] = [];

      for (const file of galleryFiles) {
        const url = await uploadImage(
          admin,
          userId,
          id,
          file
        );

        newUrls.push(url);
        uploadedUrls.push(url);
      }

      update.gallery_urls = [
        ...(requested as string[]),
        ...newUrls,
      ];
    }

    /* Promote an existing gallery image to main image */

    if (body.main_image_url !== undefined) {
      if (typeof body.main_image_url !== "string") {
        throw new ApiError("Invalid main image URL.");
      }

      const requestedMain = body.main_image_url;

      const allowedMain =
        requestedMain === existing.image_url ||
        oldGallery.includes(requestedMain) ||
        uploadedUrls.includes(requestedMain);

      if (!allowedMain) {
        throw new ApiError(
          "Selected main image does not belong to this product."
        );
      }

      const currentGallery: string[] =
        Array.isArray(update.gallery_urls)
          ? (update.gallery_urls as string[])
          : oldGallery;

      update.image_url = requestedMain;

      if (currentGallery.includes(requestedMain)) {
        update.gallery_urls = currentGallery.filter(
          (url: string) => url !== requestedMain
        );
      }
    }

    /* Explicit image clearing */

    if (
      body.clear_player_image === true ||
      body.clear_player_image === "true"
    ) {
      update.player_image_url = null;
    }

    if (
      body.clear_gallery === true ||
      body.clear_gallery === "true"
    ) {
      update.gallery_urls = [];
    }

    /* Publication status compatibility */

    if (
      body.active !== undefined &&
      body.publication_status === undefined
    ) {
      const active = parseBoolean(body.active);

      if (active === null) {
        throw new ApiError("Invalid active setting.");
      }

      update.publication_status = active
        ? "PUBLISHED"
        : "DRAFT";

      delete update.active;
    }

    /* Product type and variants */

    const requestedType =
      update.product_type ?? existing.product_type;

    if (
      requestedType === "SIMPLE" &&
      body.variants !== undefined &&
      (
        !Array.isArray(body.variants) ||
        body.variants.length > 0
      )
    ) {
      throw new ApiError(
        "Simple products cannot contain variants."
      );
    }

    if (
      requestedType === "VARIABLE" &&
      body.variants === undefined &&
      existing.product_type !== "VARIABLE"
    ) {
      throw new ApiError(
        "Provide variants when converting to a variable product."
      );
    }

    if (
      Object.keys(update).length === 0 &&
      body.variants === undefined
    ) {
      throw new ApiError(
        "No valid changes supplied."
      );
    }

    update.updated_at = new Date().toISOString();

    changedKeys = Object.keys(update);

    const { data, error } = await admin
      .from("shop_products")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) {
      console.error(
        "Product update failed:",
        error.message
      );

      if (error.code === "23505") {
        throw new ApiError(
          "That SKU is already in use."
        );
      }

      throw new ApiError(
        "Could not update product.",
        500
      );
    }

    if (!data) {
      throw new ApiError(
        "Product not found.",
        404
      );
    }

    productUpdateCommitted = true;

    let variants = null;

    if (body.variants !== undefined) {
      if (data.product_type !== "VARIABLE") {
        throw new ApiError(
          "Only variable products can have variants."
        );
      }

      variants = await saveVariants(
        admin,
        id,
        body.variants
      );
    } else if (
      existing.product_type === "VARIABLE" &&
      data.product_type === "SIMPLE"
    ) {
      variants = await saveVariants(
        admin,
        id,
        []
      );
    }

    /* Remove obsolete owned images only after successful saving */

    const oldMedia: string[] = [
      existing.image_url,
      ...(Array.isArray(existing.gallery_urls)
        ? existing.gallery_urls
        : []),
      existing.player_image_url,
    ].filter(
      (url: unknown): url is string =>
        typeof url === "string"
    );

    const newMedia: string[] = [
      data.image_url,
      ...(Array.isArray(data.gallery_urls)
        ? data.gallery_urls
        : []),
      data.player_image_url,
    ].filter(
      (url: unknown): url is string =>
        typeof url === "string"
    );

    await removeReplacedImages(
      admin,
      oldMedia,
      newMedia,
      userId
    );

    return json({
      product: {
        ...data,
        variants,
      },
    });
  } catch (error) {
    if (
      admin &&
      productId &&
      previous &&
      productUpdateCommitted
    ) {
      await compensateProductUpdate(
        admin,
        productId,
        previous,
        changedKeys
      );
    }

    if (
      admin &&
      userId &&
      uploadedUrls.length
    ) {
      await removeUploadedImages(
        admin,
        uploadedUrls,
        userId
      );
    }

    return handleError(
      error,
      "Owner products PATCH failed"
    );
  }
}

/* -------------------------------------------------------------------------- */
/* DELETE — Delete product and its owned media                                 */
/* -------------------------------------------------------------------------- */

export async function DELETE(request: NextRequest) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;

    const { body } = await readRequestBody(request);

    const id = body.id;

    if (!isUuid(id)) {
      throw new ApiError("Invalid product ID.");
    }

    const admin = createAdminClient();

    const { data: product, error: findError } =
      await admin
        .from("shop_products")
        .select(
          "id,image_url,gallery_urls,player_image_url"
        )
        .eq("id", id)
        .maybeSingle();

    if (findError) {
      throw new ApiError(
        "Could not find product.",
        500
      );
    }

    if (!product) {
      throw new ApiError(
        "Product not found.",
        404
      );
    }

    const { error } = await admin
      .from("shop_products")
      .delete()
      .eq("id", id);

    if (error) {
      console.error(
        "Product deletion failed:",
        error.message
      );

      throw new ApiError(
        "Could not delete product.",
        500
      );
    }

    const urls: string[] = [
      product.image_url,
      ...(Array.isArray(product.gallery_urls)
        ? product.gallery_urls
        : []),
      product.player_image_url,
    ].filter(
      (url: unknown): url is string =>
        typeof url === "string"
    );

    await removeUploadedImages(
      admin,
      urls,
      auth.user.id
    );

    return json({ success: true });
  } catch (error) {
    return handleError(
      error,
      "Owner products DELETE failed"
    );
  }
}
