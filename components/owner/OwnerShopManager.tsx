
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Category = "JERSEY" | "APPAREL" | "ACCESSORY";
type ProductType = "SIMPLE" | "VARIABLE";
type PublicationStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type HeroLayout = "ORIGINAL" | "LAYERED";
type Tab = "identity" | "media" | "pricing" | "inventory" | "marketing";

type Variant = {
  size: string;
  sku: string;
  stock_quantity: number;
  price_paise: number | null;
  active: boolean;
  sort_order: number;
};

type Product = {
  id: string;
  name: string;
  description: string;
  category: Category;
  price_paise: number;
  image_url: string;
  gallery_urls: string[];
  player_image_url: string | null;
  sizes: string[];
  stock_quantity: number;
  active: boolean;
  brand_name?: string;
  collection_title?: string;
  collection_year?: number | null;
  sku?: string | null;
  product_type?: ProductType;
  regular_price_paise?: number | null;
  sale_price_paise?: number | null;
  sale_start_at?: string | null;
  sale_end_at?: string | null;
  hero_layout?: HeroLayout;
  hero_image_position?: string;
  player_image_position?: string;
  player_image_opacity?: number;
  allow_preorder?: boolean;
  featured?: boolean;
  product_tags?: string[];
  attributes?: Record<string, unknown>;
  dimensions?: string;
  weight_kg?: number | null;
  seo_title?: string;
  seo_description?: string;
  publication_status?: PublicationStatus;
  sort_order?: number;
  shop_product_variants?: Variant[];
};

type EditorForm = {
  name: string;
  description: string;
  category: Category;
  brand_name: string;
  collection_title: string;
  collection_year: string;
  sku: string;
  product_type: ProductType;
  regular_price: string;
  sale_price: string;
  sale_start_at: string;
  sale_end_at: string;
  sizes: string;
  stock_quantity: string;
  hero_layout: HeroLayout;
  hero_image_position: string;
  player_image_position: string;
  player_image_opacity: number;
  allow_preorder: boolean;
  featured: boolean;
  product_tags: string;
  dimensions: string;
  weight_kg: string;
  seo_title: string;
  seo_description: string;
  sort_order: string;
  publication_status: PublicationStatus;
};

const ENDPOINT = "/api/owner/shop/products";

const EMPTY_FORM: EditorForm = {
  name: "",
  description: "",
  category: "JERSEY",
  brand_name: "",
  collection_title: "",
  collection_year: "",
  sku: "",
  product_type: "SIMPLE",
  regular_price: "",
  sale_price: "",
  sale_start_at: "",
  sale_end_at: "",
  sizes: "S, M, L, XL",
  stock_quantity: "10",
  hero_layout: "ORIGINAL",
  hero_image_position: "50% 50%",
  player_image_position: "50% 50%",
  player_image_opacity: 1,
  allow_preorder: false,
  featured: false,
  product_tags: "",
  dimensions: "",
  weight_kg: "",
  seo_title: "",
  seo_description: "",
  sort_order: "0",
  publication_status: "DRAFT",
};

