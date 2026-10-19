
import Link from "next/link";

export default function MarketplacePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px 16px 80px",
        color: "#f4fff7",
        background:
          "radial-gradient(ellipse at 85% 0%, rgba(35,160,88,0.16), transparent 35%), #050907",
      }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <Link
          href="/"
          style={{
            color: "#9debb7",
            textDecoration: "none",
            fontSize: 13,
          }}
        >
          ← Back to Home
        </Link>

        <p
          style={{
            marginTop: 32,
            color: "#78ffad",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 3,
          }}
        >
          TURFZY REWARDS
        </p>

        <h1 style={{ fontSize: "clamp(34px, 7vw, 58px)", margin: "12px 0" }}>
          The Marketplace
        </h1>

        <p style={{ color: "#a9c0b1", lineHeight: 1.8, maxWidth: 600 }}>
          Your coins. Your rewards. Redeem coins for eligible discounts on
          your individual game fee.
        </p>

        <section
          style={{
            marginTop: 30,
            padding: 24,
            borderRadius: 20,
            border: "1px solid rgba(120,255,173,0.2)",
            background: "linear-gradient(135deg,#10251a,#09130d)",
          }}
        >
          <p style={{ margin: 0, color: "#a9c0b1", fontSize: 12 }}>
            YOUR WALLET
          </p>
          <h2 style={{ fontSize: 28, margin: "10px 0" }}>
            Coins balance
          </h2>
          <p style={{ color: "#a9c0b1", fontSize: 13, lineHeight: 1.7 }}>
            Your verified balance and transaction history will appear here
            once the rewards backend is connected.
          </p>
        </section>

        <h2 style={{ marginTop: 38, fontSize: 23 }}>Discount coupons</h2>
        <p style={{ color: "#a9c0b1", lineHeight: 1.7 }}>
          Choose a reward to see its coin cost and redemption terms.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,220px),1fr))",
            gap: 14,
            marginTop: 20,
          }}
        >
          {[
            { discount: "₹10 OFF", coins: 100 },
            { discount: "₹20 OFF", coins: 200 },
            { discount: "₹25 OFF", coins: 250 },
            { discount: "₹40 OFF", coins: 400 },
            { discount: "₹50 OFF", coins: 500 },
            { discount: "FREE GAME FEE", coins: 1000 },
          ].map((coupon) => (
            <article
              key={coupon.discount}
              style={{
                padding: 20,
                borderRadius: 17,
                border: "1px solid rgba(255,255,255,0.09)",
                background: "rgba(255,255,255,0.025)",
              }}
            >
              <p
                style={{
                  color: "#78ffad",
                  fontSize: 22,
                  fontWeight: 850,
                  margin: "0 0 10px",
                }}
              >
                {coupon.discount}
              </p>
              <p style={{ color: "#b7c8bd", fontSize: 13 }}>
                Cost: {coupon.coins} coins
              </p>
              <button
                type="button"
                disabled
                style={{
                  width: "100%",
                  minHeight: 42,
                  borderRadius: 999,
                  border: "1px solid rgba(120,255,173,0.2)",
                  background: "#14251a",
                  color: "#8ca897",
                  fontWeight: 750,
                  cursor: "not-allowed",
                }}
              >
                Coming soon
              </button>
            </article>
          ))}
        </div>

        <p style={{ marginTop: 24, color: "#7f9989", fontSize: 12, lineHeight: 1.7 }}>
          Coupon prices are proposed previews, not active offers. Purchases
          remain disabled until balances, eligibility, and payment processing
          are verified by the server.
        </p>
      </div>
    </main>
  );
}
