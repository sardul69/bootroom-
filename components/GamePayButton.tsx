
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type GamePayButtonProps = {
  gameId: string;
  amount: number;
};

type JoinResponse = {
  ok?: boolean;
  keyId?: string;
  gameId?: string;
  gamePlayerId?: string;
  batchId?: string;
  quantity?: number;
  playerFee?: number;
  totalAmount?: number;
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
}: GamePayButtonProps) {
  const router = useRouter();

  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadRazorpay(): Promise<boolean> {
    if (window.Razorpay) return true;

    return new Promise((resolve) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-razorpay-checkout="true"]'
      );

      if (existing) {
        existing.addEventListener("load", () =>
          resolve(Boolean(window.Razorpay))
        );
        existing.addEventListener("error", () => resolve(false));
        return;
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.dataset.razorpayCheckout = "true";
      script.onload = () => resolve(Boolean(window.Razorpay));
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function startPayment() {
    if (loading) return;

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      setMessage("Invalid booking amount or number of slots.");
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
        return;
      }

      const joinResponse = await fetch("/api/games/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          gameId,
          quantity,
        }),
      });

      const joinData = (await joinResponse.json()) as JoinResponse;

      if (!joinResponse.ok || !joinData.ok || !joinData.order) {
        setMessage(joinData.error || "Could not reserve the requested slots.");
        return;
      }

      const isBatch = Boolean(joinData.batchId);
      const bookingId = isBatch
        ? joinData.batchId!
        : joinData.gamePlayerId;

      if (
        !bookingId ||
        !joinData.keyId ||
        !joinData.order.id ||
        !Number.isSafeInteger(joinData.order.amount) ||
        joinData.order.amount <= 0
      ) {
        setMessage("The payment order response is incomplete. Please contact support before retrying.");
        return;
      }

      const checkout = new window.Razorpay({
        key: joinData.keyId,
        order_id: joinData.order.id,
        amount: joinData.order.amount,
        currency: joinData.order.currency || "INR",
        name: "TURFZY",
        description: isBatch
          ? `${joinData.quantity || quantity} player slot(s)`
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
                  razorpayPaymentId: razorpayResult.razorpay_payment_id,
                  razorpayOrderId: razorpayResult.razorpay_order_id,
                  razorpaySignature: razorpayResult.razorpay_signature,
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
    } finally {
      // Keep the button locked while the checkout window is active.
      // Checkout callbacks release it after dismissal or verification.
    }
  }

  const total = Math.round(amount * quantity * 100) / 100;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <label
          htmlFor="turfzy-slot-quantity"
          className="mb-2 block text-sm font-medium text-white"
        >
          Player slots
        </label>

        <select
          id="turfzy-slot-quantity"
          value={quantity}
          disabled={loading}
          onChange={(event) => setQuantity(Number(event.target.value))}
          className="w-full rounded-xl border border-white/15 bg-[#101713] px-4 py-3 text-white outline-none focus:border-emerald-400"
        >
          {Array.from({ length: 10 }, (_, index) => index + 1).map((count) => (
            <option key={count} value={count}>
              {count} {count === 1 ? "player" : "players"}
            </option>
          ))}
        </select>

        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="text-sm text-white/60">
            ₹{amount.toFixed(2)} per player
          </span>
          <span className="text-lg font-semibold text-emerald-300">
            ₹{total.toFixed(2)} total
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={startPayment}
        disabled={loading}
        className="w-full rounded-xl bg-emerald-300 px-5 py-4 font-bold text-black transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Processing…" : `Pay ₹${total.toFixed(2)}`}
      </button>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80"
        >
          {message}
        </p>
      )}
    </div>
  );
}
