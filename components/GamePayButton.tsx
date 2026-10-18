
"use client";

import { useRef, useState } from "react";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (event: any) => void) => void;
    };
  }
}

type Props = {
  gameId: string;
  amount: number;
};

type OrderResponse = {
  keyId?: string;
  gamePlayerId?: string;
  order?: {
    id?: string;
    amount?: number;
    currency?: string;
  };
  error?: string;
};

type VerificationResponse = {
  ok?: boolean;
  paymentVerified?: boolean;
  bookingConfirmed?: boolean;
  error?: string;
};

const RAZORPAY_SCRIPT =
  "https://checkout.razorpay.com/v1/checkout.js";

let razorpayScriptPromise: Promise<void> | null = null;

function loadRazorpay(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Checkout is unavailable."));
  }

  if (window.Razorpay) return Promise.resolve();

  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise<void>((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_SCRIPT}"]`
    );

    const createdHere = !script;

    if (!script) {
      script = document.createElement("script");
      script.src = RAZORPAY_SCRIPT;
      script.async = true;
    }

    const currentScript = script;

    const cleanup = () => {
      currentScript.removeEventListener("load", onLoad);
      currentScript.removeEventListener("error", onError);
    };

    const onLoad = () => {
      cleanup();

      if (window.Razorpay) {
        resolve();
      } else {
        reject(new Error("Razorpay did not initialize correctly."));
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("Could not load Razorpay checkout."));
    };

    currentScript.addEventListener("load", onLoad, { once: true });
    currentScript.addEventListener("error", onError, { once: true });

    if (createdHere) {
      document.body.appendChild(currentScript);
    }

    // Handle an existing script that finished loading before listeners
    // were attached.
    if (window.Razorpay) {
      cleanup();
      resolve();
    }
  }).catch((error) => {
    razorpayScriptPromise = null;
    throw error;
  });

  return razorpayScriptPromise;
}

export default function GamePayButton({ gameId, amount }: Props) {
  const [loading, setLoading] = useState(false);
  const inProgress = useRef(false);
  const verificationStarted = useRef(false);

  function resetPaymentState() {
    inProgress.current = false;
    verificationStarted.current = false;
    setLoading(false);
  }

  async function handlePay() {
    if (inProgress.current) return;

    if (!gameId || !Number.isFinite(amount) || amount <= 0) {
      alert("Game or player-fee details are invalid. Please refresh.");
      return;
    }

    inProgress.current = true;
    verificationStarted.current = false;
    setLoading(true);

    try {
      // The server must calculate the fee and create the order.
      // Never use the browser's amount as the authoritative charge amount.
      const orderResponse = await fetch("/api/games/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId }),
        cache: "no-store",
      });

      const orderData = (await orderResponse
        .json()
        .catch(() => null)) as OrderResponse | null;

      if (!orderResponse.ok) {
        throw new Error(
          orderData?.error || "Unable to create a payment order."
        );
      }

      const order = orderData?.order;

      if (
        !orderData?.keyId ||
        !orderData.gamePlayerId ||
        !order?.id ||
        !Number.isSafeInteger(order.amount) ||
        Number(order.amount) <= 0 ||
        order.currency !== "INR"
      ) {
        throw new Error(
          "The server returned an invalid payment order. No payment was started."
        );
      }

      await loadRazorpay();

      if (!window.Razorpay) {
        throw new Error("Razorpay checkout is unavailable.");
      }

      const razorpay = new window.Razorpay({
        key: orderData.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "TURFZY",
        description: "Football game player fee",
        order_id: order.id,
        retry: { enabled: true },
        theme: { color: "#050b09" },

        handler: async (payment: {
          razorpay_payment_id?: string;
          razorpay_order_id?: string;
          razorpay_signature?: string;
        }) => {
          // A checkout callback is not proof of a captured payment.
          if (verificationStarted.current) return;
          verificationStarted.current = true;
          setLoading(true);

          try {
            if (
              !payment?.razorpay_payment_id ||
              payment.razorpay_order_id !== order.id ||
              !payment.razorpay_signature
            ) {
              throw new Error(
                "The payment response is incomplete. Check your booking and bank account before attempting payment again."
              );
            }

            const verifyResponse = await fetch(
              "/api/games/payment/verify",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  gamePlayerId: orderData.gamePlayerId,
                  razorpayPaymentId: payment.razorpay_payment_id,
                  razorpayOrderId: payment.razorpay_order_id,
                  razorpaySignature: payment.razorpay_signature,
                }),
                cache: "no-store",
              }
            );

            const verifyData = (await verifyResponse
              .json()
              .catch(() => null)) as VerificationResponse | null;

            if (
              !verifyResponse.ok ||
              verifyData?.ok !== true ||
              verifyData?.paymentVerified !== true ||
              verifyData?.bookingConfirmed !== true
            ) {
              throw new Error(
                verifyData?.error ||
                  "Turfzy could not confirm this payment yet. Do not pay again. Check your booking and bank account; if money was debited, contact support for reconciliation."
              );
            }
           
            const confirmedGamePlayerId = orderData.gamePlayerId;

if (!confirmedGamePlayerId) {
  throw new Error(
    "Booking reference is missing. Do not pay again; check your booking status."
  );
}

window.location.assign(
  `/Payment/Success?gameId=${encodeURIComponent(
    gameId
  )}&gamePlayerId=${encodeURIComponent(confirmedGamePlayerId)}`
);
          
          
          } catch (error) {
            alert(
              error instanceof Error
                ? error.message
                : "Payment status could not be confirmed. Do not pay again until the status is checked."
            );

            resetPaymentState();
          }
        },

        modal: {
          ondismiss: () => {
            // Do not unlock the button while server verification is running.
            if (!verificationStarted.current) {
              resetPaymentState();
            }
          },
        },
      });

      razorpay.on("payment.failed", (event: any) => {
        const description =
          event?.error?.description ||
          "The payment provider reported a failed attempt.";

        alert(
          `${description}\n\nCheck your bank/UPI app for any debit. If money was debited, do not pay again until the transaction status is checked.`
        );

        resetPaymentState();
      });

      razorpay.open();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Could not start checkout. Please check your booking status before retrying."
      );

      resetPaymentState();
    }
  }

  return (
    <button
      type="button"
      onClick={handlePay}
      disabled={loading}
      aria-busy={loading}
    >
      {loading ? "PROCESSING SECURELY..." : `PAY ₹${amount.toFixed(0)}`}
    </button>
  );
}
