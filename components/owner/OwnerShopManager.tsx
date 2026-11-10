"use client";

import { useCallback, useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  description: string;
  category: "JERSEY" | "APPAREL" | "ACCESSORY";
  price_paise: number;
  image_url: string;
  sizes: string[];
  stock_quantity: number;
  active: boolean;
};

const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export default function OwnerShopManager() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Product["category"]>("JERSEY");
  const [price, setPrice] = useState("");
  const [sizes, setSizes] = useState("S, M, L, XL");
  const [stock, setStock] = useState("10");
  const [image, setImage] = useState<File | null>(null);

  const endpoint = "/api/owner/shop/products";

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(endpoint, { cache: "no-store" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not load products.");
      }

      setProducts(Array.isArray(result.products) ? result.products : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load products.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!image) {
      setMessage("Choose a product image first.");
      return;
    }

    const form = new FormData();
    form.set("name", name);
    form.set("description", description);
    form.set("category", category);
    form.set("price_rupees", price);
    form.set("sizes", sizes);
    form.set("stock_quantity", stock);
    form.set("active", "true");
    form.set("image", image);

    try {
      setSaving(true);
      const response = await fetch(endpoint, {
        method: "POST",
        body: form,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not create product.");
      }

      setName("");
      setDescription("");
      setPrice("");
      setSizes("S, M, L, XL");
      setStock("10");
      setImage(null);

      const fileInput = document.getElementById("shop-product-image") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      setMessage("Product created successfully.");
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create product.");
    } finally {
      setSaving(false);
    }
  }

  async function updateProduct(id: string, changes: Partial<Product>) {
    setMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...changes }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not update product.");
      }

      setMessage("Product updated.");
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update product.");
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Permanently delete "${product.name}"?`)) return;

    setMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: product.id }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Could not delete product.");
      }

      setMessage("Product deleted.");
      await loadProducts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete product.");
    }
  }

  return (
    <section className="owner-shop-manager">
      <div className="shop-manager-heading">
        <div>
          <div className="royal-kicker">COMMERCE / PRODUCT CONTROL</div>
          <h2>Shop inventory</h2>
          <p>Manage the products displayed in the TURFZY Shop.</p>
        </div>
        <div className="shop-manager-count">
          {products.length} PRODUCTS
        </div>
      </div>

      {message && (
        <div className="shop-manager-message" role="status">
          {message}
        </div>
      )}

      <form className="shop-product-form" onSubmit={createProduct}>
        <h3>ADD NEW PRODUCT</h3>

        <label>
          Product name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
        </label>

        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />
        </label>

        <div className="shop-form-grid">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value as Product["category"])}>
              <option value="JERSEY">Jersey</option>
              <option value="APPAREL">Apparel</option>
              <option value="ACCESSORY">Accessory</option>
            </select>
          </label>

          <label>
            Price (₹)
            <input type="number" min="0" max="1000000" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </label>

          <label>
            Stock quantity
            <input type="number" min="0" max="100000" step="1" value={stock} onChange={(e) => setStock(e.target.value)} required />
          </label>

          <label>
            Available sizes
            <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" />
          </label>
        </div>

        <label>
          Product image (JPG, PNG or WebP · max 5 MB)
          <input
            id="shop-product-image"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "PUBLISHING..." : "PUBLISH PRODUCT"}
        </button>
      </form>

      <div className="shop-inventory-heading">
        <h3>PRODUCT INVENTORY</h3>
        <button type="button" onClick={() => void loadProducts()}>REFRESH</button>
      </div>

      {loading ? (
        <p>Loading inventory...</p>
      ) : products.length === 0 ? (
        <p>No products added yet. Add your first product above.</p>
      ) : (
        <div className="shop-product-list">
          {products.map((product) => (
            <article className="shop-product-row" key={product.id}>
              <img src={product.image_url} alt={product.name} />
              <div className="shop-product-info">
                <strong>{product.name}</strong>
                <span>{product.category} · {money(product.price_paise)}</span>
                <span>Stock: {product.stock_quantity} · Sizes: {product.sizes.join(", ") || "Not specified"}</span>
                <span className={product.active ? "shop-live" : "shop-hidden"}>
                  {product.active ? "PUBLISHED" : "UNPUBLISHED"}
                </span>
              </div>
              <div className="shop-product-actions">
                <label>
                  Stock
                  <input
                    aria-label={`Stock for ${product.name}`}
                    type="number"
                    min="0"
                    max="100000"
                    defaultValue={product.stock_quantity}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isInteger(value) && value >= 0 && value !== product.stock_quantity) {
                        void updateProduct(product.id, { stock_quantity: value });
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void updateProduct(product.id, { active: !product.active })}
                >
                  {product.active ? "UNPUBLISH" : "PUBLISH"}
                </button>
                <button
                  type="button"
                  className="shop-delete-button"
                  onClick={() => void deleteProduct(product)}
                >
                  DELETE
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <style jsx>{`
        .owner-shop-manager {
          display: grid;
          gap: 22px;
          color: #e9eee9;
        }
        .shop-manager-heading,
        .shop-inventory-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .shop-manager-heading h2 {
          margin: 7px 0;
          font-size: clamp(25px, 4vw, 36px);
        }
        .shop-manager-heading p {
          margin: 0;
          color: #9da69e;
        }
        .shop-manager-count {
          color: #d9bd7b;
          font-size: 11px;
          letter-spacing: 1.5px;
        }
        .shop-manager-message {
          padding: 12px 15px;
          border: 1px solid rgba(217,189,123,.3);
          background: rgba(217,189,123,.07);
          color: #e8d49e;
          border-radius: 8px;
        }
        .shop-product-form {
          display: grid;
          gap: 15px;
          padding: 20px;
          border: 1px solid rgba(217,189,123,.2);
          border-radius: 12px;
          background: #0c120f;
        }
        .shop-product-form h3,
        .shop-inventory-heading h3 {
          margin: 0;
          color: #d9bd7b;
          font-size: 12px;
          letter-spacing: 1.5px;
        }
        .shop-product-form label,
        .shop-product-actions label {
          display: grid;
          gap: 7px;
          color: #aeb8af;
          font-size: 12px;
        }
        .shop-product-form input,
        .shop-product-form textarea,
        .shop-product-form select,
        .shop-product-actions input {
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
          padding: 11px 12px;
          color: #f2f0e8;
          background: #111a15;
          border: 1px solid rgba(217,189,123,.2);
          border-radius: 7px;
        }
        .shop-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 13px;
        }
        .shop-product-form button,
        .shop-product-actions button,
        .shop-inventory-heading button {
          padding: 10px 13px;
          color: #0b100d;
          background: #d9bd7b;
          border: 0;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .7px;
          cursor: pointer;
        }
        .shop-product-form button:disabled {
          opacity: .5;
          cursor: wait;
        }
        .shop-inventory-heading button {
          color: #d9bd7b;
          background: transparent;
          border: 1px solid rgba(217,189,123,.35);
        }
        .shop-product-list {
          display: grid;
          gap: 10px;
        }
        .shop-product-row {
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr) auto;
          align-items: center;
          gap: 15px;
          padding: 12px;
          border: 1px solid rgba(217,189,123,.16);
          border-radius: 9px;
          background: #0b110e;
        }
        .shop-product-row img {
          width: 76px;
          height: 82px;
          object-fit: cover;
          border-radius: 6px;
          background: #172019;
        }
        .shop-product-info {
          display: grid;
          gap: 5px;
          min-width: 0;
          font-size: 12px;
        }
        .shop-product-info strong {
          color: #f1ead8;
          font-size: 14px;
        }
        .shop-product-info span {
          color: #9da69e;
        }
        .shop-product-info .shop-live { color: #74d49a; }
        .shop-product-info .shop-hidden { color: #d9bd7b; }
        .shop-product-actions {
          display: grid;
          gap: 7px;
          min-width: 105px;
        }
        .shop-product-actions button {
          font-size: 9px;
        }
        .shop-product-actions .shop-delete-button {
          color: #f0b1a7;
          background: transparent;
          border: 1px solid rgba(240,177,167,.35);
        }
        @media (max-width: 650px) {
          .shop-product-row {
            grid-template-columns: 62px minmax(0, 1fr);
          }
          .shop-product-row img {
            width: 62px;
            height: 70px;
          }
          .shop-product-actions {
            grid-column: 1 / -1;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .shop-form-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}
