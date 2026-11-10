
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

export default function MarketplacePage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"rewards" | "vault" | "activity">("rewards");
  const [filter, setFilter] = useState<"all" | "discounts" | "free">("all");

  // Merchandise state is independent of the rewards wallet.
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [productCategory, setProductCategory] = useState("ALL");
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

        setProducts(
          Array.isArray(data.products) ? data.products : []
        );
      } catch (err) {
        if (err instanceof Error && err.name !== "AbortError") {
          setProductsError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setProductsLoading(false);
        }
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
    wallet?.ownedCoupons.filter((c) => c.status === "AVAILABLE").length || 0;

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

      <section className="tzbl-hero">
        <div className="tzbl-hero-copy">
          <div className="tzbl-eyebrow">
            <span /> THE MEMBERS' REWARD VAULT
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
            EXPLORE THE DROP <span>↘</span>
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

        <div className="tzbl-merch-filters">
          {[
            ["ALL", "ALL"],
            ["JERSEY", "JERSEYS"],
            ["APPAREL", "APPAREL"],
            ["ACCESSORY", "ACCESSORIES"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={productCategory === value ? "active" : ""}
              aria-pressed={productCategory === value}
              onClick={() => setProductCategory(value)}
            >
              {label}
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
              TRY AGAIN ↗
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

                  {product.description && (
                    <p>{product.description}</p>
                  )}

                  <strong>{inr(product.price_paise)}</strong>

                  {product.sizes.length > 0 && (
                    <small>
                      SIZES · {product.sizes.join(" / ")}
                    </small>
                  )}

                  <small>
                    {product.stock_quantity} IN STOCK
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="tzbl-wallet">
        <div className="tzbl-wallet-symbol">T</div>

        <div className="tzbl-wallet-copy">
          <span>YOUR PRIVATE WALLET</span>
          <h2>{loading ? "Accessing your vault…" : error ? "Wallet unavailable" : "Your reward balance"}</h2>
          <p>{error || "Every coin represents another step in your game."}</p>
        </div>

        <div className="tzbl-wallet-balance">
          <small>AVAILABLE COINS</small>
          <strong>{loading ? "— — —" : wallet?.balance.toLocaleString("en-IN") ?? "—"}</strong>
          <span>✦ YOUR EARNED VALUE</span>
        </div>
        <div className="tzbl-wallet-light" />
      </section>

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

      <section className="tzbl-collection" id="rewards">
        <div className="tzbl-section-heading">
          <div>
            <span>THE TURFZY COLLECTION / 001</span>
            <h2>The privilege of <em>playing.</em></h2>
            <p>Exclusive rewards. Earned through the game.</p>
          </div>
          <div className="tzbl-section-mark">TZ<span> / 01</span></div>
        </div>

        <div className="tzbl-controls">
          <div className="tzbl-tabs" role="tablist" aria-label="Shop sections">
            <button
              className={tab === "rewards" ? "active" : ""}
              onClick={() => setTab("rewards")}
            >
              COLLECTION <span>{wallet?.coupons.length ?? "—"}</span>
            </button>
            <button
              className={tab === "vault" ? "active" : ""}
              onClick={() => setTab("vault")}
            >
              MY VAULT <span>{wallet?.ownedCoupons.length ?? "—"}</span>
            </button>
            <button
              className={tab === "activity" ? "active" : ""}
              onClick={() => setTab("activity")}
            >
              HISTORY
            </button>
          </div>

          {tab === "rewards" && (
            <div className="tzbl-filters">
              <button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>ALL</button>
              <button className={filter === "discounts" ? "selected" : ""} onClick={() => setFilter("discounts")}>DISCOUNTS</button>
              <button className={filter === "free" ? "selected" : ""} onClick={() => setFilter("free")}>FREE GAME</button>
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
            <button onClick={() => window.location.reload()}>RETRY ↗</button>
          </div>
        ) : tab === "rewards" ? (
          coupons.length ? (
            <div className="tzbl-grid">
              {coupons.map((coupon, index) => (
                <article className={"tzbl-card card-" + (index % 4)} key={coupon.id}>
                  <div className="tzbl-card-meta">
                    <span>{coupon.is_free_game ? "THE ULTIMATE PERK" : "PLAYER PRIVILEGE"}</span>
                    <span>NO. {String(index + 1).padStart(2, "0")}</span>
                  </div>

                  <div className="tzbl-ticket">
                    <div className="tzbl-ticket-lines" />
                    <div className="tzbl-ticket-content">
                      <small>TURFZY / PRIVATE REWARDS</small>
                      <strong>
                        {coupon.is_free_game ? "FREE" : inr(coupon.discount_paise)}
                      </strong>
                      <b>{coupon.is_free_game ? "GAME FEE" : "OFF YOUR GAME FEE"}</b>
                    </div>
                    <div className="tzbl-ticket-seal">✦</div>
                    <span className="tzbl-ticket-code">TZ · EXCLUSIVE</span>
                  </div>

                  <div className="tzbl-card-info">
                    <h3>{coupon.title}</h3>
                    <p>{coupon.description || "A reward for showing up and putting in the work."}</p>
                  </div>

                  <div className="tzbl-card-footer">
                    <div>
                      <small>UNLOCK WITH</small>
                      <strong>✦ {Number(coupon.coin_cost).toLocaleString("en-IN")} <i>COINS</i></strong>
                    </div>
                    <button disabled title="Secure coupon redemption is not enabled yet">
                      COMING SOON
                    </button>
                  </div>
                  <div className="tzbl-card-shine" />
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
              <button onClick={() => setTab("rewards")}>VIEW COLLECTION ↗</button>
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

      <section className="tzbl-banner">
        <div className="tzbl-banner-crest">T</div>
        <div>
          <small>THE TURFZY STANDARD</small>
          <h2>Some things are <em>earned.</em></h2>
          <p>Every game counts. Every coin matters.</p>
        </div>
        <a href="/matches">FIND YOUR NEXT GAME <span>↗</span></a>
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
          padding-bottom: 145px;
          background:
            radial-gradient(ellipse at 75% 4%, rgba(139,105,42,.16), transparent 35%),
            radial-gradient(ellipse at 5% 40%, rgba(105,82,39,.08), transparent 32%),
            #050505;
          color: #f5f1e8;
        }
        .tz-black-label * { box-sizing: border-box; }
        .tzbl-noise {
          position: absolute;
          z-index: -1;
          inset: 0;
          pointer-events: none;
          opacity: .12;
          background-image: repeating-linear-gradient(
            0deg, transparent 0 3px, rgba(255,255,255,.035) 4px
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
        .tzbl-hero {
          position: relative;
          width: min(1180px, calc(100% - 44px));
          min-height: 570px;
          margin: auto;
          display: flex;
          align-items: center;
          padding: 75px 0 90px;
          border-bottom: 1px solid rgba(210,183,121,.16);
        }
        .tzbl-hero-copy {
          width: 58%;
          position: relative;
          z-index: 2;
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
          font-size: clamp(57px, 8vw, 100px);
          line-height: .91;
          letter-spacing: -5px;
          font-weight: 950;
        }
        .tzbl-hero h1 em,
        .tzbl-section-heading h2 em,
        .tzbl-banner h2 em {
          color: var(--gold);
          font-style: normal;
          text-shadow: 0 0 35px rgba(210,183,121,.2);
        }
        .tzbl-hero-copy > p {
          max-width: 460px;
          color: #aaa49a;
          font-size: 15px;
          line-height: 1.85;
        }
        .tzbl-hero-cta {
          display: inline-flex;
          align-items: center;
          gap: 25px;
          margin-top: 23px;
          padding: 15px 19px;
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
        .tzbl-hero-cta span { font-size: 16px; }
        .tzbl-hero-caption {
          display: flex;
          gap: 22px;
          margin-top: 35px;
          color: #82765e;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.6px;
        }
        .tzbl-art {
          position: absolute;
          top: 50%;
          right: -5px;
          width: 430px;
          height: 430px;
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
          width: 415px;
          height: 415px;
          opacity: .55;
          border-style: dotted;
          animation: tzblSpin 60s linear infinite;
        }
        .tzbl-coin {
          width: 218px;
          height: 218px;
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
          width: 180px;
          height: 180px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(255,235,186,.75);
          border-radius: 50%;
          color: #20180b;
        }
        .tzbl-coin-inner strong {
          font-size: 91px;
          line-height: .83;
          font-weight: 950;
          letter-spacing: -9px;
        }
        .tzbl-coin-inner small { color: #fff0c4; font-size: 18px; }
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
          font-style: normal;
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
          color: #81745b;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 1.5px;
        }

        /* Merchandise */
        .tzbl-merch {
          width: min(1180px, calc(100% - 44px));
          margin: 0 auto;
          padding: 58px 0 48px;
          border-bottom: 1px solid rgba(210,183,121,.16);
        }
        .tzbl-merch-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 15px;
          margin-bottom: 25px;
        }
        .tzbl-merch-heading > div > span {
          color: var(--gold);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
        }
        .tzbl-merch-heading h2 {
          margin: 10px 0 7px;
          color: #f5f1e8;
          font-size: clamp(32px, 5vw, 52px);
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
        }
        .tzbl-merch-index {
          color: #8f7b51;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1px;
          white-space: nowrap;
        }
        .tzbl-merch-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 20px;
        }
        .tzbl-merch-filters button {
          padding: 9px 14px;
          border: 1px solid rgba(210,183,121,.22);
          border-radius: 2px;
          background: transparent;
          color: #a99b7d;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          cursor: pointer;
          transition: .2s ease;
        }
        .tzbl-merch-filters button.active,
        .tzbl-merch-filters button:hover {
          border-color: var(--gold);
          background: rgba(210,183,121,.12);
          color: var(--gold-light);
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
          min-height: 160px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 25px;
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

        .tzbl-wallet {
          position: relative;
          overflow: hidden;
          width: min(1180px, calc(100% - 44px));
          margin: 32px auto 12px;
          padding: 27px 30px;
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
        .tzbl-wallet-copy p { margin: 0; color: #a69b87; font-size: 11px; line-height: 1.6; }
        .tzbl-wallet-balance { position: relative; z-index: 1; text-align: right; }
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
          font-size: 39px;
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
        .tzbl-stats {
          width: min(1180px, calc(100% - 44px));
          margin: auto;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          border: 1px solid rgba(210,183,121,.16);
        }
        .tzbl-stats > div {
          padding: 17px 23px;
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
        .tzbl-collection {
          width: min(1180px, calc(100% - 44px));
          margin: auto;
          padding: 82px 0 65px;
        }
        .tzbl-section-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 28px;
        }
        .tzbl-section-heading > div:first-child > span {
          color: var(--gold);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 2px;
        }
        .tzbl-section-heading h2 {
          margin: 12px 0 8px;
          font-size: clamp(35px, 5vw, 55px);
          letter-spacing: -2px;
        }
        .tzbl-section-heading p { margin: 0; color: #9e978a; font-size: 12px; }
        .tzbl-section-mark { color: var(--gold); font-size: 24px; font-weight: 950; }
        .tzbl-section-mark span { color: #716448; font-size: 11px; }
        .tzbl-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 22px;
          border-bottom: 1px solid rgba(210,183,121,.2);
        }
        .tzbl-tabs,.tzbl-filters { display: flex; align-items: center; gap: 4px; }
        .tzbl-tabs button {
          position: relative;
          min-height: 45px;
          padding: 0 14px;
          border: 0;
          background: transparent;
          color: #918875;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          white-space: nowrap;
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
        .tzbl-tabs button span { margin-left: 4px; color: var(--gold); }
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
        }
        .tzbl-filters button.selected {
          border-color: rgba(210,183,121,.45);
          background: rgba(210,183,121,.09);
          color: var(--gold-light);
        }
        .tzbl-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }
        .tzbl-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          padding: 16px;
          border: 1px solid rgba(210,183,121,.2);
          background: linear-gradient(145deg, rgba(255,255,255,.045), transparent 45%), #0d0c09;
          animation: tzblRise .6s both;
          transition: transform .28s, border-color .28s, box-shadow .28s;
        }
        .tzbl-card:nth-child(2) { animation-delay: .08s; }
        .tzbl-card:nth-child(3) { animation-delay: .16s; }
        .tzbl-card:nth-child(4) { animation-delay: .24s; }
        .tzbl-card:hover {
          transform: translateY(-7px);
          border-color: rgba(242,223,176,.7);
          box-shadow: 0 22px 50px rgba(0,0,0,.4), 0 0 25px rgba(210,183,121,.08);
        }
        .tzbl-card-meta {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          color: #b4a47f;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 1.1px;
        }
        .tzbl-card-meta span:last-child { color: #716448; }
        .tzbl-ticket {
          position: relative;
          min-height: 148px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          overflow: hidden;
          margin: 15px 0;
          padding: 19px;
          border: 1px solid rgba(210,183,121,.5);
          background: radial-gradient(ellipse at 90% 5%, rgba(210,183,121,.2), transparent 50%), linear-gradient(135deg, #332a19, #100e09 70%, #282014);
        }
        .card-1 .tzbl-ticket { background: linear-gradient(135deg,#252017,#0b0a08 70%,#302719); }
        .card-2 .tzbl-ticket { background: linear-gradient(135deg,#29251a,#100e09 70%,#211b11); }
        .card-3 .tzbl-ticket { background: linear-gradient(135deg,#1d1b15,#090908 70%,#292217); }
        .tzbl-ticket-lines {
          position: absolute;
          inset: 8px;
          border: 1px solid rgba(210,183,121,.18);
          pointer-events: none;
        }
        .tzbl-ticket-content { position: relative; z-index: 1; display: flex; flex-direction: column; }
        .tzbl-ticket-content small {
          color: #b6a47d;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 1.6px;
        }
        .tzbl-ticket-content strong {
          margin: 9px 0 2px;
          color: #f3dfb0;
          font-size: clamp(31px, 4vw, 44px);
          font-weight: 950;
          letter-spacing: -2px;
        }
        .tzbl-ticket-content b { color: #a99a79; font-size: 8px; letter-spacing: 1px; }
        .tzbl-ticket-seal {
          position: relative;
          z-index: 1;
          width: 43px;
          height: 43px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(242,223,176,.65);
          border-radius: 50%;
          color: var(--gold-light);
          font-size: 20px;
        }
        .tzbl-ticket-code {
          position: absolute;
          right: 13px;
          bottom: 12px;
          color: rgba(210,183,121,.55);
          font-size: 6px;
          letter-spacing: 1.3px;
        }
        .tzbl-card-info h3 { margin: 0 0 7px; font-size: 16px; }
        .tzbl-card-info p {
          min-height: 34px;
          margin: 0;
          color: #a49a87;
          font-size: 10px;
          line-height: 1.6;
        }
        .tzbl-card-footer {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 7px;
          margin-top: 16px;
          padding-top: 13px;
          border-top: 1px solid rgba(210,183,121,.16);
        }
        .tzbl-card-footer small {
          display: block;
          margin-bottom: 5px;
          color: #92836a;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: 1px;
        }
        .tzbl-card-footer strong { color: var(--gold-light); font-size: 15px; }
        .tzbl-card-footer strong i {
          color: #a99a7e;
          font-size: 7px;
          font-style: normal;
        }
        .tzbl-card-footer button {
          min-height: 32px;
          padding: 0 9px;
          border: 1px solid rgba(210,183,121,.3);
          background: rgba(210,183,121,.07);
          color: #c2ae7f;
          font-size: 7px;
          font-weight: 900;
          letter-spacing: .6px;
          white-space: nowrap;
          cursor: not-allowed;
        }
        .tzbl-card-shine {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(110deg, transparent 25%, rgba(255,255,255,.045) 48%, transparent 70%);
          transform: translateX(-120%);
          transition: transform .7s;
        }
        .tzbl-card:hover .tzbl-card-shine { transform: translateX(120%); }
        .tzbl-state {
          min-height: 220px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 28px;
          text-align: center;
          border: 1px solid rgba(210,183,121,.2);
          background: rgba(255,255,255,.018);
        }
        .tzbl-state h3 { margin: 8px 0; font-size: 20px; }
        .tzbl-state p { color: #a69a85; font-size: 12px; line-height: 1.7; }
        .tzbl-state button {
          padding: 11px 16px;
          border: 1px solid rgba(210,183,121,.5);
          background: rgba(210,183,121,.08);
          color: var(--gold-light);
          font-size: 9px;
          font-weight: 900;
        }
        .tzbl-loader {
          width: 32px;
          height: 32px;
          border: 2px solid rgba(210,183,121,.2);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: tzblSpin 1s linear infinite;
        }
        .tzbl-state:has(.tzbl-loader) p {
          font-size: 8px;
          letter-spacing: 2px;
          font-weight: 900;
        }
        .tzbl-list { display: grid; gap: 9px; }
        .tzbl-list article {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 15px 17px;
          border: 1px solid rgba(210,183,121,.2);
          background: rgba(255,255,255,.02);
        }
        .tzbl-list-seal {
          width: 40px;
          height: 40px;
          flex: 0 0 40px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(210,183,121,.5);
          border-radius: 50%;
          color: var(--gold);
        }
        .tzbl-list article > div { flex: 1; min-width: 0; }
        .tzbl-list article small { color: #9d8e70; font-size: 7px; letter-spacing: 1px; }
        .tzbl-list article h3 { margin: 4px 0; font-size: 14px; }
        .tzbl-list article p { margin: 0; color: #a49a87; font-size: 10px; }
        .tzbl-status,.tzbl-positive,.tzbl-negative {
          color: var(--gold-light);
          font-size: 8px;
          letter-spacing: .6px;
        }
        .tzbl-status.redeemed,.tzbl-negative { color: #a39882; }
        .tzbl-integrity {
          margin-top: 17px;
          color: #776a52;
          font-size: 7px;
          letter-spacing: 1.2px;
          line-height: 1.8;
        }
        .tzbl-banner {
          width: min(1180px, calc(100% - 44px));
          margin: auto;
          padding: 27px;
          display: flex;
          align-items: center;
          gap: 23px;
          border: 1px solid rgba(210,183,121,.35);
          background: radial-gradient(ellipse at 0 50%, rgba(210,183,121,.12), transparent 50%), #0c0b08;
        }
        .tzbl-banner-mark,.tzbl-banner-crest { color: var(--gold-light); }
        .tzbl-banner-crest {
          width: 57px;
          height: 57px;
          flex: 0 0 57px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(210,183,121,.65);
          color: var(--gold-light);
          font-size: 29px;
          font-weight: 950;
          transform: rotate(45deg);
        }
        .tzbl-banner small { color: var(--gold); font-size: 8px; font-weight: 900; letter-spacing: 2px; }
        .tzbl-banner h2 { margin: 6px 0; font-size: 25px; }
        .tzbl-banner p { margin: 0; color: #a69b87; font-size: 10px; }
        .tzbl-banner>a {
          margin-left: auto;
          color: var(--gold-light);
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
          white-space: nowrap;
        }
        .tzbl-banner>a span { margin-left: 7px; }
        .tzbl-footer {
          width: min(1180px, calc(100% - 44px));
          margin: 30px auto 0;
          padding: 16px 0;
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

        @keyframes tzblSpin { to { transform: rotate(360deg); } }
        @keyframes tzblFloat {
          0%,100% { transform: translateY(0) rotate(-6deg); }
          50% { transform: translateY(-13px) rotate(-1deg); }
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
        @keyframes tzblRise {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @media(max-width:850px) {
          .tzbl-hero { min-height: 500px; }
          .tzbl-hero-copy { width: 62%; }
          .tzbl-art { right: -60px; transform: translateY(-50%) scale(.82); }
          .tzbl-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
          .tzbl-merch-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
        }

        @media(max-width:600px) {
          .tzbl-header,.tzbl-hero,.tzbl-wallet,.tzbl-stats,
          .tzbl-collection,.tzbl-banner,.tzbl-footer,.tzbl-merch {
            width: calc(100% - 28px);
          }
          .tzbl-header { height: 60px; }
          .tzbl-edition { font-size: 6px; letter-spacing: 1px; }
          .tzbl-hero {
            min-height: 620px;
            align-items: flex-start;
            padding: 54px 0 280px;
          }
          .tzbl-hero-copy { width: 100%; }
          .tzbl-hero h1 { font-size: clamp(49px,12.5vw,66px); letter-spacing: -3px; }
          .tzbl-hero-copy>p { max-width: 350px; font-size: 12px; }
          .tzbl-hero-caption { gap: 12px; font-size: 7px; }
          .tzbl-art {
            top: auto;
            right: 50%;
            bottom: -6px;
            width: 330px;
            height: 330px;
            transform: translateX(50%) scale(.8);
          }
          .tzbl-hero-bottom { font-size: 6px; letter-spacing: .5px; }
          .tzbl-merch { padding: 42px 0 35px; }
          .tzbl-merch-heading h2 { font-size: 34px; }
          .tzbl-merch-heading p { font-size: 10px; }
          .tzbl-merch-index { font-size: 8px; }
          .tzbl-merch-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 9px; }
          .tzbl-merch-info { gap: 6px; padding: 10px; }
          .tzbl-merch-info h3 { font-size: 11px; }
          .tzbl-merch-info p { font-size: 9px; }
          .tzbl-merch-info strong { font-size: 15px; }
          .tzbl-wallet { flex-wrap: wrap; gap: 13px; padding: 19px 15px; }
          .tzbl-wallet-symbol { width: 42px; height: 42px; flex-basis: 42px; font-size: 21px; }
          .tzbl-wallet-copy { flex: 1; }
          .tzbl-wallet-copy h2 { font-size: 17px; }
          .tzbl-wallet-copy p { font-size: 9px; }
          .tzbl-wallet-balance { width: 100%; padding-left: 55px; text-align: left; }
          .tzbl-wallet-balance strong { font-size: 33px; }
          .tzbl-stats>div { padding: 12px 9px; }
          .tzbl-stats strong { font-size: 18px; }
          .tzbl-stats small { font-size: 6px; letter-spacing: .3px; }
          .tzbl-collection { padding: 58px 0 48px; }
          .tzbl-section-heading h2 { font-size: 33px; }
          .tzbl-section-heading p { font-size: 10px; }
          .tzbl-controls { align-items: flex-start; flex-direction: column; padding-bottom: 10px; }
          .tzbl-tabs { width: 100%; justify-content: space-between; }
          .tzbl-tabs button { padding: 0 5px; font-size: 7px; letter-spacing: .4px; }
          .tzbl-filters { gap: 3px; }
          .tzbl-filters button { padding: 0 8px; font-size: 7px; }
          .tzbl-grid { grid-template-columns: 1fr; gap: 11px; }
          .tzbl-ticket { min-height: 135px; }
          .tzbl-card-info p { min-height: 0; }
          .tzbl-banner { flex-wrap: wrap; gap: 15px; padding: 20px 15px; }
          .tzbl-banner-crest { width: 43px; height: 43px; flex-basis: 43px; font-size: 22px; }
          .tzbl-banner h2 { font-size: 21px; }
          .tzbl-banner p { font-size: 9px; }
          .tzbl-banner>a { margin-left: 58px; }
          .tzbl-footer { font-size: 6px; letter-spacing: .5px; }
          .tzbl-list article { gap: 9px; padding: 12px 10px; }
          .tzbl-list-seal { width: 33px; height: 33px; flex-basis: 33px; }
          .tzbl-list article h3 { font-size: 12px; }
          .tzbl-list article p { font-size: 9px; }
          .tzbl-status { font-size: 7px; }
        }

        @media(prefers-reduced-motion:reduce) {
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
