"use client";

import { useState } from "react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

type Props = {
  gameId: string;
  amount: number;
};

export default function GamePayButton({ gameId, amount }: Props) {
  const [loading, setLoading] = useState(false);

  async function handlePay() {
    try {
      setLoading(true);

      const response = await fetch("/api/games/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ gameId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to start payment");
      }

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;

      script.onload = () => {
        const razorpay = new window.Razorpay({
          key: data.keyId,
          amount: data.order.amount,
          currency: data.order.currency,
          name: "BOOTROOM",
          description: "Football game player fee",
          order_id: data.order.Id,

          handler: async function (payment: any) {
            const verifyResponse = await fetch(
              "/api/games/payment/verify",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  gamePlayerId: data.gamePlayerId,
                  razorpayPaymentId: payment.razorpay_payment_id,
                  razorpayOrderId: payment.razorpay_order_id,
                  razorpaySignature: payment.razorpay_signature,
                }),
              }
            );

            const verifyData = await verifyResponse.json();

            if (!verifyResponse.ok) {
              alert(verifyData.error || "Payment verification failed");
              return;
            }

            window.location.href = `/matches/${gameId}`;
          },

          modal: {
            ondismiss: () => {
              setLoading(false);
            },
          },

          theme: {
            color: "#000000",
          },
        });

        razorpay.open();
        setLoading(false);
      };

      script.onerror = () => {
        setLoading(false);
        alert("Unable to load Razorpay.");
      };

      document.body.appendChild(script);
    } catch (error: any) {
      setLoading(false);
      alert(error.message || "Something went wrong");
    }
  }

  return (
    <button
      type="button"
      onClick={handlePay}
      disabled={loading}
    >
      {loading ? "STARTING PAYMENT..." : `PAY ₹${amount.toFixed(0)}`}
    </button>
  );
}