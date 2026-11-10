"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type ShopProduct = {
  id: string;
  name: string;
  description: string;
  category: "JERSEY" | "APPAREL" | "ACCESSORY";
  price_paise: number;
  image_url: string;
  sizes: string[];
  stock_quantity: number;
};

const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((Number(paise) || 0) / 100);

export default function MarketplaceProductPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSize, setSelectedSize] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/shop/products", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Unable to load this product.");
        }

        setProducts(Array.isArray(data.products) ? data.products : []);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadProducts();
    return () => controller.abort();
  }, []);

  const product = useMemo(
    () => products.find((item) => item.id === productId),
    [products, productId]
  );

  const relatedProducts = useMemo(
    () =>
      products
        .filter((item) => item.id !== productId)
        .filter((item) => item.category === product?.category)
        .slice(0, 3),
    [products, productId, product]
  );

  useEffect(() => {
    setSelectedSize("");
  }, [productId]);

  if (loading) {
    return (
      <main className="tz-product-page">
        <p className="tz-product-status">ACCESSING THE COLLECTION…</p>
        <style jsx>{styles}</style>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="tz-product-page">
        <Link href="/marketplace#merchandise" className="tz-back">
          ← BACK TO THE COLLECTION
        </Link>
        <section className="tz-product-message">
          <span>THE TURFZY COLLECTION</span>
          <h1>{error ? "PRODUCT UNAVAILABLE" : "PIECE NOT FOUND"}</h1>
          <p>
            {error || "This product may have sold out or is no longer available."}
          </p>
          <Link href="/marketplace#merchandise" className="tz-button">
            RETURN TO SHOP
          </Link>
        </section>
        <style jsx>{styles}</style>
      </main>
    );
  }

  return (
    <main className="tz-product-page">
      <header className="tz-product-header">
        <Link href="/marketplace" className="tz-wordmark">
          TURFZY<span>.</span>
        </Link>
        <span className="tz-header-label">THE OFFICIAL COLLECTION</span>
      </header>

      <nav className="tz-breadcrumb">
        <Link href="/marketplace">SHOP</Link>
        <span>/</span>
        <span>{product.category}</span>
        <span>/</span>
        <span className="tz-current">{product.name}</span>
      </nav>

      <section className="tz-product-layout">
        <div className="tz-product-visual">
          <div className="tz-image-frame">
            <img src={product.image_url} alt={product.name} />
            <span className="tz-image-category">{product.category}</span>
            <span className="tz-image-index">T / COLLECTION</span>
          </div>
          <p className="tz-image-caption">
            BUILT FOR THE GAME. MADE TO REPRESENT.
          </p>
        </div>

        <div className="tz-product-details">
          <span className="tz-eyebrow">TURFZY · OFFICIAL MERCHANDISE</span>
          <h1>{product.name}</h1>
          <div className="tz-product-price">{inr(product.price_paise)}</div>

          <div className="tz-gold-rule" />

          <p className="tz-description">
            {product.description || "An official piece from the TURFZY collection."}
          </p>

          <div className="tz-detail-block">
            <span className="tz-label">CATEGORY</span>
            <strong>{product.category}</strong>
          </div>

          {product.sizes.length > 0 && (
            <div className="tz-size-block">
              <div className="tz-size-heading">
                <span className="tz-label">SELECT SIZE</span>
                <span className="tz-size-note">AVAILABLE OPTIONS</span>
              </div>
              <div className="tz-size-options">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={selectedSize === size ? "selected" : ""}
                    onClick={() => setSelectedSize(size)}
                    aria-pressed={selectedSize === size}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="tz-stock">
            <span className="tz-stock-dot" />
            {product.stock_quantity} UNITS AVAILABLE
          </div>

          <div className="tz-purchase-notice">
            <span>COLLECTION PREVIEW</span>
            <p>
              Online merchandise purchasing is not available yet. Product
              selection here does not reserve stock or create an order.
            </p>
          </div>

          <Link href="/marketplace#merchandise" className="tz-button">
            ← BACK TO COLLECTION
          </Link>

          <p className="tz-product-footnote">
            TURFZY · YOUR CITY. YOUR SQUAD. YOUR GAME.
          </p>
        </div>
      </section>

      {relatedProducts.length > 0 && (
        <section className="tz-related">
          <div className="tz-related-heading">
            <span>CONTINUE EXPLORING</span>
            <h2>MORE FROM THE COLLECTION</h2>
          </div>
          <div className="tz-related-grid">
            {relatedProducts.map((item) => (
              <Link
                href={`/marketplace/${item.id}`}
                className="tz-related-card"
                key={item.id}
              >
                <div className="tz-related-image">
                  <img src={item.image_url} alt={item.name} loading="lazy" />
                </div>
                <span>{item.category}</span>
                <h3>{item.name}</h3>
                <strong>{inr(item.price_paise)}</strong>
              </Link>
            ))}
          </div>
        </section>
      )}

      <footer className="tz-product-footer">
        TURFZY <span>—</span> THE GAME NEVER STOPS.
      </footer>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
  .tz-product-page {
    min-height: 100vh;
    padding: 0 5.5% 55px;
    background: #090907;
    color: #f3efe5;
    font-family: Arial, Helvetica, sans-serif;
  }
  .tz-product-header {
    min-height: 76px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(210,183,121,.2);
  }
  .tz-wordmark {
    color: #f2ead8;
    text-decoration: none;
    font-size: 23px;
    font-weight: 950;
    letter-spacing: 4px;
  }
  .tz-wordmark span { color: #c9a96b; }
  .tz-header-label, .tz-eyebrow, .tz-label, .tz-size-note {
    color: #bda36f;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 2px;
  }
  .tz-breadcrumb {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 25px 0;
    color: #777166;
    font-size: 9px;
    letter-spacing: 1.3px;
  }
  .tz-breadcrumb a, .tz-back {
    color: #c9ad78;
    text-decoration: none;
  }
  .tz-current { color: #e9e0ce; }
  .tz-product-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, .9fr);
    gap: clamp(35px, 7vw, 105px);
    max-width: 1320px;
    margin: 10px auto 0;
    align-items: start;
  }
  .tz-image-frame {
    position: relative;
    overflow: hidden;
    aspect-ratio: 4 / 5;
    background: #15130e;
    border: 1px solid rgba(210,183,121,.25);
  }
  .tz-image-frame img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
  }
  .tz-image-category, .tz-image-index {
    position: absolute;
    padding: 9px 11px;
    background: rgba(9,9,7,.82);
    color: #d6bd89;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1.6px;
  }
  .tz-image-category { top: 15px; left: 15px; }
  .tz-image-index { right: 15px; bottom: 15px; }
  .tz-image-caption {
    color: #80796d;
    font-size: 8px;
    letter-spacing: 2px;
    text-align: center;
    margin-top: 14px;
  }
  .tz-product-details { padding-top: 18px; }
  .tz-product-details h1 {
    margin: 17px 0 12px;
    max-width: 600px;
    color: #f4efe5;
    font-family: Georgia, serif;
    font-size: clamp(34px, 5vw, 65px);
    font-weight: 500;
    line-height: 1.04;
    letter-spacing: -1.5px;
  }
  .tz-product-price {
    color: #d6bd89;
    font-size: 25px;
    font-weight: 700;
  }
  .tz-gold-rule {
    width: 55px;
    height: 2px;
    margin: 27px 0;
    background: #b99b60;
  }
  .tz-description {
    max-width: 520px;
    color: #aaa397;
    font-size: 13px;
    line-height: 1.9;
  }
  .tz-detail-block {
    display: flex;
    justify-content: space-between;
    max-width: 430px;
    padding: 20px 0;
    margin-top: 24px;
    border-bottom: 1px solid rgba(210,183,121,.16);
  }
  .tz-detail-block strong {
    color: #e7dfd0;
    font-size: 10px;
    letter-spacing: 1.5px;
  }
  .tz-size-block { margin-top: 25px; }
  .tz-size-heading { display: flex; justify-content: space-between; max-width: 430px; }
  .tz-size-note { color: #777166; font-size: 8px; }
  .tz-size-options { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 14px; }
  .tz-size-options button {
    min-width: 48px;
    height: 43px;
    border: 1px solid rgba(210,183,121,.35);
    background: #11100d;
    color: #e8dfcf;
    cursor: pointer;
    font-size: 11px;
    transition: .2s;
  }
  .tz-size-options button:hover, .tz-size-options button.selected {
    border-color: #d2b779;
    background: #d2b779;
    color: #090907;
  }
  .tz-stock {
    display: flex;
    align-items: center;
    gap: 9px;
    margin: 25px 0;
    color: #c5bda9;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.5px;
  }
  .tz-stock-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #9caa70;
  }
  .tz-purchase-notice {
    max-width: 470px;
    padding: 17px;
    border: 1px solid rgba(210,183,121,.2);
    background: linear-gradient(120deg, rgba(210,183,121,.07), transparent);
  }
  .tz-purchase-notice span {
    color: #d2b779;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 1.7px;
  }
  .tz-purchase-notice p {
    margin: 9px 0 0;
    color: #9c9588;
    font-size: 11px;
    line-height: 1.7;
  }
  .tz-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    margin-top: 23px;
    padding: 0 23px;
    border: 1px solid #b99b60;
    color: #e0c58f;
    text-decoration: none;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 1.8px;
    transition: .2s;
  }
  .tz-button:hover { background: #d2b779; color: #090907; }
  .tz-product-footnote {
    margin-top: 27px;
    color: #6f695e;
    font-size: 8px;
    letter-spacing: 1.5px;
  }
  .tz-related {
    max-width: 1320px;
    margin: 100px auto 0;
    padding-top: 35px;
    border-top: 1px solid rgba(210,183,121,.2);
  }
  .tz-related-heading span { color: #bda36f; font-size: 8px; letter-spacing: 2px; }
  .tz-related-heading h2 {
    margin: 10px 0 25px;
    font-family: Georgia, serif;
    font-size: 27px;
    font-weight: 500;
  }
  .tz-related-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .tz-related-card { color: inherit; text-decoration: none; min-width: 0; }
  .tz-related-image { aspect-ratio: 4 / 4.5; overflow: hidden; background: #15130e; }
  .tz-related-image img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s; }
  .tz-related-card:hover img { transform: scale(1.04); }
  .tz-related-card > span {
    display: block;
    margin-top: 13px;
    color: #bda36f;
    font-size: 8px;
    letter-spacing: 1.5px;
  }
  .tz-related-card h3 { margin: 7px 0; font-size: 13px; }
  .tz-related-card strong { color: #d6bd89; font-size: 13px; }
  .tz-product-footer {
    margin-top: 90px;
    color: #777166;
    text-align: center;
    font-size: 9px;
    letter-spacing: 2px;
  }
  .tz-product-footer span { color: #c9a96b; }
  .tz-product-status { padding: 80px 0; color: #d2b779; text-align: center; letter-spacing: 2px; }
  .tz-product-message { max-width: 600px; margin: 100px auto; text-align: center; }
  .tz-product-message > span { color: #bda36f; font-size: 9px; letter-spacing: 2px; }
  .tz-product-message h1 { font-family: Georgia, serif; font-weight: 500; font-size: 38px; }
  .tz-product-message p { color: #aaa397; font-size: 13px; line-height: 1.7; }
  @media (max-width: 760px) {
    .tz-product-page { padding: 0 18px 40px; }
    .tz-product-header { min-height: 65px; }
    .tz-header-label { font-size: 7px; letter-spacing: 1px; }
    .tz-breadcrumb { padding: 18px 0; font-size: 8px; }
    .tz-product-layout { grid-template-columns: 1fr; gap: 28px; margin-top: 0; }
    .tz-product-visual { max-width: 620px; width: 100%; margin: auto; }
    .tz-product-details { padding-top: 0; }
    .tz-product-details h1 { font-size: clamp(36px, 10vw, 52px); }
    .tz-related { margin-top: 65px; }
    .tz-related-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
    .tz-related-grid .tz-related-card:last-child:nth-child(odd) { display: none; }
    .tz-product-footer { margin-top: 60px; }
  }
`;