const money = (paise: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((Number(paise) || 0) / 100);

const toPaise = (value: string) => {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0
    ? Math.round(number * 100)
    : null;
};

const toLocalInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const fileUrl = (file: File | null, fallback: string) =>
  file ? URL.createObjectURL(file) : fallback;

function normaliseProduct(product: Product): Product {
  return {
    ...product,
    gallery_urls: Array.isArray(product.gallery_urls)
      ? product.gallery_urls
      : [],
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    product_tags: Array.isArray(product.product_tags)
      ? product.product_tags
      : [],
    shop_product_variants: Array.isArray(product.shop_product_variants)
      ? product.shop_product_variants
      : [],
    publication_status:
      product.publication_status ??
      (product.active ? "PUBLISHED" : "DRAFT"),
    product_type: product.product_type ?? "SIMPLE",
  };
}

function fieldLabel(label: string, required = false) {
  return (
    <span className="field-label">
      {label}
      {required && <i> *</i>}
    </span>
  );
}

export default function OwnerShopManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [editing, setEditing] = useState<Product | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [tab, setTab] = useState<Tab>("identity");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [preview, setPreview] = useState(false);

  const [mainImage, setMainImage] = useState<File | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [playerImage, setPlayerImage] = useState<File | null>(null);
  const [clearPlayerImage, setClearPlayerImage] = useState(false);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantSize, setVariantSize] = useState("");
  const [variantStock, setVariantStock] = useState("0");
  const [variantSku, setVariantSku] = useState("");
  const [variantPrice, setVariantPrice] = useState("");

  const mainInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const playerInput = useRef<HTMLInputElement>(null);

  const patchForm = useCallback(
    <K extends keyof EditorForm>(key: K, value: EditorForm[K]) => {
      setForm((previous) => ({ ...previous, [key]: value }));
    },
    []
  );

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(ENDPOINT, { cache: "no-store" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load products.");
      }

      setProducts(
        Array.isArray(result.products)
          ? result.products.map(normaliseProduct)
          : []
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not load products."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const stats = useMemo(() => {
    const published = products.filter(
      (product) => product.publication_status === "PUBLISHED"
    ).length;
    const drafts = products.filter(
      (product) => product.publication_status === "DRAFT"
    ).length;
    const archived = products.filter(
      (product) => product.publication_status === "ARCHIVED"
    ).length;

    return { total: products.length, published, drafts, archived };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products.filter((product) => {
      const status = product.publication_status ?? "DRAFT";
      const matchesFilter =
        filter === "ALL" || status === filter || product.category === filter;

      const matchesSearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        (product.brand_name ?? "").toLowerCase().includes(query) ||
        (product.collection_title ?? "").toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [products, search, filter]);

  const activeSale = useMemo(() => {
    const regular = Number(form.regular_price);
    const sale = Number(form.sale_price);
    return (
      form.sale_price.trim() !== "" &&
      Number.isFinite(sale) &&
      Number.isFinite(regular) &&
      sale >= 0 &&
      sale <= regular
    );
  }, [form.regular_price, form.sale_price]);

  const previewMain = fileUrl(mainImage, editing?.image_url ?? "");
  const previewPlayer = fileUrl(
    playerImage,
    clearPlayerImage ? "" : editing?.player_image_url ?? ""
  );

  function resetMedia() {
    setMainImage(null);
    setGalleryFiles([]);
    setGalleryUrls([]);
    setPlayerImage(null);
    setClearPlayerImage(false);
    if (mainInput.current) mainInput.current.value = "";
    if (galleryInput.current) galleryInput.current.value = "";
    if (playerInput.current) playerInput.current.value = "";
  }

  function resetEditor() {
    setEditing(null);
    setIsCreating(false);
    setForm(EMPTY_FORM);
    setVariants([]);
    setTab("identity");
    setPreview(false);
    resetMedia();
  }

  function openNew() {
    resetEditor();
    setMessage("");
    setErrorMessage("");
    setEditing(null);
    setIsCreating(true);
  }

  function openEdit(product: Product) {
    const item = normaliseProduct(product);

    setEditing(item);
    setIsCreating(true);
    setForm({
      name: item.name ?? "",
      description: item.description ?? "",
      category: item.category ?? "JERSEY",
      brand_name: item.brand_name ?? "",
      collection_title: item.collection_title ?? "",
      collection_year: item.collection_year?.toString() ?? "",
      sku: item.sku ?? "",
      product_type: item.product_type ?? "SIMPLE",
      regular_price:
        ((item.regular_price_paise ?? item.price_paise) / 100).toString(),
      sale_price:
        item.sale_price_paise != null
          ? (item.sale_price_paise / 100).toString()
          : "",
      sale_start_at: toLocalInput(item.sale_start_at),
      sale_end_at: toLocalInput(item.sale_end_at),
      sizes: item.sizes.join(", "),
      stock_quantity: String(item.stock_quantity ?? 0),
      hero_layout: item.hero_layout ?? "ORIGINAL",
      hero_image_position: item.hero_image_position ?? "50% 50%",
      player_image_position: item.player_image_position ?? "50% 50%",
      player_image_opacity: item.player_image_opacity ?? 1,
      allow_preorder: item.allow_preorder ?? false,
      featured: item.featured ?? false,
      product_tags: (item.product_tags ?? []).join(", "),
      dimensions: item.dimensions ?? "",
      weight_kg: item.weight_kg?.toString() ?? "",
      seo_title: item.seo_title ?? "",
      seo_description: item.seo_description ?? "",
      sort_order: String(item.sort_order ?? 0),
      publication_status: item.publication_status ?? "DRAFT",
    });

    setGalleryUrls([...(item.gallery_urls ?? [])]);
    setVariants(
      (item.shop_product_variants ?? []).map((variant) => ({
        ...variant,
        sku: variant.sku ?? "",
        price_paise: variant.price_paise ?? null,
      }))
    );

    setMainImage(null);
    setGalleryFiles([]);
    setPlayerImage(null);
    setClearPlayerImage(false);
    setTab("identity");
    setPreview(false);
    setMessage("");
    setErrorMessage("");

    if (mainInput.current) mainInput.current.value = "";
    if (galleryInput.current) galleryInput.current.value = "";
    if (playerInput.current) playerInput.current.value = "";
  }

  function addGalleryFiles(files: FileList | null) {
    if (!files) return;

    const incoming = Array.from(files);
    if (galleryFiles.length + galleryUrls.length + incoming.length > 12) {
      setErrorMessage("A product can have a maximum of 12 gallery images.");
      return;
    }

    if (
      incoming.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024 ||
          file.size < 1
      )
    ) {
      setErrorMessage("Use JPG, PNG or WebP images up to 5 MB each.");
      return;
    }

    setGalleryFiles((previous) => [...previous, ...incoming]);
    setErrorMessage("");
  }

  function removeGalleryImage(index: number) {
    if (index < galleryUrls.length) {
      setGalleryUrls((previous) =>
        previous.filter((_, current) => current !== index)
      );
    } else {
      const fileIndex = index - galleryUrls.length;
      setGalleryFiles((previous) =>
        previous.filter((_, current) => current !== fileIndex)
      );
    }
  }

  function setAsMain(index: number) {
    if (index < galleryUrls.length) {
      const url = galleryUrls[index];
      if (!url) return;
      setGalleryUrls((previous) => previous.filter((_, i) => i !== index));
      if (editing) {
        setMainImage(null);
        setForm((previous) => previous);
      }
      setErrorMessage(
        "Gallery URLs are preserved. Upload a new main image to replace the cover image."
      );
      return;
    }

    const fileIndex = index - galleryUrls.length;
    const file = galleryFiles[fileIndex];
    if (!file) return;

    setMainImage(file);
    setGalleryFiles((previous) =>
      previous.filter((_, i) => i !== fileIndex)
    );
    setErrorMessage("");
  }

  function addVariant() {
    const size = variantSize.trim().toUpperCase();
    const stock = Number(variantStock);
    const price = variantPrice.trim() ? Number(variantPrice) : null;

    if (!size || size.length > 24) {
      setErrorMessage("Enter a valid size.");
      return;
    }

    if (variants.some((variant) => variant.size.toUpperCase() === size)) {
      setErrorMessage("That size already exists.");
      return;
    }

    if (!Number.isInteger(stock) || stock < 0 || stock > 100000) {
      setErrorMessage("Enter valid stock quantity.");
      return;
    }

    if (
      price !== null &&
      (!Number.isFinite(price) || price < 0 || price > 1000000)
    ) {
      setErrorMessage("Enter a valid variant price.");
      return;
    }

    setVariants((previous) => [
      ...previous,
      {
        size,
        sku: variantSku.trim(),
        stock_quantity: stock,
        price_paise: price === null ? null : Math.round(price * 100),
        active: true,
        sort_order: previous.length,
      },
    ]);

    setVariantSize("");
    setVariantStock("0");
    setVariantSku("");
    setVariantPrice("");
    setErrorMessage("");
  }

  function updateVariant(index: number, changes: Partial<Variant>) {
    setVariants((previous) =>
      previous.map((variant, current) =>
        current === index ? { ...variant, ...changes } : variant
      )
    );
  }

  function removeVariant(index: number) {
    setVariants((previous) =>
      previous
        .filter((_, current) => current !== index)
        .map((variant, sort_order) => ({ ...variant, sort_order }))
    );
  }

  function buildFormData(status?: PublicationStatus) {
    const data = new FormData();

    const payload = {
      name: form.name.trim(),
      description: form.description,
      category: form.category,
      brand_name: form.brand_name,
      collection_title: form.collection_title,
      collection_year: form.collection_year
        ? Number(form.collection_year)
        : null,
      sku: form.sku,
      product_type: form.product_type,
      regular_price_paise: toPaise(form.regular_price),
      sale_price_paise: form.sale_price.trim()
        ? toPaise(form.sale_price)
        : null,
      sale_start_at: form.sale_start_at
        ? new Date(form.sale_start_at).toISOString()
        : null,
      sale_end_at: form.sale_end_at
        ? new Date(form.sale_end_at).toISOString()
        : null,
      sizes: form.sizes
        .split(",")
        .map((size) => size.trim().toUpperCase())
        .filter(Boolean),
      stock_quantity: Number(form.stock_quantity),
      hero_layout: form.hero_layout,
      hero_image_position: form.hero_image_position,
      player_image_position: form.player_image_position,
      player_image_opacity: form.player_image_opacity,
      allow_preorder: form.allow_preorder,
      featured: form.featured,
      product_tags: form.product_tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      dimensions: form.dimensions,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
      sort_order: Number(form.sort_order),
      publication_status: status ?? form.publication_status,
      variants:
        form.product_type === "VARIABLE"
          ? variants.map((variant) => ({
              ...variant,
              price_paise: variant.price_paise,
            }))
          : undefined,
    };

    if (editing) data.set("id", editing.id);

    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined) data.set(key, JSON.stringify(value));
    });

    if (mainImage) data.set("image", mainImage);
    if (playerImage) data.set("player_image", playerImage);

    if (clearPlayerImage) data.set("clear_player_image", "true");

    data.set("gallery_urls", JSON.stringify(galleryUrls));

    galleryFiles.forEach((file) => data.append("gallery_images", file));

    return data;
  }

  async function saveProduct(status?: PublicationStatus) {
    setMessage("");
    setErrorMessage("");

    if (!form.name.trim()) {
      setErrorMessage("Product name is required.");
      setTab("identity");
      return;
    }

    if (!editing && !mainImage) {
      setErrorMessage("Choose a main product image.");
      setTab("media");
      return;
    }

    const regular = Number(form.regular_price);
    const sale = Number(form.sale_price);

    if (
      !form.regular_price.trim() ||
      !Number.isFinite(regular) ||
      regular < 0
    ) {
      setErrorMessage("Enter a valid regular price.");
      setTab("pricing");
      return;
    }

    if (
      form.sale_price.trim() &&
      (!Number.isFinite(sale) || sale < 0 || sale > regular)
    ) {
      setErrorMessage("Sale price must be between zero and regular price.");
      setTab("pricing");
      return;
    }

    if (
      form.sale_start_at &&
      form.sale_end_at &&
      new Date(form.sale_end_at) <= new Date(form.sale_start_at)
    ) {
      setErrorMessage("Sale end must be after sale start.");
      setTab("pricing");
      return;
    }

    if (
      form.product_type === "VARIABLE" &&
      variants.length === 0
    ) {
      setErrorMessage("Add at least one product variant.");
      setTab("inventory");
      return;
    }

    if (form.hero_layout === "LAYERED" && !previewPlayer) {
      setErrorMessage("Layered layout requires a player image.");
      setTab("media");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(ENDPOINT, {
        method: editing ? "PATCH" : "POST",
        body: buildFormData(status),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not save product.");
      }

      setMessage(
        status === "PUBLISHED"
          ? "Product published successfully."
          : status === "ARCHIVED"
            ? "Product archived successfully."
            : editing
              ? "Product changes saved."
              : "Product saved as draft."
      );

      resetEditor();
      await loadProducts();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not save product."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    product: Product,
    status: PublicationStatus
  ) {
    try {
      setMessage("");
      setErrorMessage("");

      const response = await fetch(ENDPOINT, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: product.id,
          publication_status: status,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not change product status.");
      }

      setMessage(`Product ${status.toLowerCase()}.`);
      await loadProducts();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not update product."
      );
    }
  }

  async function deleteProduct(product: Product) {
    if (
      !window.confirm(
        `Permanently delete "${product.name}"? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setSaving(true);
      const response = await fetch(ENDPOINT, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete product.");
      }

      setMessage("Product permanently deleted.");
      if (editing?.id === product.id) resetEditor();
      await loadProducts();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Could not delete product."
      );
    } finally {
      setSaving(false);
    }
  }

  function imagePreview(url: string, alt: string) {
    if (!url) return null;

    return <img src={url} alt={alt} />;
  }

  const tabs: { id: Tab; label: string; number: string }[] = [
    { id: "identity", label: "IDENTITY", number: "01" },
    { id: "media", label: "VISUALS", number: "02" },
    { id: "pricing", label: "PRICING", number: "03" },
    { id: "inventory", label: "INVENTORY", number: "04" },
    { id: "marketing", label: "MARKETING", number: "05" },
  ];

  return (
    <section className="tz-manager">
      <header className="tz-heading">
        <div>
          <div className="tz-kicker">TURFZY / COMMERCE CONTROL</div>
          <h2>Marketplace Studio</h2>
          <p>Control every product, collection and visual detail.</p>
        </div>

        <button className="tz-primary-button" onClick={openNew}>
          <span>＋</span> CREATE PRODUCT
        </button>
      </header>

      <div className="tz-stats">
        <div className="tz-stat">
          <span>CATALOGUE</span>
          <strong>{stats.total.toString().padStart(2, "0")}</strong>
        </div>
        <div className="tz-stat">
          <span>PUBLISHED</span>
          <strong>{stats.published.toString().padStart(2, "0")}</strong>
        </div>
        <div className="tz-stat">
          <span>DRAFTS</span>
          <strong>{stats.drafts.toString().padStart(2, "0")}</strong>
        </div>
        <div className="tz-stat">
          <span>ARCHIVED</span>
          <strong>{stats.archived.toString().padStart(2, "0")}</strong>
        </div>
      </div>

      {message && (
        <div className="tz-notice tz-success" role="status">
          <span>✓</span> {message}
        </div>
      )}

      {errorMessage && (
        <div className="tz-notice tz-error" role="alert">
          <span>!</span> {errorMessage}
        </div>
      )}

      <div className="tz-workspace">
        <aside className="tz-sidebar">
          <div className="tz-sidebar-heading">
            <span>PRODUCT CATALOGUE</span>
            <span>{products.length}</span>
          </div>

          <input
            className="tz-search"
            placeholder="Search catalogue..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <div className="tz-filters">
            {[
              ["ALL", "All products"],
              ["PUBLISHED", "Published"],
              ["DRAFT", "Drafts"],
              ["ARCHIVED", "Archived"],
              ["JERSEY", "Jerseys"],
              ["APPAREL", "Apparel"],
              ["ACCESSORY", "Accessories"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? "selected" : ""}
                onClick={() => setFilter(value)}
              >
                {label}
                {filter === value && <span>●</span>}
              </button>
            ))}
          </div>

          <div className="tz-product-stack">
            {loading ? (
              <div className="tz-empty">Loading catalogue...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="tz-empty">No matching products.</div>
            ) : (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  className={`tz-product-card ${
                    editing?.id === product.id ? "active" : ""
                  }`}
                  onClick={() => openEdit(product)}
                >
                  <div className="tz-product-thumb">
                    {imagePreview(product.image_url, product.name)}
                  </div>
                  <div className="tz-product-card-info">
                    <strong>{product.name}</strong>
                    <span>{product.collection_title || product.category}</span>
                    <small>{money(product.price_paise)}</small>
                  </div>
                  <span
                    className={`tz-status-dot ${
                      product.publication_status === "PUBLISHED"
                        ? "published"
                        : product.publication_status === "ARCHIVED"
                          ? "archived"
                          : ""
                    }`}
                  />
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="tz-editor">
          {!isCreating && !editing ? (
            <div className="tz-welcome">
              <div className="tz-welcome-mark">T</div>
              <div className="tz-kicker">THE TURFZY MARKETPLACE</div>
              <h3>Build your next drop.</h3>
              <p>
                Create a product, curate its presentation and control how it
                appears across the marketplace.
              </p>
              <button className="tz-primary-button" onClick={openNew}>
                CREATE YOUR FIRST PRODUCT
              </button>
              <div className="tz-welcome-foot">
                PREMIUM MERCHANDISE / ONE STANDARD
              </div>
            </div>
          ) : (
            <>
              <div className="tz-editor-top">
                <div>
                  <div className="tz-kicker">
                    {editing ? "PRODUCT / EDITOR" : "NEW PRODUCT / EDITOR"}
                  </div>
                  <h3>{form.name || "Untitled product"}</h3>
                  <span className="tz-editor-sub">
                    {form.collection_title || "Untitled collection"} ·{" "}
                    {form.category}
                  </span>
                </div>

                <button
                  className="tz-quiet-button"
                  onClick={() => setPreview((value) => !value)}
                >
                  {preview ? "CLOSE PREVIEW" : "LIVE PREVIEW ↗"}
                </button>
              </div>

              <nav className="tz-tabs">
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    className={tab === item.id ? "active" : ""}
                    onClick={() => setTab(item.id)}
                  >
                    <small>{item.number}</small>
                    {item.label}
                  </button>
                ))}
              </nav>

              {preview ? (
                <div className="tz-preview">
                  <div className="tz-preview-heading">
                    <span>LIVE PRODUCT PREVIEW</span>
                    <span>MARKETPLACE / PRODUCT</span>
                  </div>

                  <div className="tz-preview-card">
                    <div className="tz-preview-image">
                      {form.hero_layout === "LAYERED" && previewPlayer && (
                        <img
                          className="tz-preview-player"
                          src={previewPlayer}
                          alt="Player"
                          style={{
                            objectPosition: form.player_image_position,
                            opacity: form.player_image_opacity,
                          }}
                        />
                      )}

                      {previewMain && (
                        <img
                          className="tz-preview-main"
                          src={previewMain}
                          alt={form.name || "Product"}
                          style={{
                            objectPosition: form.hero_image_position,
                          }}
                        />
                      )}

                      {form.featured && (
                        <span className="tz-featured-tag">FEATURED</span>
                      )}
                    </div>

                    <div className="tz-preview-copy">
                      <div className="tz-kicker">
                        {form.brand_name || "TURFZY ORIGINALS"}
                      </div>
                      <h3>{form.name || "Product name"}</h3>
                      <p>
                        {form.collection_title || "Collection title"}
                        {form.collection_year
                          ? ` · ${form.collection_year}`
                          : ""}
                      </p>
                      <div className="tz-preview-price">
                        {form.sale_price && activeSale ? (
                          <>
                            <strong>₹{form.sale_price}</strong>
                            <del>₹{form.regular_price}</del>
                          </>
                        ) : (
                          <strong>₹{form.regular_price || "0"}</strong>
                        )}
                      </div>
                      <p className="tz-preview-description">
                        {form.description || "Product description"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="tz-tab-content">
                  {tab === "identity" && (
                    <div className="tz-section">
                      <div className="tz-section-title">
                        <div>
                          <span>01 / PRODUCT IDENTITY</span>
                          <h4>Define the product.</h4>
                        </div>
                        <small>CORE INFORMATION</small>
                      </div>

                      <label>
                        {fieldLabel("Product name", true)}
                        <input
                          value={form.name}
                          maxLength={100}
                          placeholder="e.g. Barcelona Heritage Jersey"
                          onChange={(e) =>
                            patchForm("name", e.target.value)
                          }
                        />
                      </label>

                      <div className="tz-grid-2">
                        <label>
                          {fieldLabel("Brand")}
                          <input
                            value={form.brand_name}
                            placeholder="e.g. Nike"
                            onChange={(e) =>
                              patchForm("brand_name", e.target.value)
                            }
                          />
                        </label>

                        <label>
                          {fieldLabel("Category", true)}
                          <select
                            value={form.category}
                            onChange={(e) =>
                              patchForm(
                                "category",
                                e.target.value as Category
                              )
                            }
                          >
                            <option value="JERSEY">Jersey</option>
                            <option value="APPAREL">Apparel</option>
                            <option value="ACCESSORY">Accessory</option>
                          </select>
                        </label>

                        <label>
                          {fieldLabel("Collection title")}
                          <input
                            value={form.collection_title}
                            placeholder="Heritage Collection"
                            onChange={(e) =>
                              patchForm("collection_title", e.target.value)
                            }
                          />
                        </label>

                        <label>
                          {fieldLabel("Collection year")}
                          <input
                            type="number"
                            min="1900"
                            max="2200"
                            value={form.collection_year}
                            placeholder="2004"
                            onChange={(e) =>
                              patchForm("collection_year", e.target.value)
                            }
                          />
                        </label>

                        <label>
                          {fieldLabel("Product SKU")}
                          <input
                            value={form.sku}
                            placeholder="TZ-BAR-001"
                            onChange={(e) =>
                              patchForm("sku", e.target.value)
                            }
                          />
                        </label>

                        <label>
                          {fieldLabel("Product type")}
                          <select
                            value={form.product_type}
                            onChange={(e) =>
                              patchForm(
                                "product_type",
                                e.target.value as ProductType
                              )
                            }
                          >
                            <option value="SIMPLE">Simple product</option>
                            <option value="VARIABLE">Variable product</option>
                          </select>
                        </label>
                      </div>

                      <label>
                        {fieldLabel("Description")}
                        <textarea
                          rows={5}
                          maxLength={5000}
                          value={form.description}
                          placeholder="Describe the product, its details, construction and identity..."
                          onChange={(e) =>
                            patchForm("description", e.target.value)
                          }
                        />
                        <small className="tz-hint">
                          {form.description.length}/5000 characters
                        </small>
                      </label>

                      <div className="tz-feature-panel">
                        <div>
                          <strong>FEATURED PRODUCT</strong>
                          <p>Give this product priority in merchandising.</p>
                        </div>
                        <button
                          className={`tz-toggle ${
                            form.featured ? "on" : ""
                          }`}
                          onClick={() =>
                            patchForm("featured", !form.featured)
                          }
                          type="button"
                          aria-pressed={form.featured}
                        >
                          <span />
                        </button>
                      </div>
                    </div>
                  )}

                  {tab === "media" && (
                    <div className="tz-section">
                      <div className="tz-section-title">
                        <div>
                          <span>02 / VISUAL DIRECTION</span>
                          <h4>Control the presentation.</h4>
                        </div>
                        <small>PRODUCT IMAGERY</small>
                      </div>

                      <div className="tz-media-layout">
                        <div className="tz-main-upload">
                          <div className="tz-media-label">
                            MAIN PRODUCT IMAGE
                          </div>
                          <button
                            type="button"
                            className="tz-upload-main"
                            onClick={() => mainInput.current?.click()}
                          >
                            {previewMain ? (
                              <img src={previewMain} alt="Main product" />
                            ) : (
                              <div>
                                <span>＋</span>
                                <strong>UPLOAD MAIN IMAGE</strong>
                                <small>JPG / PNG / WEBP · MAX 5 MB</small>
                              </div>
                            )}
                          </button>
                          <input
                            ref={mainInput}
                            hidden
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              if (!file) return;
                              if (
                                file.size > 5 * 1024 * 1024 ||
                                ![
                                  "image/jpeg",
                                  "image/png",
                                  "image/webp",
                                ].includes(file.type)
                              ) {
                                setErrorMessage("Invalid main image.");
                                return;
                              }
                              setMainImage(file);
                              setErrorMessage("");
                            }}
                          />
                        </div>

                        <div className="tz-media-controls">
                          <label>
                            {fieldLabel("Visual mode")}
                            <select
                              value={form.hero_layout}
                              onChange={(e) =>
                                patchForm(
                                  "hero_layout",
                                  e.target.value as HeroLayout
                                )
                              }
                            >
                              <option value="ORIGINAL">
                                Original artwork
                              </option>
                              <option value="LAYERED">
                                Layered player portrait
                              </option>
                            </select>
                          </label>

                          <label>
                            {fieldLabel("Main image position")}
                            <select
                              value={form.hero_image_position}
                              onChange={(e) =>
                                patchForm(
                                  "hero_image_position",
                                  e.target.value
                                )
                              }
                            >
                              <option value="50% 50%">Centre</option>
                              <option value="50% 20%">Top</option>
                              <option value="50% 80%">Bottom</option>
                              <option value="20% 50%">Left</option>
                              <option value="80% 50%">Right</option>
                            </select>
                          </label>

                          {form.hero_layout === "LAYERED" && (
                            <>
                              <label>
                                {fieldLabel("Player image position")}
                                <select
                                  value={form.player_image_position}
                                  onChange={(e) =>
                                    patchForm(
                                      "player_image_position",
                                      e.target.value
                                    )
                                  }
                                >
                                  <option value="50% 50%">Centre</option>
                                  <option value="50% 20%">Top</option>
                                  <option value="50% 80%">Bottom</option>
                                  <option value="20% 50%">Left</option>
                                  <option value="80% 50%">Right</option>
                                </select>
                              </label>

                              <label>
                                {fieldLabel("Player image opacity")}
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={form.player_image_opacity}
                                  onChange={(e) =>
                                    patchForm(
                                      "player_image_opacity",
                                      Number(e.target.value)
                                    )
                                  }
                                />
                                <small className="tz-hint">
                                  {Math.round(
                                    form.player_image_opacity * 100
                                  )}
                                  % opacity
                                </small>
                              </label>

                              <div className="tz-player-upload">
                                <div className="tz-media-label">
                                  PLAYER PORTRAIT
                                </div>
                                {previewPlayer ? (
                                  <div className="tz-player-preview">
                                    <img src={previewPlayer} alt="Player" />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPlayerImage(null);
                                        setClearPlayerImage(true);
                                        if (playerInput.current) {
                                          playerInput.current.value = "";
                                        }
                                      }}
                                    >
                                      REMOVE
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="tz-secondary-button"
                                    onClick={() =>
                                      playerInput.current?.click()
                                    }
                                  >
                                    ＋ ADD PLAYER IMAGE
                                  </button>
                                )}
                                <input
                                  ref={playerInput}
                                  hidden
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  onChange={(e) => {
                                    const file =
                                      e.target.files?.[0] ?? null;
                                    if (!file) return;
                                    if (
                                      file.size > 5 * 1024 * 1024 ||
                                      ![
                                        "image/jpeg",
                                        "image/png",
                                        "image/webp",
                                      ].includes(file.type)
                                    ) {
                                      setErrorMessage(
                                        "Invalid player image."
                                      );
                                      return;
                                    }
                                    setPlayerImage(file);
                                    setClearPlayerImage(false);
                                    setErrorMessage("");
                                  }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="tz-gallery-heading">
                        <div>
                          <strong>PRODUCT GALLERY</strong>
                          <small>
                            {galleryUrls.length + galleryFiles.length}/12
                            IMAGES
                          </small>
                        </div>
                        <button
                          type="button"
                          className="tz-secondary-button"
                          onClick={() => galleryInput.current?.click()}
                          disabled={
                            galleryUrls.length + galleryFiles.length >= 12
                          }
                        >
                          ＋ ADD IMAGES
                        </button>
                      </div>

                      <input
                        ref={galleryInput}
                        hidden
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => addGalleryFiles(e.target.files)}
                      />

                      <div className="tz-gallery">
                        {[
                          ...galleryUrls.map((url, index) => ({
                            url,
                            index,
                            key: `url-${index}`,
                          })),
                          ...galleryFiles.map((file, index) => ({
                            url: URL.createObjectURL(file),
                            index: galleryUrls.length + index,
                            key: `file-${index}`,
                          })),
                        ].map((image) => (
                          <div className="tz-gallery-item" key={image.key}>
                            <img src={image.url} alt="Gallery image" />
                            <div>
                              <button
                                type="button"
                                onClick={() => setAsMain(image.index)}
                              >
                                MAKE MAIN
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  removeGalleryImage(image.index)
                                }
                              >
                                REMOVE
                              </button>
                            </div>
                          </div>
                        ))}
                        {galleryUrls.length + galleryFiles.length === 0 && (
                          <div className="tz-gallery-empty">
                            No additional images. Add images to build your
                            product gallery.
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {tab === "pricing" && (
                    <div className="tz-section">
                      <div className="tz-section-title">
                        <div>
                          <span>03 / COMMERCIAL SETTINGS</span>
                          <h4>Set the price.</h4>
                        </div>
                        <small>INR / ₹</small>
                      </div>

                      <div className="tz-grid-2">
                        <label>
                          {fieldLabel("Regular price (₹)", true)}
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.regular_price}
                            onChange={(e) =>
                              patchForm("regular_price", e.target.value)
                            }
                          />
                        </label>

                        <label>
                          {fieldLabel("Sale price (₹)")}
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={form.sale_price}
                            onChange={(e) =>
                              patchForm("sale_price", e.target.value)
                            }
                          />
                        </label>
                      </div>

                      {form.sale_price && (
                        <div className="tz-sale-status">
                          {activeSale ? (
                            <>
                              <span>✓</span>
                              Valid sale price ·{" "}
                              {Math.round(
                                (1 -
                                  Number(form.sale_price) /
                                    Number(form.regular_price)) *
                                  100
                              )}
                              % discount
                            </>
                          ) : (
                            <span>Sale price must not exceed regular price.</span>
                          )}
                        </div>
                      )}

                      <div className="tz-grid-2">
                        <label>
                          {fieldLabel("Sale starts")}
                          <input
                            type="datetime-local"
                            value={form.sale_start_at}
                            onChange={(e) =>
                              patchForm("sale_start_at", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          {fieldLabel("Sale ends")}
                          <input
                            type="datetime-local"
                            value={form.sale_end_at}
                            onChange={(e) =>
                              patchForm("sale_end_at", e.target.value)
                            }
                          />
                        </label>
                      </div>

                      <div className="tz-price-card">
                        <div>
                          <span>REGULAR PRICE</span>
                          <strong>
                            {money(toPaise(form.regular_price))}
                          </strong>
                        </div>
                        <div>
                          <span>SALE PRICE</span>
                          <strong>
                            {form.sale_price
                              ? money(toPaise(form.sale_price))
                              : "—"}
                          </strong>
                        </div>
                        <div>
                          <span>PREORDER</span>
                          <strong>
                            {form.allow_preorder ? "ENABLED" : "DISABLED"}
                          </strong>
                        </div>
                      </div>

                      <div className="tz-feature-panel">
                        <div>
                          <strong>ALLOW PREORDERS</strong>
                          <p>Mark products as available for preorder.</p>
                        </div>
                        <button
                          type="button"
                          className={`tz-toggle ${
                            form.allow_preorder ? "on" : ""
                          }`}
                          onClick={() =>
                            patchForm(
                              "allow_preorder",
                              !form.allow_preorder
                            )
                          }
                          aria-pressed={form.allow_preorder}
                        >
                          <span />
                        </button>
                      </div>
                    </div>
                  )}

                  {tab === "inventory" && (
                    <div className="tz-section">
                      <div className="tz-section-title">
                        <div>
                          <span>04 / STOCK CONTROL</span>
                          <h4>Manage availability.</h4>
                        </div>
                        <small>INVENTORY</small>
                      </div>

                      {form.product_type === "SIMPLE" ? (
                        <>
                          <div className="tz-grid-2">
                            <label>
                              {fieldLabel("Stock quantity")}
                              <input
                                type="number"
                                min="0"
                                max="100000"
                                value={form.stock_quantity}
                                onChange={(e) =>
                                  patchForm(
                                    "stock_quantity",
                                    e.target.value
                                  )
                                }
                              />
                            </label>

                            <label>
                              {fieldLabel("Available sizes")}
                              <input
                                value={form.sizes}
                                placeholder="S, M, L, XL"
                                onChange={(e) =>
                                  patchForm("sizes", e.target.value)
                                }
                              />
                            </label>
                          </div>
                          <div className="tz-hint-panel">
                            Simple products use one shared stock quantity.
                            Sizes are informational and do not have separate
                            inventory records.
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="tz-variant-add">
                            <label>
                              {fieldLabel("Size")}
                              <input
                                value={variantSize}
                                placeholder="XL"
                                onChange={(e) =>
                                  setVariantSize(e.target.value)
                                }
                              />
                            </label>
                            <label>
                              {fieldLabel("Stock")}
                              <input
                                type="number"
                                min="0"
                                value={variantStock}
                                onChange={(e) =>
                                  setVariantStock(e.target.value)
                                }
                              />
                            </label>
                            <label>
                              {fieldLabel("SKU")}
                              <input
                                value={variantSku}
                                placeholder="TZ-XL-01"
                                onChange={(e) =>
                                  setVariantSku(e.target.value)
                                }
                              />
                            </label>
                            <label>
                              {fieldLabel("Price override (₹)")}
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={variantPrice}
                                onChange={(e) =>
                                  setVariantPrice(e.target.value)
                                }
                              />
                            </label>
                            <button
                              type="button"
                              className="tz-primary-button"
                              onClick={addVariant}
                            >
                              ADD SIZE
                            </button>
                          </div>

                          <div className="tz-variant-table">
                            <div className="tz-variant-header">
                              <span>SIZE</span>
                              <span>SKU</span>
                              <span>STOCK</span>
                              <span>PRICE</span>
                              <span>STATUS</span>
                              <span />
                            </div>
                            {variants.map((variant, index) => (
                              <div
                                className="tz-variant-row"
                                key={`${variant.size}-${index}`}
                              >
                                <strong>{variant.size}</strong>
                                <input
                                  value={variant.sku}
                                  aria-label={`SKU for ${variant.size}`}
                                  onChange={(e) =>
                                    updateVariant(index, {
                                      sku: e.target.value,
                                    })
                                  }
                                />
                                <input
                                  type="number"
                                  min="0"
                                  value={variant.stock_quantity}
                                  aria-label={`Stock for ${variant.size}`}
                                  onChange={(e) =>
                                    updateVariant(index, {
                                      stock_quantity: Number(e.target.value),
                                    })
                                  }
                                />
                                <span>
                                  {variant.price_paise == null
                                    ? "Default"
                                    : money(variant.price_paise)}
                                </span>
                                <button
                                  type="button"
                                  className={`tz-mini-status ${
                                    variant.active ? "on" : ""
                                  }`}
                                  onClick={() =>
                                    updateVariant(index, {
                                      active: !variant.active,
                                    })
                                  }
                                >
                                  {variant.active ? "ACTIVE" : "OFF"}
                                </button>
                                <button
                                  type="button"
                                  className="tz-remove"
                                  onClick={() => removeVariant(index)}
                                  aria-label={`Remove size ${variant.size}`}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                            {variants.length === 0 && (
                              <div className="tz-gallery-empty">
                                Add your first size variant.
                              </div>
                            )}
                          </div>

                          <div className="tz-stock-total">
                            <span>TOTAL ACTIVE STOCK</span>
                            <strong>
                              {variants.reduce(
                                (total, variant) =>
                                  total +
                                  (variant.active
                                    ? variant.stock_quantity
                                    : 0),
                                0
                              )}
                            </strong>
                          </div>
                        </>
                      )}

                      <div className="tz-grid-2">
                        <label>
                          {fieldLabel("Dimensions")}
                          <input
                            value={form.dimensions}
                            placeholder="30 × 20 × 5 cm"
                            onChange={(e) =>
                              patchForm("dimensions", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          {fieldLabel("Weight (kg)")}
                          <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={form.weight_kg}
                            onChange={(e) =>
                              patchForm("weight_kg", e.target.value)
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {tab === "marketing" && (
                    <div className="tz-section">
                      <div className="tz-section-title">
                        <div>
                          <span>05 / MERCHANDISING</span>
                          <h4>Position the product.</h4>
                        </div>
                        <small>DISCOVERY & SEO</small>
                      </div>

                      <label>
                        {fieldLabel("Product tags")}
                        <input
                          value={form.product_tags}
                          placeholder="Heritage, Barcelona, Retro, Football"
                          onChange={(e) =>
                            patchForm("product_tags", e.target.value)
                          }
                        />
                        <small className="tz-hint">
                          Separate tags with commas.
                        </small>
                      </label>

                      <div className="tz-grid-2">
                        <label>
                          {fieldLabel("Display order")}
                          <input
                            type="number"
                            value={form.sort_order}
                            onChange={(e) =>
                              patchForm("sort_order", e.target.value)
                            }
                          />
                        </label>
                        <label>
                          {fieldLabel("Publication status")}
                          <select
                            value={form.publication_status}
                            onChange={(e) =>
                              patchForm(
                                "publication_status",
                                e.target.value as PublicationStatus
                              )
                            }
                          >
                            <option value="DRAFT">Draft</option>
                            <option value="PUBLISHED">Published</option>
                            <option value="ARCHIVED">Archived</option>
                          </select>
                        </label>
                      </div>

                      <div className="tz-divider" />

                      <div className="tz-section-title">
                        <div>
                          <span>SEARCH ENGINE OPTIMISATION</span>
                          <h4>Search presentation.</h4>
                        </div>
                        <small>SEO</small>
                      </div>

                      <label>
                        {fieldLabel("SEO title")}
                        <input
                          maxLength={70}
                          value={form.seo_title}
                          placeholder="Product title for search engines"
                          onChange={(e) =>
                            patchForm("seo_title", e.target.value)
                          }
                        />
                        <small className="tz-hint">
                          {form.seo_title.length}/70 characters
                        </small>
                      </label>

                      <label>
                        {fieldLabel("SEO description")}
                        <textarea
                          rows={4}
                          maxLength={200}
                          value={form.seo_description}
                          placeholder="Concise search result description..."
                          onChange={(e) =>
                            patchForm("seo_description", e.target.value)
                          }
                        />
                        <small className="tz-hint">
                          {form.seo_description.length}/200 characters
                        </small>
                      </label>

                      <div className="tz-hint-panel">
                        SEO metadata is saved with the product. The public
                        product page must also render these fields for search
                        engines to use them.
                      </div>
                    </div>
                  )}
                </div>
              )}

              <footer className="tz-editor-footer">
                <div className="tz-footer-left">
                  <button
                    type="button"
                    className="tz-quiet-button"
                    onClick={resetEditor}
                    disabled={saving}
                  >
                    CANCEL
                  </button>
                  {editing && (
                    <button
                      type="button"
                      className="tz-danger-button"
                      onClick={() => void deleteProduct(editing)}
                      disabled={saving}
                    >
                      DELETE PRODUCT
                    </button>
                  )}
                </div>

                <div className="tz-footer-right">
                  <button
                    type="button"
                    className="tz-secondary-button"
                    onClick={() => void saveProduct("DRAFT")}
                    disabled={saving}
                  >
                    SAVE DRAFT
                  </button>
                  <button
                    type="button"
                    className="tz-primary-button"
                    onClick={() =>
                      void saveProduct(
                        form.publication_status === "ARCHIVED"
                          ? "ARCHIVED"
                          : "PUBLISHED"
                      )
                    }
                    disabled={saving}
                  >
                    {saving
                      ? "SAVING..."
                      : form.publication_status === "ARCHIVED"
                        ? "SAVE ARCHIVE"
                        : "SAVE & PUBLISH"}
                  </button>
                </div>
              </footer>
            </>
          )}
        </main>
      </div>

      <style jsx>{`
        .tz-manager {
          --gold: #d9bd7b;
          --gold-dim: rgba(217, 189, 123, 0.2);
          --emerald: #83c99c;
          --panel: #0b110e;
          --panel-2: #101813;
          --line: rgba(217, 189, 123, 0.15);
          display: grid;
          gap: 20px;
          color: #e9eee9;
          min-width: 0;
        }

        .tz-manager * { box-sizing: border-box; }

        .tz-heading,
        .tz-editor-top,
        .tz-section-title,
        .tz-sidebar-heading,
        .tz-gallery-heading,
        .tz-editor-footer,
        .tz-footer-left,
        .tz-footer-right {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }

        .tz-kicker {
          color: var(--gold);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 2.2px;
        }

        .tz-heading h2 {
          margin: 7px 0;
          font-size: clamp(27px, 4vw, 38px);
          letter-spacing: -1.3px;
          font-weight: 800;
        }

        .tz-heading p,
        .tz-editor-sub {
          color: #929e95;
          font-size: 12px;
          margin: 0;
        }

        .tz-primary-button,
        .tz-secondary-button,
        .tz-quiet-button,
        .tz-danger-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 39px;
          padding: 10px 15px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1px;
          transition: .18s ease;
        }

        .tz-primary-button {
          color: #11150f;
          background: linear-gradient(135deg, #ead49c, #c6a45e);
          border: 1px solid #e6ce92;
        }

        .tz-primary-button:hover {
          filter: brightness(1.12);
          transform: translateY(-1px);
        }

        .tz-secondary-button {
          color: var(--gold);
          background: rgba(217, 189, 123, .05);
          border: 1px solid rgba(217, 189, 123, .38);
        }

        .tz-quiet-button {
          color: #aab4ac;
          background: transparent;
          border: 1px solid var(--line);
        }

        .tz-danger-button {
          color: #e5a69b;
          background: transparent;
          border: 1px solid rgba(229, 166, 155, .3);
        }

        button:disabled {
          opacity: .45;
          cursor: not-allowed;
          transform: none !important;
        }

        .tz-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border: 1px solid var(--line);
          background: linear-gradient(120deg, #0e1711, #0a100d);
        }

        .tz-stat {
          display: grid;
          gap: 9px;
          padding: 16px 19px;
          border-right: 1px solid var(--line);
        }

        .tz-stat:last-child { border: 0; }

        .tz-stat span {
          color: #89968c;
          font-size: 8px;
          letter-spacing: 1.5px;
        }

        .tz-stat strong {
          color: var(--gold);
          font-size: 25px;
          font-weight: 700;
        }

        .tz-notice {
          padding: 12px 15px;
          border-radius: 5px;
          font-size: 12px;
        }

        .tz-success {
          color: #a8e1b8;
          border: 1px solid rgba(131, 201, 156, .3);
          background: rgba(131, 201, 156, .07);
        }

        .tz-error {
          color: #efb1a8;
          border: 1px solid rgba(239, 177, 168, .3);
          background: rgba(239, 177, 168, .07);
        }

        .tz-workspace {
          display: grid;
          grid-template-columns: minmax(215px, 270px) minmax(0, 1fr);
          min-height: 680px;
          border: 1px solid var(--line);
          background: #080e0b;
        }

        .tz-sidebar {
          display: flex;
          flex-direction: column;
          min-width: 0;
          padding: 16px;
          border-right: 1px solid var(--line);
          background: #0b120e;
        }

        .tz-sidebar-heading span:first-child {
          color: var(--gold);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.4px;
        }

        .tz-sidebar-heading span:last-child {
          color: #78867b;
          font-size: 10px;
        }

        .tz-search,
        .tz-manager input:not([type="file"]):not([type="range"]),
        .tz-manager textarea,
        .tz-manager select {
          width: 100%;
          min-width: 0;
          padding: 11px 12px;
          color: #f1f0e8;
          background: #101a13;
          border: 1px solid rgba(217, 189, 123, .18);
          border-radius: 4px;
          outline: none;
          font: inherit;
          font-size: 12px;
        }

        .tz-manager input:focus,
        .tz-manager textarea:focus,
        .tz-manager select:focus {
          border-color: rgba(217, 189, 123, .7);
          box-shadow: 0 0 0 2px rgba(217, 189, 123, .07);
        }

        .tz-search { margin: 15px 0; }

        .tz-filters {
          display: grid;
          gap: 3px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--line);
        }

        .tz-filters button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px 10px;
          color: #96a198;
          text-align: left;
          background: transparent;
          border: 0;
          border-radius: 3px;
          cursor: pointer;
          font-size: 11px;
        }

        .tz-filters button.selected {
          color: var(--gold);
          background: rgba(217, 189, 123, .08);
        }

        .tz-filters button span {
          color: var(--gold);
          font-size: 7px;
        }

        .tz-product-stack {
          display: grid;
          gap: 6px;
          padding-top: 12px;
          overflow: auto;
          max-height: 550px;
        }

        .tz-product-card {
          display: grid;
          grid-template-columns: 45px minmax(0, 1fr) 7px;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 8px;
          text-align: left;
          color: inherit;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          cursor: pointer;
        }

        .tz-product-card.active {
          border-color: rgba(217, 189, 123, .3);
          background: rgba(217, 189, 123, .06);
        }

        .tz-product-thumb {
          width: 45px;
          height: 48px;
          overflow: hidden;
          background: #1a241d;
          border-radius: 3px;
        }

        .tz-product-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .tz-product-card-info {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .tz-product-card-info strong,
        .tz-product-card-info span,
        .tz-product-card-info small {
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .tz-product-card-info strong {
          color: #e8ecdf;
          font-size: 11px;
        }

        .tz-product-card-info span {
          color: #849188;
          font-size: 9px;
        }

        .tz-product-card-info small {
          color: var(--gold);
          font-size: 10px;
        }

        .tz-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #a18c65;
        }

        .tz-status-dot.published { background: #78c996; }
        .tz-status-dot.archived { background: #82908a; }

        .tz-editor {
          display: flex;
          flex-direction: column;
          min-width: 0;
          padding: 22px;
        }

        .tz-editor-top {
          align-items: flex-start;
          padding-bottom: 19px;
          border-bottom: 1px solid var(--line);
        }

        .tz-editor-top h3 {
          margin: 6px 0;
          font-size: 22px;
          letter-spacing: -.5px;
        }

        .tz-tabs {
          display: flex;
          gap: 5px;
          overflow-x: auto;
          padding: 13px 0;
          border-bottom: 1px solid var(--line);
        }

        .tz-tabs button {
          display: grid;
          gap: 6px;
          flex: 1;
          min-width: 76px;
          padding: 9px 8px;
          color: #839087;
          background: transparent;
          border: 0;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .8px;
        }

        .tz-tabs button small {
          color: #68766c;
          font-size: 8px;
        }

        .tz-tabs button.active {
          color: var(--gold);
          border-bottom-color: var(--gold);
        }

        .tz-tabs button.active small { color: var(--gold); }

        .tz-tab-content {
          flex: 1;
          padding: 25px 0;
        }

        .tz-section {
          display: grid;
          gap: 19px;
          max-width: 800px;
        }

        .tz-section-title {
          align-items: flex-start;
          margin-bottom: 2px;
        }

        .tz-section-title span,
        .tz-section-title small {
          color: var(--gold);
          font-size: 8px;
          letter-spacing: 1.5px;
          font-weight: 800;
        }

        .tz-section-title h4 {
          margin: 6px 0 0;
          font-size: 19px;
          font-weight: 700;
        }

        .tz-section-title small { color: #718078; }

        .tz-section label {
          display: grid;
          gap: 8px;
          min-width: 0;
          color: #aeb8af;
          font-size: 11px;
        }

        .field-label {
          color: #bdc6bd;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .3px;
        }

        .field-label i {
          color: #dcae74;
          font-style: normal;
        }

        .tz-manager textarea {
          resize: vertical;
          line-height: 1.6;
        }

        .tz-manager select { cursor: pointer; }

        .tz-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 15px;
        }

        .tz-hint {
          color: #758279;
          font-size: 9px;
        }

        .tz-feature-panel {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 15px;
          background: rgba(217, 189, 123, .035);
          border: 1px solid var(--line);
          border-radius: 4px;
        }

        .tz-feature-panel strong {
          color: #d7dfd5;
          font-size: 10px;
          letter-spacing: 1px;
        }

        .tz-feature-panel p {
          margin: 5px 0 0;
          color: #859188;
          font-size: 10px;
        }

        .tz-toggle {
          flex: 0 0 auto;
          width: 39px;
          height: 21px;
          padding: 3px;
          border: 1px solid #435148;
          border-radius: 20px;
          background: #18221b;
          cursor: pointer;
        }

        .tz-toggle span {
          display: block;
          width: 13px;
          height: 13px;
          border-radius: 50%;
          background: #879188;
          transition: .2s ease;
        }

        .tz-toggle.on {
          background: rgba(131, 201, 156, .15);
          border-color: #77bd91;
        }

        .tz-toggle.on span {
          transform: translateX(17px);
          background: #83c99c;
        }

        .tz-media-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr);
          gap: 20px;
        }

        .tz-media-label {
          margin-bottom: 9px;
          color: var(--gold);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.2px;
        }

        .tz-upload-main {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          min-height: 310px;
          overflow: hidden;
          color: var(--gold);
          background:
            radial-gradient(ellipse at center, #17241b 0%, #0a100d 70%);
          border: 1px dashed rgba(217, 189, 123, .35);
          cursor: pointer;
        }

        .tz-upload-main img {
          width: 100%;
          height: 310px;
          object-fit: contain;
        }

        .tz-upload-main div {
          display: grid;
          gap: 10px;
          text-align: center;
        }

        .tz-upload-main div span {
          font-size: 35px;
          font-weight: 200;
        }

        .tz-upload-main strong {
          font-size: 10px;
          letter-spacing: 1px;
        }

        .tz-upload-main small {
          color: #7f8c82;
          font-size: 8px;
        }

        .tz-media-controls {
          display: grid;
          align-content: start;
          gap: 16px;
        }

        .tz-player-upload {
          display: grid;
          gap: 10px;
        }

        .tz-player-preview {
          display: grid;
          gap: 7px;
        }

        .tz-player-preview img {
          width: 100%;
          height: 115px;
          object-fit: contain;
          background: #101a13;
        }

        .tz-player-preview button,
        .tz-gallery-item button {
          color: #e0b5a8;
          background: transparent;
          border: 1px solid rgba(224, 181, 168, .3);
          padding: 7px;
          cursor: pointer;
          font-size: 8px;
          letter-spacing: .7px;
        }

        .tz-gallery-heading {
          margin-top: 8px;
        }

        .tz-gallery-heading div {
          display: grid;
          gap: 5px;
        }

        .tz-gallery-heading strong {
          color: #e3e9e1;
          font-size: 10px;
          letter-spacing: 1px;
        }

        .tz-gallery-heading small {
          color: #758279;
          font-size: 8px;
        }

        .tz-gallery {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .tz-gallery-item {
          display: grid;
          gap: 6px;
          min-width: 0;
          padding: 6px;
          border: 1px solid var(--line);
          background: #0c140f;
        }

        .tz-gallery-item img {
          width: 100%;
          height: 105px;
          object-fit: cover;
        }

        .tz-gallery-item div {
          display: grid;
          gap: 4px;
        }

        .tz-gallery-empty,
        .tz-empty {
          padding: 24px 12px;
          color: #7e8b82;
          text-align: center;
          font-size: 10px;
          border: 1px dashed var(--line);
        }

        .tz-sale-status {
          padding: 11px 13px;
          color: #9ed9ac;
          background: rgba(131, 201, 156, .06);
          border: 1px solid rgba(131, 201, 156, .2);
          font-size: 10px;
        }

        .tz-price-card {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          padding: 14px;
          background: #0d1710;
          border: 1px solid var(--line);
        }

        .tz-price-card div {
          display: grid;
          gap: 7px;
          padding: 5px 12px;
          border-right: 1px solid var(--line);
        }

        .tz-price-card div:last-child { border: 0; }

        .tz-price-card span {
          color: #7e8c81;
          font-size: 8px;
          letter-spacing: 1px;
        }

        .tz-price-card strong {
          color: var(--gold);
          font-size: 15px;
        }

        .tz-variant-add {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 14px;
          background: #0c150f;
          border: 1px solid var(--line);
        }

        .tz-variant-add .tz-primary-button {
          align-self: end;
        }

        .tz-variant-table {
          overflow-x: auto;
          border: 1px solid var(--line);
        }

        .tz-variant-header,
        .tz-variant-row {
          display: grid;
          grid-template-columns: 55px minmax(85px, 1fr) 65px 75px 65px 25px;
          align-items: center;
          gap: 8px;
          min-width: 440px;
          padding: 9px;
        }

        .tz-variant-header {
          color: var(--gold);
          background: #111a13;
          font-size: 8px;
          letter-spacing: .7px;
        }

        .tz-variant-row {
          border-top: 1px solid var(--line);
          font-size: 10px;
        }

        .tz-variant-row input {
          padding: 7px !important;
          font-size: 10px !important;
        }

        .tz-mini-status {
          padding: 6px 4px;
          color: #d0ad76;
          background: transparent;
          border: 1px solid var(--line);
          font-size: 8px;
          cursor: pointer;
        }

        .tz-mini-status.on { color: #8fd3a5; }

        .tz-remove {
          color: #e4a79c;
          background: transparent;
          border: 0;
          cursor: pointer;
          font-size: 19px;
        }

        .tz-stock-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 13px;
          background: rgba(131, 201, 156, .06);
          border: 1px solid rgba(131, 201, 156, .2);
        }

        .tz-stock-total span {
          color: #9eb3a1;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .tz-stock-total strong {
          color: #9bd8ab;
          font-size: 19px;
        }

        .tz-hint-panel {
          padding: 12px;
          color: #9aa79d;
          background: rgba(217, 189, 123, .035);
          border: 1px solid var(--line);
          font-size: 10px;
          line-height: 1.6;
        }

        .tz-divider {
          height: 1px;
          background: var(--line);
          margin: 6px 0;
        }

        .tz-editor-footer {
          position: sticky;
          bottom: 0;
          z-index: 2;
          flex-wrap: wrap;
          padding: 13px 0 0;
          margin-top: auto;
          background: #080e0b;
          border-top: 1px solid var(--line);
        }

        .tz-footer-left,
        .tz-footer-right {
          flex-wrap: wrap;
        }

        .tz-welcome {
          display: grid;
          justify-items: center;
          align-content: center;
          min-height: 590px;
          padding: 30px;
          text-align: center;
          background:
            radial-gradient(ellipse at center, rgba(37, 62, 42, .32), transparent 65%);
        }

        .tz-welcome-mark {
          display: grid;
          place-items: center;
          width: 70px;
          height: 70px;
          margin-bottom: 22px;
          color: var(--gold);
          border: 1px solid rgba(217, 189, 123, .4);
          transform: rotate(45deg);
          font-size: 32px;
          font-weight: 800;
        }

        .tz-welcome-mark::first-letter {
          transform: rotate(-45deg);
        }

        .tz-welcome h3 {
          margin: 12px 0;
          font-size: clamp(25px, 4vw, 38px);
        }

        .tz-welcome p {
          max-width: 380px;
          margin: 0 0 23px;
          color: #96a197;
          font-size: 12px;
          line-height: 1.8;
        }

        .tz-welcome-foot {
          margin-top: 42px;
          color: #647269;
          font-size: 8px;
          letter-spacing: 2px;
        }

        .tz-preview {
          padding: 20px 0;
        }

        .tz-preview-heading {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: var(--gold);
          font-size: 8px;
          letter-spacing: 1.3px;
        }

        .tz-preview-card {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr);
          margin-top: 15px;
          background: #101812;
          border: 1px solid var(--line);
        }

        .tz-preview-image {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 340px;
          overflow: hidden;
          background: radial-gradient(ellipse, #28392b, #0c130e 75%);
        }

        .tz-preview-image img {
          position: absolute;
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .tz-preview-image .tz-preview-player {
          object-fit: cover;
        }

        .tz-featured-tag {
          position: absolute;
          top: 12px;
          left: 12px;
          padding: 7px 9px;
          color: #111;
          background: var(--gold);
          font-size: 8px;
          letter-spacing: 1px;
        }

        .tz-preview-copy {
          display: grid;
          align-content: center;
          gap: 12px;
          padding: 25px;
        }

        .tz-preview-copy h3 {
          margin: 0;
          font-size: 25px;
        }

        .tz-preview-copy p {
          margin: 0;
          color: #a0aaa1;
          font-size: 11px;
          line-height: 1.7;
        }

        .tz-preview-price {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--gold);
          font-size: 21px;
        }

        .tz-preview-price del {
          color: #89948b;
          font-size: 12px;
        }

        .tz-preview-description {
          max-width: 350px;
        }

        @media (max-width: 850px) {
          .tz-workspace {
            grid-template-columns: 1fr;
          }

          .tz-sidebar {
            border-right: 0;
            border-bottom: 1px solid var(--line);
            max-height: 390px;
          }

          .tz-product-stack { max-height: 180px; }

          .tz-editor { padding: 16px; }
        }

        @media (max-width: 600px) {
          .tz-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .tz-stats { grid-template-columns: repeat(2, 1fr); }

          .tz-stat:nth-child(2) { border-right: 0; }
          .tz-stat:nth-child(-n+2) { border-bottom: 1px solid var(--line); }

          .tz-grid-2,
          .tz-media-layout,
          .tz-preview-card {
            grid-template-columns: 1fr;
          }

          .tz-gallery {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tz-price-card { grid-template-columns: 1fr; }

          .tz-price-card div {
            border-right: 0;
            border-bottom: 1px solid var(--line);
            padding: 10px;
          }

          .tz-price-card div:last-child { border: 0; }

          .tz-editor-footer {
            align-items: stretch;
            flex-direction: column;
          }

          .tz-footer-left,
          .tz-footer-right {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .tz-footer-right button { width: 100%; }

          .tz-editor-top {
            align-items: flex-start;
            flex-direction: column;
          }

          .tz-variant-add { grid-template-columns: 1fr 1fr; }

          .tz-preview-image { min-height: 280px; }
        }
      `}</style>
    </section>
  );
}
