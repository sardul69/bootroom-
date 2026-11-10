
"use client";

import { useEffect, useMemo, useState } from "react";

type Coupon = {
  id: string;
  code: string;
  title: string;
  description: string;
  coin_cost: number;
  discount_paise: number;
  is_free_game: boolean;
};

type Transaction = {
  id: string;
  amount: number;
  balance_after: number;
  transaction_type: string;
  description: string;
  created_at: string;
};

type OwnedCoupon = {
  id: string;
  status: string;
  created_at: string;
  reward_coupons: Coupon | Coupon[] | null;
};

type Wallet = {
  balance: number;
  transactions: Transaction[];
  coupons: Coupon[];
  ownedCoupons: OwnedCoupon[];
};

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

type Category = "ALL" | "JERSEY" | "APPAREL" | "ACCESSORY";

const inr = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format((Number(paise) || 0) / 100);

const dateText = (date: string) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function CategoryIcon({ category }: { category: Category }) {
  if (category === "ALL") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="m24 4 5.2 13.8L43 23l-13.8 5.2L24 42l-5.2-13.8L5 23l13.8-5.2L24 4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        <path d="m39 5 1.5 4.5L45 11l-4.5 1.5L39 17l-1.5-4.5L33 11l4.5-1.5L39 5Z" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  if (category === "JERSEY") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="m15 7-10 7 5 11 6-3v19h16V22l6 3 5-11-10-7-5 5h-8l-5-5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M19 12c1 5 9 5 10 0" stroke="currentColor" strokeWidth="1.6" />
        <path d="M20 28h8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (category === "APPAREL") {
    return (
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M16 9 8 14 4 26l9 4 3-7v17h16V23l3 7 9-4-4-12-8-5-6 6h-4l-6-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M19 10c0 7 10 7 10 0" stroke="currentColor" strokeWidth="1.6" />
        <path d="M20 29h8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M7 28c1-10 8-17 18-17 8 0 14 6 15 14l-13 2-20 1Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7 28c8 5 22 4 31-3 4 1 5 4 2 6-8 6-25 7-34 2-3-2-2-4 1-5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M25 12c-2 4-2 8-1 13" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function CouponIcon({ free }: { free: boolean }) {
  return free ? (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M7 14h34v8a5 5 0 0 0 0 10v8H7v-8a5 5 0 0 0 0-10v-8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M24 19v3m0 4v3m0 4v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m18 10 3-3 3 2 3-2 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M8 8h21l11 11-21 21L8 29V8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="17" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m20 28 8-8m-7 1 1 1m5 4 1 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function MarketplacePage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"rewards" | "vault" | "activity">("rewards");
  const [filter, setFilter] = useState<"all" | "discounts" | "free">("all");

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [productCategory, setProductCategory] = useState<Category>("ALL");
  const [productReload, setProductReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWallet() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/rewards/wallet", {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Unable to load your rewards.");
        }

        setWallet({
          balance: Number(data.balance) || 0,
          transactions: Array.isArray(data.transactions) ? data.transactions : [],
          coupons: Array.isArray(data.coupons) ? data.coupons : [],
          ownedCoupons: Array.isArray(data.ownedCoupons) ? data.ownedCoupons : [],
        });
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadWallet();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      try {
        setProductsLoading(true);
        setProductsError("");

        const response = await fetch("/api/shop/products", {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Unable to load merchandise.");
        }

        setProducts(Array.isArray(data.products) ? data.products : []);
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setProductsError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) setProductsLoading(false);
      }
    }

    loadProducts();
    return () => controller.abort();
  }, [productReload]);

  const coupons = useMemo(
    () =>
      (wallet?.coupons || []).filter((coupon) => {
        if (filter === "free") return coupon.is_free_game;
        if (filter === "discounts") return !coupon.is_free_game;
        return true;
      }),
    [wallet, filter]
  );

  const visibleProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          productCategory === "ALL" ||
          product.category === productCategory
      ),
    [products, productCategory]
  );

  const availableCount =
    wallet?.ownedCoupons.filter((coupon) => coupon.status === "AVAILABLE").length || 0;

  const categories: { value: Category; label: string }[] = [
    { value: "ALL", label: "ALL DROPS" },
    { value: "JERSEY", label: "JERSEYS" },
    { value: "APPAREL", label: "APPAREL" },
    { value: "ACCESSORY", label: "ACCESSORIES" },
  ];

  return (
    <main className="tz-black-label">
      <div className="tzbl-noise" />

      <header className="tzbl-header">
        <a href="/" className="tzbl-brand">
          <span>✦</span> TURFZY
        </a>
        <div className="tzbl-edition">
          <i /> BLACK LABEL COLLECTION
        </div>
      </header>

      {/* HERO */}
      <section className="tzbl-hero">
        <div className="tzbl-hero-copy">
          <div className="tzbl-eyebrow">
            <span /> THE MEMBERS&apos; REWARD VAULT
          </div>

          <h1>
            NOT GIVEN.
            <br />
            <em>EARNED.</em>
          </h1>

          <p>
            The pitch rewards commitment. Turn your performances into
            exclusive perks, match discounts and rewards worth playing for.
          </p>

          <a href="#merchandise" className="tzbl-hero-cta">
            EXPLORE THE COLLECTION
            <span>DISCOVER</span>
          </a>

          <div className="tzbl-hero-caption">
            <span>01 — PLAY</span>
            <span>02 — EARN</span>
            <span>03 — UNLOCK</span>
          </div>
        </div>

        <div className="tzbl-art" aria-hidden="true">
          <div className="tzbl-art-grid" />
          <div className="tzbl-orbit tzbl-orbit-one" />
          <div className="tzbl-orbit tzbl-orbit-two" />
          <div className="tzbl-orbit tzbl-orbit-three" />

          <div className="tzbl-coin">
            <div className="tzbl-coin-inner">
              <span>✦</span>
              <strong>T</strong>
              <small>TURFZY</small>
              <i>THE GAME REWARDS YOU</i>
            </div>
          </div>

          <div className="tzbl-art-label label-top">EST. 2026</div>
          <div className="tzbl-art-label label-bottom">EXCLUSIVE PLAYER REWARDS</div>
          <span className="tzbl-art-star star-one">✧</span>
          <span className="tzbl-art-star star-two">✦</span>
        </div>

        <div className="tzbl-hero-bottom">
          <span>YOUR CITY. YOUR SQUAD. YOUR GAME.</span>
          <span>THE TURFZY STANDARD · 001</span>
        </div>
      </section>

      {/* OWNER-UPLOADED MERCHANDISE */}
      <section className="tzbl-merch" id="merchandise">
        <div className="tzbl-merch-heading">
          <div>
            <span>THE TURFZY DROP / 001</span>
            <h2>Wear the <em>standard.</em></h2>
            <p>Official TURFZY merchandise. Released by the owner.</p>
          </div>
          <span className="tzbl-merch-index">TZ / SHOP</span>
        </div>

        {/* ICON CATEGORY NAVIGATION */}
        <div className="tzbl-category-grid" aria-label="Merchandise categories">
          {categories.map((category) => (
            <button
              key={category.value}
              type="button"
              className={productCategory === category.value ? "active" : ""}
              aria-pressed={productCategory === category.value}
              onClick={() => setProductCategory(category.value)}
            >
              <span className="tzbl-category-icon">
                <CategoryIcon category={category.value} />
              </span>
              <span>{category.label}</span>
            </button>
          ))}
        </div>

        {productsLoading ? (
          <div className="tzbl-merch-state">
            <div className="tzbl-loader" />
            <p>PREPARING THE COLLECTION</p>
          </div>
        ) : productsError ? (
          <div className="tzbl-merch-state">
            <h3>Collection temporarily unavailable.</h3>
            <p>{productsError}</p>
            <button
              type="button"
              onClick={() => setProductReload((value) => value + 1)}
            >
              TRY AGAIN
            </button>
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="tzbl-merch-state">
            <h3>The next drop is being prepared.</h3>
            <p>Official merchandise will appear here when released.</p>
          </div>
        ) : (
          <div className="tzbl-merch-grid">
            {visibleProducts.map((product) => (
              <article className="tzbl-merch-card" key={product.id}>
                <div className="tzbl-merch-image">
                  <img
                    src={product.image_url}
                    alt={product.name}
                    loading="lazy"
                  />
                  <span>{product.category}</span>
                </div>

                <div className="tzbl-merch-info">
                  <h3>{product.name}</h3>

                  {product.description && <p>{product.description}</p>}

                  <strong>{inr(product.price_paise)}</strong>

                  {product.sizes.length > 0 && (
                    <small>SIZES · {product.sizes.join(" / ")}</small>
                  )}

                  <small>{product.stock_quantity} IN STOCK</small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* WALLET */}
      <section className="tzbl-wallet">
        <div className="tzbl-wallet-symbol">T</div>

        <div className="tzbl-wallet-copy">
          <span>YOUR PRIVATE WALLET</span>
          <h2>
            {loading
              ? "Accessing your vault…"
              : error
                ? "Wallet unavailable"
                : "Your reward balance"}
          </h2>
          <p>{error || "Every coin represents another step in your game."}</p>
        </div>

        <div className="tzbl-wallet-balance">
          <small>AVAILABLE COINS</small>
          <strong>
            {loading ? "— — —" : wallet?.balance.toLocaleString("en-IN") ?? "—"}
          </strong>
          <span>✦ YOUR EARNED VALUE</span>
        </div>
        <div className="tzbl-wallet-light" />
      </section>

      {/* WALLET STATS */}
      <section className="tzbl-stats">
        <div>
          <span>01</span>
          <strong>{loading ? "—" : wallet?.ownedCoupons.length ?? "—"}</strong>
          <small>COLLECTED REWARDS</small>
        </div>
        <div>
          <span>02</span>
          <strong>{loading ? "—" : availableCount}</strong>
          <small>READY TO USE</small>
        </div>
        <div>
          <span>03</span>
          <strong>{loading ? "—" : wallet?.transactions.length ?? "—"}</strong>
          <small>WALLET MOVEMENTS</small>
        </div>
      </section>

      {/* REWARDS COLLECTION */}
      <section className="tzbl-collection" id="rewards">
        <div className="tzbl-section-heading">
          <div>
            <span>THE TURFZY COLLECTION / 001</span>
            <h2>The privilege of <em>playing.</em></h2>
            <p>Exclusive rewards. Earned through the game.</p>
          </div>
          <div className="tzbl-section-mark">
            TZ<span> / 01</span>
          </div>
        </div>

        <div className="tzbl-controls">
          <div className="tzbl-tabs" role="tablist" aria-label="Shop sections">
            <button
              type="button"
              className={tab === "rewards" ? "active" : ""}
              onClick={() => setTab("rewards")}
            >
              COLLECTION <span>{wallet?.coupons.length ?? "—"}</span>
            </button>
            <button
              type="button"
              className={tab === "vault" ? "active" : ""}
              onClick={() => setTab("vault")}
            >
              MY VAULT <span>{wallet?.ownedCoupons.length ?? "—"}</span>
            </button>
            <button
              type="button"
              className={tab === "activity" ? "active" : ""}
              onClick={() => setTab("activity")}
            >
              HISTORY
            </button>
          </div>

          {tab === "rewards" && (
            <div className="tzbl-filters">
              <button
                type="button"
                className={filter === "all" ? "selected" : ""}
                onClick={() => setFilter("all")}
              >
                ALL
              </button>
              <button
                type="button"
                className={filter === "discounts" ? "selected" : ""}
                onClick={() => setFilter("discounts")}
              >
                DISCOUNTS
              </button>
              <button
                type="button"
                className={filter === "free" ? "selected" : ""}
                onClick={() => setFilter("free")}
              >
                FREE GAME
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="tzbl-state">
            <div className="tzbl-loader" />
            <p>OPENING THE PRIVATE COLLECTION</p>
          </div>
        ) : error ? (
          <div className="tzbl-state">
            <h3>Your vault is unavailable.</h3>
            <p>{error}</p>
            <button type="button" onClick={() => window.location.reload()}>
              RETRY
            </button>
          </div>
        ) : tab === "rewards" ? (
          coupons.length ? (
            <div className="tzbl-coupon-grid">
              {coupons.map((coupon, index) => (
                <article className="tzbl-coupon-tile" key={coupon.id}>
                  <div className="tzbl-coupon-topline">
                    <span>{coupon.is_free_game ? "ULTIMATE REWARD" : "PLAYER PRIVILEGE"}</span>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                  </div>

                  <div className="tzbl-coupon-icon">
                    <CouponIcon free={coupon.is_free_game} />
                  </div>

                  <strong className="tzbl-coupon-value">
                    {coupon.is_free_game ? "FREE" : inr(coupon.discount_paise)}
                  </strong>

                  <span className="tzbl-coupon-kind">
                    {coupon.is_free_game ? "GAME FEE" : "GAME FEE DISCOUNT"}
                  </span>

                  <h3>{coupon.title}</h3>

                  <p>
                    {coupon.description ||
                      "A reward for showing up and putting in the work."}
                  </p>

                  <div className="tzbl-coupon-bottom">
                    <span className="tzbl-coin-cost">
                      <i>✦</i> {Number(coupon.coin_cost).toLocaleString("en-IN")}
                      <small> COINS</small>
                    </span>
                    <button
                      type="button"
                      disabled
                      title="Secure coupon redemption is not enabled yet"
                    >
                      SOON
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="tzbl-state">
              <h3>The next collection is being prepared.</h3>
              <p>New rewards will appear here when released.</p>
            </div>
          )
        ) : tab === "vault" ? (
          wallet?.ownedCoupons.length ? (
            <div className="tzbl-list">
              {wallet.ownedCoupons.map((item) => {
                const coupon = Array.isArray(item.reward_coupons)
                  ? item.reward_coupons[0]
                  : item.reward_coupons;

                return (
                  <article key={item.id}>
                    <span className="tzbl-list-seal">✦</span>
                    <div>
                      <small>ACQUIRED · {dateText(item.created_at)}</small>
                      <h3>{coupon?.title || "TURFZY reward"}</h3>
                      <p>{coupon?.description || "Your reward coupon."}</p>
                    </div>
                    <b className={"tzbl-status " + item.status.toLowerCase()}>
                      {item.status.replace("_", " ")}
                    </b>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="tzbl-state">
              <h3>Your vault awaits its first reward.</h3>
              <p>Get on the pitch. Earn your coins. Build your collection.</p>
              <button type="button" onClick={() => setTab("rewards")}>
                VIEW COLLECTION
              </button>
            </div>
          )
        ) : wallet?.transactions.length ? (
          <div className="tzbl-list">
            {wallet.transactions.map((transaction) => (
              <article key={transaction.id}>
                <span className="tzbl-list-seal">
                  {transaction.amount > 0 ? "↗" : "↙"}
                </span>
                <div>
                  <h3>{transaction.description}</h3>
                  <p>
                    {transaction.transaction_type.replaceAll("_", " ")} ·{" "}
                    {dateText(transaction.created_at)}
                  </p>
                </div>
                <b className={transaction.amount > 0 ? "tzbl-positive" : "tzbl-negative"}>
                  {transaction.amount > 0 ? "+" : ""}
                  {transaction.amount} COINS
                </b>
              </article>
            ))}
          </div>
        ) : (
          <div className="tzbl-state">
            <h3>Your story starts on the pitch.</h3>
            <p>Your coin earnings and redemptions will appear here.</p>
          </div>
        )}

        <p className="tzbl-integrity">
          TURFZY BLACK LABEL · YOUR ACCOUNT · YOUR REWARDS · YOUR GAME
        </p>
      </section>

      {/* FINAL BANNER */}
      <section className="tzbl-banner">
        <div className="tzbl-banner-crest">T</div>
        <div>
          <small>THE TURFZY STANDARD</small>
          <h2>Some things are <em>earned.</em></h2>
          <p>Every game counts. Every coin matters.</p>
        </div>
        <a href="/matches">FIND YOUR NEXT GAME</a>
      </section>

      <footer className="tzbl-footer">
        <span>© TURFZY 2026</span>
        <span>BUILT FOR THE GAME.</span>
        <a href="/">BACK TO HOME ↑</a>
      </footer>

      <style jsx global>{`
        .tz-black-label {
          --gold: #d2b779;
          --gold-light: #f2dfb0;
          --gold-dark: #80683b;
          min-height: 100vh;
          position: relative;
          isolation: isolate;
          overflow: hidden;
          padding-bottom: 70px;
          background:
            radial-gradient(ellipse at 75% 4%, rgba(139,105,42,.16), transparent 35%),
            radial-gradient(ellipse at 5% 40%, rgba(105,82,39,.08), transparent 32%),
            #050505;
          color: #f5f1e8;
        }

        .tz-black-label * { box-sizing: border-box; }

        .tz-black-label a {
          text-decoration: none;
        }

        .tz-black-label button {
          font: inherit;
        }

        .tzbl-noise {
          position: absolute;
          z-index: -1;
          inset: 0;
          pointer-events: none;
          opacity: .12;
          background-image: repeating-linear-gradient(
            0deg,
            transparent 0 3px,
            rgba(255,255,255,.035) 4px
          );
        }

        .tzbl-header {
          width: min(1180px, calc(100% - 44px));
          height: 72px;
          margin: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(210,183,121,.17);
        }

        .tzbl-brand {
          color: #f5f1e8;
          font-size: 14px;
          font-weight: 950;
          letter-spacing: 3px;
        }

        .tzbl-brand span { color: var(--gold); }

        .tzbl-edition {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #a79775;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .tzbl-edition i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--gold);
          box-shadow: 0 0 12px var(--gold);
          animation: tzblPulse 2.5s infinite;
        }

        /* HERO */

        .tzbl-hero {
          position: relative;
          width: min(1180px, calc(100% - 44px));
          min-height: 550px;
          margin: auto;
          display: flex;
          align-items: center;
          padding: 70px 0 85px;
          border-bottom: 1px solid rgba(210,183,121,.16);
        }

        .tzbl-hero-copy {
          width: 58%;
          position: relative;
          z-index: 2;
          min-width: 0;
        }

        .tzbl-eyebrow {
          color: var(--gold);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 2.5px;
        }

        .tzbl-eyebrow span {
          display: inline-block;
          width: 7px;
          height: 7px;
          margin-right: 9px;
          border-radius: 50%;
          background: var(--gold);
          box-shadow: 0 0 12px var(--gold);
          animation: tzblPulse 2s infinite;
        }

        .tzbl-hero h1 {
          margin: 27px 0 20px;
          font-size: clamp(55px, 7.5vw, 100px);
          line-height: .94;
          letter-spacing: -4px;
          font-weight: 950;
          overflow-wrap: normal;
        }

        .tzbl-hero h1 em,
        .tzbl-section-heading h2 em,
        .tzbl-banner h2 em {
          color: var(--gold);
          font-style: normal;
          text-shadow: 0 0 35px rgba(210,183,121,.2);
        }

        .tzbl-hero-copy > p {
          max-width: 440px;
          color: #aaa49a;
          font-size: 14px;
          line-height: 1.8;
        }

        .tzbl-hero-cta {
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 22px;
          margin-top: 22px;
          padding: 17px 19px;
          border: 1px solid rgba(210,183,121,.55);
          background: linear-gradient(110deg, rgba(210,183,121,.14), rgba(210,183,121,.025));
          color: var(--gold-light);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.4px;
          transition: background .25s, box-shadow .25s;
        }

        .tzbl-hero-cta:hover {
          background: rgba(210,183,121,.2);
          box-shadow: 0 0 25px rgba(210,183,121,.12);
        }

        .tzbl-hero-cta span {
          padding-left: 14px;
          border-left: 1px solid rgba(210,183,121,.35);
          color: #a99770;
          font-size: 8px;
          letter-spacing: 1.5px;
        }

        .tzbl-hero-caption {
          display: flex;
          flex-wrap: wrap;
          gap: 22px;
          margin-top: 30px;
          color: #82765e;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.6px;
        }

        .tzbl-art {
          position: absolute;
          top: 50%;
          right: -5px;
          width: 420px;
          height: 420px;
          display: grid;
          place-items: center;
          transform: translateY(-50%);
        }

        .tzbl-art-grid {
          position: absolute;
          inset: 30px;
          background-image:
            linear-gradient(rgba(210,183,121,.09) 1px, transparent 1px),
            linear-gradient(90deg, rgba(210,183,121,.09) 1px, transparent 1px);
          background-size: 28px 28px;
          mask-image: radial-gradient(circle, black, transparent 68%);
        }

        .tzbl-orbit {
          position: absolute;
          border: 1px solid rgba(210,183,121,.28);
          border-radius: 50%;
        }

        .tzbl-orbit-one {
          width: 355px;
          height: 355px;
          transform: rotate(-25deg) scaleY(.44);
          animation: tzblSpin 20s linear infinite;
        }

        .tzbl-orbit-two {
          width: 300px;
          height: 300px;
          border-color: rgba(242,223,176,.5);
          border-style: dashed;
          transform: rotate(60deg) scaleY(.5);
          animation: tzblSpin 28s linear infinite reverse;
        }

        .tzbl-orbit-three {
          width: 400px;
          height: 400px;
          opacity: .55;
          border-style: dotted;
          animation: tzblSpin 60s linear infinite;
        }

        .tzbl-coin {
          width: 205px;
          height: 205px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: radial-gradient(
            circle at 32% 23%,
            #fff0c4 0,
            #d9bd7c 15%,
            #94743c 37%,
            #3c3020 61%,
            #090806 76%
          );
          box-shadow:
            inset 0 0 0 2px #f2dfb0,
            inset 0 0 0 9px #302719,
            inset 0 0 0 11px #c6a566,
            0 28px 75px #000,
            0 0 60px rgba(210,183,121,.19);
          animation: tzblFloat 4.5s ease-in-out infinite;
        }

        .tzbl-coin-inner {
          width: 169px;
          height: 169px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,235,186,.75);
          border-radius: 50%;
          color: #20180b;
        }

        .tzbl-coin-inner strong {
          font-size: 85px;
          line-height: .83;
          font-weight: 950;
          letter-spacing: -9px;
        }

        .tzbl-coin-inner small { color: #fff0c4; font-size: 17px; }

        .tzbl-coin-inner span {
          margin-top: 8px;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 4px;
        }

        .tzbl-coin-inner i {
          margin-top: 7px;
          font-size: 6px;
          font-style: normal;
          letter-spacing: 1px;
        }

        .tzbl-art-label {
          position: absolute;
          color: #a99977;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .label-top { top: 30px; right: 10px; }
        .label-bottom { bottom: 30px; left: 5px; }

        .tzbl-art-star {
          position: absolute;
          color: var(--gold-light);
          text-shadow: 0 0 17px var(--gold);
          animation: tzblSpark 3s infinite;
        }

        .star-one { top: 75px; left: 65px; font-size: 21px; }
        .star-two { right: 37px; bottom: 100px; font-size: 25px; animation-delay: 1s; }

        .tzbl-hero-bottom {
          position: absolute;
          right: 0;
          bottom: 19px;
          left: 0;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: #81745b;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 1.5px;
        }

        /* MERCHANDISE */

        .tzbl-merch {
          width: min(1180px, calc(100% - 44px));
          margin: 0 auto;
          padding: 48px 0 42px;
          border-bottom: 1px solid rgba(210,183,121,.16);
        }

        .tzbl-merch-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 21px;
        }

        .tzbl-merch-heading > div > span {
          color: var(--gold);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .tzbl-merch-heading h2 {
          margin: 9px 0 7px;
          color: #f5f1e8;
          font-size: clamp(30px, 5vw, 48px);
          letter-spacing: -2px;
        }

        .tzbl-merch-heading h2 em {
          color: var(--gold);
          font-style: normal;
        }

        .tzbl-merch-heading p {
          margin: 0;
          color: #9e978a;
          font-size: 11px;
          line-height: 1.6;
        }

        .tzbl-merch-index {
          color: #8f7b51;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1px;
          white-space: nowrap;
        }

        /* ICON NAVIGATION */

        .tzbl-category-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin: 0 0 20px;
        }

        .tzbl-category-grid button {
          min-width: 0;
          min-height: 100px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 12px 6px;
          border: 1px solid rgba(210,183,121,.22);
          border-radius: 2px;
          background: linear-gradient(145deg, rgba(210,183,121,.075), rgba(255,255,255,.012));
          color: #a99b7d;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          cursor: pointer;
          transition: .2s ease;
        }

        .tzbl-category-grid button:hover,
        .tzbl-category-grid button.active {
          border-color: var(--gold);
          background: rgba(210,183,121,.14);
          color: var(--gold-light);
          box-shadow: inset 0 0 20px rgba(210,183,121,.045);
        }

        .tzbl-category-icon {
          width: 39px;
          height: 39px;
          display: grid;
          place-items: center;
        }

        .tzbl-category-icon svg {
          width: 100%;
          height: 100%;
          stroke: currentColor;
        }

        .tzbl-merch-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .tzbl-merch-card {
          min-width: 0;
          overflow: hidden;
          border: 1px solid rgba(210,183,121,.19);
          background: linear-gradient(145deg, rgba(255,255,255,.035), transparent 50%), #0d0c09;
          transition: transform .25s, border-color .25s;
        }

        .tzbl-merch-card:hover {
          transform: translateY(-4px);
          border-color: rgba(210,183,121,.65);
        }

        .tzbl-merch-image {
          position: relative;
          overflow: hidden;
          aspect-ratio: 4 / 5;
          background: #171510;
        }

        .tzbl-merch-image img {
          display: block;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform .5s;
        }

        .tzbl-merch-card:hover .tzbl-merch-image img {
          transform: scale(1.035);
        }

        .tzbl-merch-image > span {
          position: absolute;
          top: 10px;
          left: 10px;
          padding: 6px 8px;
          background: rgba(210,183,121,.94);
          color: #090806;
          font-size: 7px;
          font-weight: 950;
          letter-spacing: 1px;
        }

        .tzbl-merch-info {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          padding: 13px;
        }

        .tzbl-merch-info h3 {
          margin: 0;
          color: #f5f1e8;
          font-size: 13px;
          line-height: 1.4;
        }

        .tzbl-merch-info p {
          display: -webkit-box;
          overflow: hidden;
          min-height: 30px;
          margin: 0;
          color: #9e978a;
          font-size: 10px;
          line-height: 1.5;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }

        .tzbl-merch-info strong {
          color: var(--gold-light);
          font-size: 17px;
          font-weight: 950;
        }

        .tzbl-merch-info small {
          color: #8e826b;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: .7px;
        }

        .tzbl-merch-state {
          min-height: 145px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 22px;
          border: 1px solid rgba(210,183,121,.2);
          background: rgba(255,255,255,.018);
          text-align: center;
        }

        .tzbl-merch-state h3 {
          margin: 0 0 7px;
          color: #eee6d5;
          font-size: 17px;
        }

        .tzbl-merch-state p {
          color: #a69a85;
          font-size: 11px;
          line-height: 1.6;
        }

        .tzbl-merch-state button {
          padding: 10px 15px;
          border: 1px solid rgba(210,183,121,.5);
          background: rgba(210,183,121,.08);
          color: var(--gold-light);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          cursor: pointer;
        }

        /* WALLET */

        .tzbl-wallet {
          position: relative;
          overflow: hidden;
          width: min(1180px, calc(100% - 44px));
          margin: 28px auto 12px;
          padding: 24px 27px;
          display: flex;
          align-items: center;
          gap: 19px;
          border: 1px solid rgba(210,183,121,.42);
          background: linear-gradient(110deg, #211b10, #0b0a08 68%, #201a10);
          box-shadow: 0 20px 55px rgba(0,0,0,.35);
        }

        .tzbl-wallet-symbol {
          width: 53px;
          height: 53px;
          flex: 0 0 53px;
          display: grid;
          place-items: center;
          border: 1px solid var(--gold);
          color: var(--gold-light);
          font-size: 25px;
          font-weight: 950;
          transform: rotate(45deg);
        }

        .tzbl-wallet-copy { flex: 1; min-width: 0; }

        .tzbl-wallet-copy > span {
          color: var(--gold);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .tzbl-wallet-copy h2 { margin: 7px 0 4px; font-size: 21px; }

        .tzbl-wallet-copy p {
          margin: 0;
          color: #a69b87;
          font-size: 11px;
          line-height: 1.6;
        }

        .tzbl-wallet-balance {
          position: relative;
          z-index: 1;
          text-align: right;
        }

        .tzbl-wallet-balance small {
          display: block;
          margin-bottom: 6px;
          color: #aa9871;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.6px;
        }

        .tzbl-wallet-balance strong {
          display: block;
          color: var(--gold-light);
          font-size: 37px;
          line-height: 1;
          font-weight: 950;
          letter-spacing: -2px;
        }

        .tzbl-wallet-balance span {
          display: block;
          margin-top: 8px;
          color: var(--gold);
          font-size: 7px;
          letter-spacing: 1.5px;
        }

        .tzbl-wallet-light {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(110deg, transparent 20%, rgba(210,183,121,.09), transparent 70%);
          transform: translateX(-110%);
          animation: tzblScan 7s infinite;
        }

        /* STATS */

        .tzbl-stats {
          width: min(1180px, calc(100% - 44px));
          margin: auto;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          border: 1px solid rgba(210,183,121,.16);
        }

        .tzbl-stats > div {
          padding: 15px 20px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          border-right: 1px solid rgba(210,183,121,.16);
        }

        .tzbl-stats > div:last-child { border: 0; }
        .tzbl-stats span { color: var(--gold); font-size: 8px; letter-spacing: 1px; }
        .tzbl-stats strong { font-size: 22px; }

        .tzbl-stats small {
          color: #9b907b;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        /* REWARDS */

        .tzbl-collection {
          width: min(1180px, calc(100% - 44px));
          margin: auto;
          padding: 65px 0 45px;
        }

        .tzbl-section-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 22px;
        }

        .tzbl-section-heading > div:first-child > span {
          color: var(--gold);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .tzbl-section-heading h2 {
          margin: 10px 0 7px;
          font-size: clamp(31px, 5vw, 49px);
          letter-spacing: -2px;
        }

        .tzbl-section-heading p {
          margin: 0;
          color: #9e978a;
          font-size: 11px;
          line-height: 1.6;
        }

        .tzbl-section-mark {
          color: var(--gold);
          font-size: 24px;
          font-weight: 950;
        }

        .tzbl-section-mark span {
          color: #716448;
          font-size: 11px;
        }

        .tzbl-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 18px;
          border-bottom: 1px solid rgba(210,183,121,.2);
        }

        .tzbl-tabs,
        .tzbl-filters {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .tzbl-tabs button {
          position: relative;
          min-height: 43px;
          padding: 0 13px;
          border: 0;
          background: transparent;
          color: #918875;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          white-space: nowrap;
          cursor: pointer;
        }

        .tzbl-tabs button.active { color: var(--gold-light); }

        .tzbl-tabs button.active:after {
          position: absolute;
          right: 10px;
          bottom: -1px;
          left: 10px;
          height: 2px;
          content: "";
          background: var(--gold);
          box-shadow: 0 0 12px rgba(210,183,121,.65);
        }

        .tzbl-tabs button span {
          margin-left: 4px;
          color: var(--gold);
        }

        .tzbl-filters button {
          min-height: 29px;
          padding: 0 10px;
          border: 1px solid transparent;
          border-radius: 30px;
          background: transparent;
          color: #a69a7f;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .8px;
          white-space: nowrap;
          cursor: pointer;
        }

        .tzbl-filters button.selected {
          border-color: rgba(210,183,121,.45);
          background: rgba(210,183,121,.09);
          color: var(--gold-light);
        }

        /* COMPACT COUPON ICON CARDS */

        .tzbl-coupon-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .tzbl-coupon-tile {
          position: relative;
          min-width: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 15px 11px 12px;
          border: 1px solid rgba(210,183,121,.25);
          background:
            radial-gradient(ellipse at 50% 0, rgba(210,183,121,.14), transparent 58%),
            linear-gradient(145deg, rgba(255,255,255,.025), transparent 60%),
            #0c0b08;
          text-align: center;
          transition: transform .2s ease, border-color .2s ease;
        }

        .tzbl-coupon-tile:hover {
          transform: translateY(-3px);
          border-color: rgba(242,223,176,.75);
        }

        .tzbl-coupon-topline {
          width: 100%;
          display: flex;
          justify-content: space-between;
          gap: 5px;
          color: #a8956b;
          font-size: 6px;
          font-weight: 900;
          letter-spacing: .8px;
        }

        .tzbl-coupon-topline span:last-child { color: #766747; }

        .tzbl-coupon-icon {
          width: 43px;
          height: 43px;
          display: grid;
          place-items: center;
          margin: 13px 0 9px;
          border: 1px solid rgba(210,183,121,.45);
          border-radius: 50%;
          color: var(--gold-light);
          background: rgba(210,183,121,.07);
        }

        .tzbl-coupon-icon svg {
          width: 25px;
          height: 25px;
        }

        .tzbl-coupon-value {
          color: var(--gold-light);
          font-size: clamp(20px, 2.4vw, 28px);
          line-height: 1;
          font-weight: 950;
          letter-spacing: -1px;
        }

        .tzbl-coupon-kind {
          margin-top: 6px;
          color: #b3a587;
          font-size: 7px;
          font-weight: 850;
          letter-spacing: .8px;
        }

        .tzbl-coupon-tile h3 {
          margin: 12px 0 5px;
          color: #f5f1e8;
          font-size: 11px;
          line-height: 1.35;
        }

        .tzbl-coupon-tile p {
          min-height: 31px;
          margin: 0;
          color: #999080;
          font-size: 9px;
          line-height: 1.5;
        }

        .tzbl-coupon-bottom {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 5px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid rgba(210,183,121,.17);
        }

        .tzbl-coin-cost {
          color: var(--gold-light);
          font-size: 9px;
          font-weight: 900;
          white-space: nowrap;
        }

        .tzbl-coin-cost i {
          color: var(--gold);
          font-style: normal;
        }

        .tzbl-coin-cost small {
          color: #9b8d70;
          font-size: 7px;
        }

        .tzbl-coupon-bottom button {
          padding: 5px 7px;
          border: 1px solid rgba(210,183,121,.28);
          background: transparent;
          color: #9b8a66;
          font-size: 7px;
          font-weight: 900;
          cursor: not-allowed;
        }

        /* STATES */

        .tzbl-state {
          min-height: 170px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 25px;
          text-align: center;
          border: 1px solid rgba(210,183,121,.2);
          background: rgba(255,255,255,.018);
        }

        .tzbl-state h3 {
          margin: 8px 0;
          font-size: 19px;
        }

        .tzbl-state p {
          color: #a69a85;
          font-size: 11px;
          line-height: 1.7;
        }

        .tzbl-state button {
          padding: 10px 15px;
          border: 1px solid rgba(210,183,121,.5);
          background: rgba(210,183,121,.08);
          color: var(--gold-light);
          font-size: 8px;
          font-weight: 900;
          cursor: pointer;
        }

        .tzbl-loader {
          width: 30px;
          height: 30px;
          border: 2px solid rgba(210,183,121,.2);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: tzblSpin 1s linear infinite;
        }

        .tzbl-state:has(.tzbl-loader) p,
        .tzbl-merch-state:has(.tzbl-loader) p {
          font-size: 8px;
          letter-spacing: 2px;
          font-weight: 900;
        }

        /* VAULT AND HISTORY */

        .tzbl-list {
          display: grid;
          gap: 8px;
        }

        .tzbl-list article {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 13px 16px;
          border: 1px solid rgba(210,183,121,.2);
          background: rgba(255,255,255,.02);
        }

        .tzbl-list-seal {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(210,183,121,.5);
          border-radius: 50%;
          color: var(--gold);
        }

        .tzbl-list article > div {
          flex: 1;
          min-width: 0;
        }

        .tzbl-list article small {
          color: #9d8e70;
          font-size: 7px;
          letter-spacing: 1px;
        }

        .tzbl-list article h3 {
          margin: 4px 0;
          font-size: 13px;
        }

        .tzbl-list article p {
          margin: 0;
          color: #a49a87;
          font-size: 10px;
          line-height: 1.5;
        }

        .tzbl-status,
        .tzbl-positive,
        .tzbl-negative {
          color: var(--gold-light);
          font-size: 8px;
          letter-spacing: .6px;
          text-align: right;
        }

        .tzbl-status.redeemed,
        .tzbl-negative {
          color: #a39882;
        }

        .tzbl-integrity {
          margin-top: 15px;
          color: #776a52;
          font-size: 7px;
          letter-spacing: 1.2px;
          line-height: 1.8;
        }

        /* BOTTOM BANNER */

        .tzbl-banner {
          width: min(1180px, calc(100% - 44px));
          margin: auto;
          padding: 23px;
          display: flex;
          align-items: center;
          gap: 21px;
          border: 1px solid rgba(210,183,121,.35);
          background: radial-gradient(ellipse at 0 50%, rgba(210,183,121,.12), transparent 50%), #0c0b08;
        }

        .tzbl-banner-crest {
          width: 53px;
          height: 53px;
          flex: 0 0 53px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(210,183,121,.65);
          color: var(--gold-light);
          font-size: 27px;
          font-weight: 950;
        }

        .tzbl-banner small {
          color: var(--gold);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
        }

        .tzbl-banner h2 {
          margin: 6px 0;
          font-size: 23px;
        }

        .tzbl-banner p {
          margin: 0;
          color: #a69b87;
          font-size: 10px;
        }

        .tzbl-banner > a {
          margin-left: auto;
          color: var(--gold-light);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          white-space: nowrap;
        }

        .tzbl-footer {
          width: min(1180px, calc(100% - 44px));
          margin: 25px auto 0;
          padding: 15px 0;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          border-top: 1px solid rgba(210,183,121,.15);
          color: #8b806b;
          font-size: 7px;
          font-weight: 850;
          letter-spacing: 1px;
        }

        .tzbl-footer a { color: #c4b28d; }

        /* ANIMATIONS */

        @keyframes tzblSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes tzblFloat {
          0%,100% { transform: translateY(0) rotate(-6deg); }
          50% { transform: translateY(-11px) rotate(-1deg); }
        }

        @keyframes tzblPulse {
          0%,100% { opacity: 1; }
          50% { opacity: .4; }
        }

        @keyframes tzblSpark {
          0%,100% { opacity: .45; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        @keyframes tzblScan {
          0%,15% { transform: translateX(-110%); }
          65%,100% { transform: translateX(110%); }
        }

        /* TABLET */

        @media(max-width: 900px) {
          .tzbl-hero-copy { width: 62%; }
          .tzbl-art {
            right: -65px;
            transform: translateY(-50%) scale(.8);
          }

          .tzbl-merch-grid {
            grid-template-columns: repeat(3, minmax(0,1fr));
          }

          .tzbl-coupon-grid {
            grid-template-columns: repeat(3, minmax(0,1fr));
          }
        }

        /* MOBILE */

        @media(max-width: 600px) {
          .tzbl-header,
          .tzbl-hero,
          .tzbl-wallet,
          .tzbl-stats,
          .tzbl-collection,
          .tzbl-banner,
          .tzbl-footer,
          .tzbl-merch {
            width: calc(100% - 28px);
          }

          .tzbl-header {
            height: 59px;
          }

          .tzbl-brand {
            font-size: 12px;
            letter-spacing: 2px;
          }

          .tzbl-edition {
            gap: 6px;
            font-size: 6px;
            letter-spacing: .8px;
          }

          .tzbl-hero {
            min-height: 590px;
            align-items: flex-start;
            padding: 48px 0 260px;
          }

          .tzbl-hero-copy {
            width: 100%;
          }

          .tzbl-eyebrow {
            font-size: 7px;
            letter-spacing: 1.6px;
          }

          .tzbl-hero h1 {
            margin: 22px 0 17px;
            font-size: clamp(39px, 10.8vw, 58px);
            letter-spacing: -2px;
            line-height: .99;
          }

          .tzbl-hero-copy > p {
            max-width: 100%;
            font-size: 11px;
            line-height: 1.7;
          }

          .tzbl-hero-cta {
            width: 100%;
            max-width: 100%;
            gap: 10px;
            margin-top: 18px;
            padding: 14px 12px;
            font-size: 8px;
            letter-spacing: .9px;
          }

          .tzbl-hero-cta span {
            font-size: 7px;
            letter-spacing: 1px;
          }

          .tzbl-hero-caption {
            gap: 13px;
            margin-top: 20px;
            font-size: 6px;
            letter-spacing: 1px;
          }

          .tzbl-art {
            top: auto;
            right: 50%;
            bottom: -3px;
            width: 300px;
            height: 300px;
            transform: translateX(50%) scale(.78);
          }

          .tzbl-hero-bottom {
            bottom: 12px;
            gap: 8px;
            font-size: 5px;
            letter-spacing: .5px;
          }

          .tzbl-merch {
            padding: 36px 0 30px;
          }

          .tzbl-merch-heading {
            align-items: flex-start;
            margin-bottom: 17px;
          }

          .tzbl-merch-heading h2 {
            font-size: 30px;
            letter-spacing: -1.4px;
          }

          .tzbl-merch-heading p {
            max-width: 250px;
            font-size: 9px;
          }

          .tzbl-merch-index {
            padding-top: 5px;
            font-size: 7px;
          }

          .tzbl-category-grid {
            grid-template-columns: repeat(4, minmax(0,1fr));
            gap: 6px;
            margin-bottom: 14px;
          }

          .tzbl-category-grid button {
            min-height: 78px;
            gap: 5px;
            padding: 7px 2px;
            font-size: 6px;
            letter-spacing: .35px;
          }

          .tzbl-category-icon {
            width: 30px;
            height: 30px;
          }

          .tzbl-merch-grid {
            grid-template-columns: repeat(2, minmax(0,1fr));
            gap: 8px;
          }

          .tzbl-merch-info {
            gap: 6px;
            padding: 9px;
          }

          .tzbl-merch-info h3 { font-size: 11px; }
          .tzbl-merch-info p { font-size: 9px; }
          .tzbl-merch-info strong { font-size: 15px; }

          .tzbl-wallet {
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 20px;
            padding: 17px 14px;
          }

          .tzbl-wallet-symbol {
            width: 40px;
            height: 40px;
            flex-basis: 40px;
            font-size: 19px;
          }

          .tzbl-wallet-copy { flex: 1; }

          .tzbl-wallet-copy h2 { font-size: 16px; }
          .tzbl-wallet-copy p { font-size: 9px; }

          .tzbl-wallet-balance {
            width: 100%;
            padding-left: 52px;
            text-align: left;
          }

          .tzbl-wallet-balance strong { font-size: 31px; }

          .tzbl-stats > div { padding: 11px 8px; }
          .tzbl-stats strong { font-size: 17px; }

          .tzbl-stats small {
            font-size: 5.5px;
            letter-spacing: .2px;
          }

          .tzbl-collection {
            padding: 48px 0 34px;
          }

          .tzbl-section-heading {
            margin-bottom: 17px;
          }

          .tzbl-section-heading h2 {
            font-size: 29px;
            letter-spacing: -1.4px;
          }

          .tzbl-section-heading p { font-size: 9px; }

          .tzbl-section-mark {
            font-size: 18px;
          }

          .tzbl-controls {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
            padding-bottom: 9px;
          }

          .tzbl-tabs {
            width: 100%;
            justify-content: space-between;
          }

          .tzbl-tabs button {
            min-height: 39px;
            padding: 0 5px;
            font-size: 6.5px;
            letter-spacing: .4px;
          }

          .tzbl-tabs button span { margin-left: 2px; }

          .tzbl-filters { gap: 3px; }

          .tzbl-filters button {
            min-height: 26px;
            padding: 0 8px;
            font-size: 6px;
          }

          /* Two coupons per row on mobile */
          .tzbl-coupon-grid {
            grid-template-columns: repeat(2, minmax(0,1fr));
            gap: 8px;
          }

          .tzbl-coupon-tile {
            padding: 11px 8px 9px;
          }

          .tzbl-coupon-topline {
            font-size: 5.5px;
            letter-spacing: .4px;
          }

          .tzbl-coupon-icon {
            width: 36px;
            height: 36px;
            margin: 10px 0 8px;
          }

          .tzbl-coupon-icon svg {
            width: 21px;
            height: 21px;
          }

          .tzbl-coupon-value { font-size: 22px; }
          .tzbl-coupon-kind { font-size: 6px; }

          .tzbl-coupon-tile h3 {
            margin: 9px 0 4px;
            font-size: 10px;
          }

          .tzbl-coupon-tile p {
            min-height: 28px;
            font-size: 8px;
            line-height: 1.4;
          }

          .tzbl-coupon-bottom {
            margin-top: 9px;
            padding-top: 8px;
          }

          .tzbl-coin-cost { font-size: 8px; }
          .tzbl-coin-cost small { font-size: 6px; }

          .tzbl-coupon-bottom button {
            padding: 4px 5px;
            font-size: 6px;
          }

          .tzbl-list article {
            gap: 9px;
            padding: 11px 9px;
          }

          .tzbl-list-seal {
            width: 32px;
            height: 32px;
            flex-basis: 32px;
          }

          .tzbl-list article h3 { font-size: 11px; }
          .tzbl-list article p { font-size: 8px; }

          .tzbl-status,
          .tzbl-positive,
          .tzbl-negative {
            font-size: 6px;
          }

          .tzbl-banner {
            flex-wrap: wrap;
            gap: 13px;
            padding: 17px 13px;
          }

          .tzbl-banner-crest {
            width: 40px;
            height: 40px;
            flex-basis: 40px;
            font-size: 21px;
          }

          .tzbl-banner h2 { font-size: 18px; }
          .tzbl-banner p { font-size: 8px; }

          .tzbl-banner > a {
            width: 100%;
            margin-left: 53px;
            font-size: 7px;
          }

          .tzbl-footer {
            flex-wrap: wrap;
            font-size: 6px;
            letter-spacing: .4px;
          }
        }

        @media(max-width: 360px) {
          .tzbl-hero h1 {
            font-size: 39px;
            letter-spacing: -1.8px;
          }

          .tzbl-category-grid button {
            font-size: 5px;
          }

          .tzbl-coupon-tile {
            padding-right: 6px;
            padding-left: 6px;
          }

          .tzbl-coupon-bottom {
            flex-wrap: wrap;
            justify-content: center;
          }
        }

        @media(prefers-reduced-motion: reduce) {
          .tz-black-label *,
          .tz-black-label *::before,
          .tz-black-label *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>
    </main>
  );
}
