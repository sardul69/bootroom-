
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PaymentMode = "FULL" | "PARTIAL";

type GamePayButtonProps = {
  gameId: string;
  amount: number;
  bookingAmount?: number | null;
};

type JoinResponse = {
  ok?: boolean;
  keyId?: string;
  gameId?: string;
  gamePlayerId?: string;
  batchId?: string;
  quantity?: number;
  playerFee?: number;
  bookingAmount?: number;
  totalAmount?: number;
  totalDue?: number;
  outstandingBalance?: number;
  paymentMode?: PaymentMode;
  order?: {
    id: string;
    amount: number;
    currency: string;
  };
  error?: string;
};

type VerifyResponse = {
  ok?: boolean;
  paymentVerified?: boolean;
  bookingConfirmed?: boolean;
  reconciliationRequired?: boolean;
  error?: string;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (
        event: string,
        callback: (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => void
      ) => void;
    };
  }
}

export default function GamePayButton({
  gameId,
  amount,
  bookingAmount,
}: GamePayButtonProps) {
  const router = useRouter();

  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] =
    useState<PaymentMode>("FULL");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function money(value: number) {
    return `₹${value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  async function loadRazorpay(): Promise<boolean> {
    if (window.Razorpay) return true;

    return new Promise((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-razorpay-checkout="true"]'
      );

      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve(Boolean(window.Razorpay));
          return;
        }

        existing.addEventListener(
          "load",
          () => resolve(Boolean(window.Razorpay)),
          { once: true }
        );
        existing.addEventListener(
          "error",
          () => resolve(false),
          { once: true }
        );
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.razorpayCheckout = "true";
      script.onload = () => {
        script.dataset.loaded = "true";
        resolve(Boolean(window.Razorpay));
      };
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  const validBookingAmount =
    typeof bookingAmount === "number" &&
    Number.isFinite(bookingAmount) &&
    bookingAmount > 0 &&
    bookingAmount < amount;

  async function startPayment() {
    if (loading) return;

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      setMessage("Invalid player fee or number of slots.");
      return;
    }

    if (paymentMode === "PARTIAL" && !validBookingAmount) {
      setMessage(
        "The fixed booking amount is not configured correctly. Please choose full payment or contact support."
      );
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const scriptLoaded = await loadRazorpay();

      if (!scriptLoaded || !window.Razorpay) {
        setMessage(
          "Payment checkout could not load. Please check your connection and try again."
        );
        setLoading(false);
        return;
      }

      const joinResponse = await fetch("/api/games/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          gameId,
          quantity,
          paymentMode,
        }),
      });

      const joinData = (await joinResponse.json()) as JoinResponse;

      if (!joinResponse.ok || !joinData.ok || !joinData.order) {
        setMessage(
          joinData.error || "Could not reserve the requested slots."
        );
        setLoading(false);
        return;
      }

      const expectedTotalDuePaise = Math.round(
        amount * quantity * 100
      );

      const expectedPayNowPaise = Math.round(
        (paymentMode === "FULL"
          ? amount
          : Number(bookingAmount)) *
          quantity *
          100
      );

      if (
        joinData.paymentMode !== paymentMode ||
        !Number.isFinite(joinData.totalDue) ||
        !Number.isFinite(joinData.totalAmount) ||
        !Number.isFinite(joinData.outstandingBalance) ||
        Math.round(joinData.totalDue! * 100) !==
          expectedTotalDuePaise ||
        Math.round(joinData.totalAmount! * 100) !==
          expectedPayNowPaise ||
        (paymentMode === "PARTIAL" &&
          (!Number.isFinite(joinData.bookingAmount) ||
            Math.round(joinData.bookingAmount! * 100) !==
              Math.round(Number(bookingAmount) * 100))) ||
        Math.round(
          (joinData.totalAmount! +
            joinData.outstandingBalance!) *
            100
        ) !== Math.round(joinData.totalDue! * 100)
      ) {
        setMessage(
          "The server returned inconsistent payment details. Do not retry; contact support."
        );
        setLoading(false);
        return;
      }

      const isBatch = Boolean(joinData.batchId);
      const bookingId = isBatch
        ? joinData.batchId
        : joinData.gamePlayerId;

      if (
        !bookingId ||
        !joinData.keyId ||
        !joinData.order.id ||
        !Number.isSafeInteger(joinData.order.amount) ||
        joinData.order.amount <= 0 ||
        joinData.order.amount !==
          Math.round(joinData.totalAmount! * 100) ||
        joinData.order.amount !== expectedPayNowPaise
      ) {
        setMessage(
          "The payment order response is incomplete or inconsistent. Please contact support before retrying."
        );
        setLoading(false);
        return;
      }

      const checkout = new window.Razorpay({
        key: joinData.keyId,
        order_id: joinData.order.id,
        amount: joinData.order.amount,
        currency: joinData.order.currency || "INR",
        name: "TURFZY",
        description: isBatch
          ? `${joinData.quantity || quantity} player slot(s) — ${
              paymentMode === "PARTIAL"
                ? "fixed booking amount"
                : "full payment"
            }`
          : "Football game entry",
        theme: { color: "#78ffad" },
        modal: {
          ondismiss: () => {
            setLoading(false);
            setMessage(
              "Checkout closed. If you completed a payment, verify its status before attempting another payment."
            );
          },
        },
        handler: async (razorpayResult: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setMessage("Verifying payment securely. Please wait.");

          try {
            const verifyResponse = await fetch(
              "/api/games/payment/verify",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({
                  ...(isBatch
                    ? { batchId: bookingId }
                    : { gamePlayerId: bookingId }),
                  razorpayPaymentId:
                    razorpayResult.razorpay_payment_id,
                  razorpayOrderId:
                    razorpayResult.razorpay_order_id,
                  razorpaySignature:
                    razorpayResult.razorpay_signature,
                }),
              }
            );

            const verifyData =
              (await verifyResponse.json()) as VerifyResponse;

            if (
              verifyResponse.ok &&
              verifyData.ok &&
              verifyData.paymentVerified &&
              verifyData.bookingConfirmed
            ) {
              const params = new URLSearchParams({
                gameId,
                ...(isBatch
                  ? { batchId: bookingId }
                  : { gamePlayerId: bookingId }),
              });

              router.push(`/Payment/Success?${params.toString()}`);
              return;
            }

            if (
              verifyData.paymentVerified ||
              verifyData.reconciliationRequired
            ) {
              setMessage(
                "Payment was verified, but booking confirmation is pending. Do not pay again. Keep your payment ID and contact support."
              );
              return;
            }

            setMessage(
              verifyData.error ||
                "Payment could not be confirmed. Check its status before trying again."
            );
          } catch {
            setMessage(
              "We could not confirm the booking status. Do not pay again until the payment has been checked."
            );
          } finally {
            setLoading(false);
          }
        },
      });

      checkout.on("payment.failed", () => {
        setMessage(
          "Payment was not confirmed. If your bank shows a debit, do not pay again until its status is checked."
        );
        setLoading(false);
      });

      checkout.open();
    } catch (error) {
      console.error("Unable to start TURFZY checkout:", error);
      setMessage("Unable to start checkout. Please try again.");
      setLoading(false);
    }
  }

  const totalDue = Math.round(amount * quantity * 100) / 100;

  const payNow =
    paymentMode === "PARTIAL" && validBookingAmount
      ? Math.round(bookingAmount! * quantity * 100) / 100
      : totalDue;

  const remaining = Math.max(0, totalDue - payNow);

  const panelStyle = {
    boxSizing: "border-box" as const,
    width: "100%",
    minWidth: 0,
    border: "1px solid rgba(120,255,173,0.23)",
    borderRadius: 20,
    background: "linear-gradient(145deg, #101d15 0%, #090f0b 100%)",
    padding: "clamp(18px, 4vw, 26px)",
    boxShadow: "0 16px 45px rgba(0,0,0,0.2)",
    color: "#f5f8f5",
  };

  const slotButtonStyle = {
    width: 44,
    height: 44,
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    border: "1px solid rgba(120,255,173,0.28)",
    background: "#142219",
    color: "#78ffad",
    fontSize: 25,
    lineHeight: 1,
    fontWeight: 600,
    flexShrink: 0,
  } as const;

  const paymentOptionStyle = (selected: boolean) => ({
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    padding: 16,
    borderRadius: 14,
    border: selected
      ? "1px solid #78ffad"
      : "1px solid rgba(255,255,255,0.13)",
    background: selected ? "rgba(120,255,173,0.09)" : "#0b120d",
    color: "#f5f8f5",
    cursor: loading ? "not-allowed" : "pointer",
    opacity: loading ? 0.7 : 1,
  });

  return (
    <div
      style={{
        display: "grid",
        gap: 16,
        width: "100%",
        minWidth: 0,
        color: "#f5f8f5",
      }}
    >
      <section style={panelStyle}>
        <p
          style={{
            margin: "0 0 10px",
            color: "#78ffad",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.2em",
          }}
        >
          PLAYER PAYMENT
        </p>

        <h2
          style={{
            margin: "0 0 10px",
            fontSize: "clamp(25px, 5vw, 34px)",
            fontWeight: 850,
            lineHeight: 1.2,
            letterSpacing: "-0.035em",
          }}
        >
          Choose your slots
        </h2>

        <p
          style={{
            margin: "0 0 25px",
            color: "#a7b7ac",
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          Reserve a place for yourself or your squad. Availability is checked
          securely before checkout.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 750 }}>
              Player slots
            </p>
            <p
              style={{
                margin: "5px 0 0",
                color: "#8fa194",
                fontSize: 13,
              }}
            >
              {quantity === 1
                ? "1 player selected"
                : `${quantity} players selected`}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 6,
              borderRadius: 16,
              border: "1px solid rgba(120,255,173,0.28)",
              background: "#070d09",
            }}
          >
            <button
              type="button"
              aria-label="Remove one player slot"
              disabled={loading || quantity <= 1}
              onClick={() =>
                setQuantity((current) => Math.max(1, current - 1))
              }
              style={{
                ...slotButtonStyle,
                opacity: quantity <= 1 || loading ? 0.4 : 1,
                cursor:
                  quantity <= 1 || loading ? "not-allowed" : "pointer",
              }}
            >
              −
            </button>

            <span
              aria-live="polite"
              style={{
                minWidth: 25,
                textAlign: "center",
                fontSize: 22,
                fontWeight: 850,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {quantity}
            </span>

            <button
              type="button"
              aria-label="Add one player slot"
              disabled={loading || quantity >= 10}
              onClick={() =>
                setQuantity((current) => Math.min(10, current + 1))
              }
              style={{
                ...slotButtonStyle,
                opacity: quantity >= 10 || loading ? 0.4 : 1,
                cursor:
                  quantity >= 10 || loading ? "not-allowed" : "pointer",
              }}
            >
              +
            </button>
          </div>
        </div>

        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.1)",
            margin: "25px 0 20px",
          }}
        />

        <p
          style={{
            margin: "0 0 12px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.12em",
            color: "#a7b7ac",
          }}
        >
          CHOOSE PAYMENT OPTION
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          <button
            type="button"
            disabled={loading}
            aria-pressed={paymentMode === "FULL"}
            onClick={() => setPaymentMode("FULL")}
            style={paymentOptionStyle(paymentMode === "FULL")}
          >
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <strong>Pay in Full</strong>
              <strong style={{ color: "#78ffad" }}>
                {money(totalDue)}
              </strong>
            </span>
            <span
              style={{
                display: "block",
                marginTop: 6,
                color: "#a7b7ac",
                fontSize: 13,
              }}
            >
              Pay the entire fee now. No balance remains.
            </span>
          </button>

          <button
            type="button"
            disabled={loading || !validBookingAmount}
            aria-pressed={paymentMode === "PARTIAL"}
            onClick={() => setPaymentMode("PARTIAL")}
            style={paymentOptionStyle(paymentMode === "PARTIAL")}
          >
            <span
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
              }}
            >
              <strong>Pay Booking Amount</strong>
              <strong style={{ color: "#78ffad" }}>
                {validBookingAmount
                  ? money(bookingAmount! * quantity)
                  : "Unavailable"}
              </strong>
            </span>
            <span
              style={{
                display: "block",
                marginTop: 6,
                color: "#a7b7ac",
                fontSize: 13,
              }}
            >
              {validBookingAmount
                ? `Pay ${money(bookingAmount!)} per player now and settle the remaining ${money(remaining)} later.`
                : "The owner has not configured a valid booking amount for this game."}
            </span>
          </button>
        </div>

        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.1)",
            margin: "22px 0 18px",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 12,
            alignItems: "start",
          }}
        >
          <div>
            <p style={{ margin: "0 0 6px", color: "#a7b7ac", fontSize: 12 }}>
              PRICE PER PLAYER
            </p>
            <p style={{ margin: 0, fontSize: 17, fontWeight: 750 }}>
              {money(amount)}
            </p>
          </div>

          <div style={{ textAlign: "right" }}>
            <p style={{ margin: "0 0 6px", color: "#a7b7ac", fontSize: 12 }}>
              PAY NOW
            </p>
            <p
              style={{
                margin: 0,
                color: "#78ffad",
                fontSize: "clamp(25px, 5.5vw, 32px)",
                fontWeight: 900,
                lineHeight: 1.15,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {money(payNow)}
            </p>
          </div>
        </div>

        {paymentMode === "PARTIAL" && (
          <p
            style={{
              margin: "14px 0 0",
              color: "#d6e4d9",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Total fee: {money(totalDue)} · Pay now: {money(payNow)} ·
            Remaining: {money(remaining)}
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={startPayment}
        disabled={
          loading ||
          (paymentMode === "PARTIAL" && !validBookingAmount)
        }
        style={{
          boxSizing: "border-box",
          width: "100%",
          minHeight: 58,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          border: "1px solid #a8ffc5",
          borderRadius: 16,
          padding: "17px 20px",
          background: loading
            ? "#42664e"
            : "linear-gradient(100deg, #78ffad 0%, #a8ffc5 100%)",
          color: "#06110a",
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: "0.045em",
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.78 : 1,
          boxShadow: loading
            ? "none"
            : "0 8px 26px rgba(120,255,173,0.16)",
        }}
      >
        <span>
          {loading ? "PROCESSING PAYMENT…" : `PAY ${money(payNow)}`}
        </span>
        {!loading && (
          <span aria-hidden="true" style={{ fontSize: 21, lineHeight: 1 }}>
            →
          </span>
        )}
      </button>

      <p
        style={{
          margin: 0,
          color: "#9eafa3",
          fontSize: 12,
          lineHeight: 1.7,
          textAlign: "center",
        }}
      >
        Your booking is confirmed only after payment verification. If payment
        may already have been captured, do not pay again until its status is
        checked.
      </p>

      {message && (
        <p
          role="status"
          aria-live="polite"
          style={{
            margin: 0,
            padding: 14,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.15)",
            background: "#111a14",
            color: "#f5f8f5",
            fontSize: 14,
            lineHeight: 1.6,
            overflowWrap: "anywhere",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
