
"use client";

import Link from "next/link";

const couponPreviews = [
  { discount: "₹10 OFF", coins: 100, description: "A little reward for your next game." },
  { discount: "₹25 OFF", coins: 250, description: "Save more on your next match." },
  { discount: "₹50 OFF", coins: 500, description: "A bigger reward for dedicated players." },
];

export default function MarketplaceSection() {
  return (
    <section
      aria-labelledby="marketplace-heading"
      style={{
        margin: "36px auto",
        width: "min(1120px, calc(100% - 32px))",
        color: "#f4fff7",
      }}
    >
      <div
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "clamp(20px, 4vw, 32px)",
          border: "1px solid rgba(120,255,173,0.20)",
          borderRadius: 24,
          background:
            "radial-gradient(ellipse at 100% 0%, rgba(35,160,88,0.18), transparent 42%), linear-gradient(135deg,#07100b,#0b1911 65%,#07100b)",
          boxShadow: "0 18px 55px rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 26,
          }}
        >
          <div>
            <p
              style={{
                margin: "0 0 9px",
                color: "#78ffad",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 3,
              }}
            >
              THE TURFZY MARKETPLACE
            </p>
            <h2
              id="marketplace-heading"
              style={{
                margin: 0,
                fontSize: "clamp(25px, 4vw, 36px)",
                lineHeight: 1.15,
                letterSpacing: "-1px",
              }}
            >
              Your rewards. Your game.
            </h2>
            <p style={{ color: "#a9c0b1", margin: "10px 0 0", lineHeight: 1.7 }}>
              Earn coins on the pitch. Redeem them for rewards.
            </p>
          </div>

          <Link
            href="/marketplace"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minHeight: 44,
              padding: "0 18px",
              borderRadius: 999,
              border: "1px solid rgba(120,255,173,0.38)",
              background: "linear-gradient(135deg,#153b25,#0d2417)",
              color: "#a5ffc4",
              textDecoration: "none",
              fontWeight: 750,
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            Explore rewards <span aria-hidden="true">↗</span>
          </Link>
        </div>

        <Link
          href="/marketplace"
          aria-label="Open your rewards wallet"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "19px 20px",
            marginBottom: 26,
            borderRadius: 17,
            border: "1px solid rgba(120,255,173,0.16)",
            background: "rgba(16,40,26,0.78)",
            color: "inherit",
            textDecoration: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              aria-hidden="true"
              style={{
                display: "grid",
                placeItems: "center",
                width: 46,
                height: 46,
                borderRadius: 14,
                background: "rgba(120,255,173,0.10)",
                fontSize: 24,
              }}
            >
              ◈
            </div>
            <div>
              <p
                style={{
                  margin: "0 0 5px",
                  color: "#a9c0b1",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.6,
                }}
              >
                YOUR REWARDS WALLET
              </p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>
                View your coin balance
              </p>
            </div>
          </div>
          <span style={{ color: "#78ffad", fontSize: 13, fontWeight: 750 }}>
            View wallet →
          </span>
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>Featured coupons</h3>
            <p style={{ margin: "5px 0 0", color: "#a9c0b1", fontSize: 12 }}>
              Redeem coins for eligible game-fee discounts.
            </p>
          </div>
          <span style={{ color: "#78ffad", fontSize: 11, fontWeight: 800 }}>
            REWARDS
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 205px), 1fr))",
            gap: 12,
          }}
        >
          {couponPreviews.map((coupon) => (
            <Link
              href="/marketplace"
              key={coupon.discount}
              style={{
                display: "block",
                padding: 18,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))",
                color: "inherit",
                textDecoration: "none",
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: "#78ffad",
                  fontSize: 23,
                  fontWeight: 850,
                  letterSpacing: -0.5,
                }}
              >
                {coupon.discount}
              </p>
              <p
                style={{
                  margin: "9px 0 15px",
                  minHeight: 38,
                  color: "#b7c8bd",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                {coupon.description}
              </p>
              <span
                style={{
                  display: "inline-flex",
                  padding: "7px 11px",
                  borderRadius: 999,
                  background: "rgba(120,255,173,0.09)",
                  color: "#a5ffc4",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {coupon.coins} coins ↗
              </span>
            </Link>
          ))}
        </div>

        <p style={{ margin: "18px 0 0", color: "#7f9989", fontSize: 11, lineHeight: 1.6 }}>
          Preview only: balances, prices and coupon availability must be verified by
          the rewards backend before purchases are enabled.
        </p>
      </div>
    </section>
  );
}
