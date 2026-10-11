
import "server-only";

import crypto from "node:crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";

type RazorpayOrder = {
  id: string;
  entity: "order";
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string | null;
  status: "created" | "attempted" | "paid";
};

type RazorpayPayment = {
  id: string;
  entity: "payment";
  order_id: string | null;
  amount: number;
  currency: string;
  status:
    | "created"
    | "authorized"
    | "captured"
    | "refunded"
    | "failed";
  captured: boolean;
  amount_refunded: number;
};

function getCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay server credentials are not configured");
  }

  if (
    !/^rzp_(test|live)_/.test(keyId) ||
    keySecret.length === 0
  ) {
    throw new Error("Razorpay server credentials are invalid");
  }

  return { keyId, keySecret };
}

function safeEqualHex(expected: Buffer, receivedHex: string): boolean {
  if (
    typeof receivedHex !== "string" ||
    !/^[a-f0-9]{64}$/i.test(receivedHex)
  ) {
    return false;
  }

  const received = Buffer.from(receivedHex, "hex");

  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

function signatureFor(
  secret: string,
  message: string
): Buffer {
  return crypto
    .createHmac("sha256", secret)
    .update(message, "utf8")
    .digest();
}

async function razorpayRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const { keyId, keySecret } = getCredentials();

  const response = await fetch(`${RAZORPAY_API}${path}`, {
    ...init,
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Do not expose credentials or raw provider responses.
    throw new Error(
      `Razorpay API request failed with HTTP ${response.status}`
    );
  }

  return (await response.json()) as T;
}

export async function createRazorpayOrder(input: {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0
  ) {
    throw new Error("Order amount must be a positive integer in paise");
  }

  if (
    typeof input.receipt !== "string" ||
    input.receipt.length === 0 ||
    input.receipt.length > 40
  ) {
    throw new Error("Invalid Razorpay order receipt");
  }

  if (
    input.notes &&
    Object.entries(input.notes).some(
      ([key, value]) =>
        !key ||
        key.length > 256 ||
        typeof value !== "string" ||
        value.length > 256
    )
  ) {
    throw new Error("Invalid Razorpay order notes");
  }

  const order = await razorpayRequest<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
    }),
  });

  if (
    !order.id ||
    order.amount !== input.amount ||
    order.currency !== "INR"
  ) {
    throw new Error("Razorpay returned an unexpected order");
  }

  return order;
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (
    typeof orderId !== "string" ||
    !orderId.startsWith("order_") ||
    typeof paymentId !== "string" ||
    !paymentId.startsWith("pay_")
  ) {
    return false;
  }

  const { keySecret } = getCredentials();

  return safeEqualHex(
    signatureFor(keySecret, `${orderId}|${paymentId}`),
    signature
  );
}

export async function fetchRazorpayOrder(
  orderId: string
): Promise<RazorpayOrder> {
  if (
    typeof orderId !== "string" ||
    !/^order_[A-Za-z0-9]+$/.test(orderId)
  ) {
    throw new Error("Invalid Razorpay order ID");
  }

  return razorpayRequest<RazorpayOrder>(
    `/orders/${encodeURIComponent(orderId)}`
  );
}

export async function fetchRazorpayPayment(
  paymentId: string
): Promise<RazorpayPayment> {
  if (
    typeof paymentId !== "string" ||
    !/^pay_[A-Za-z0-9]+$/.test(paymentId)
  ) {
    throw new Error("Invalid Razorpay payment ID");
  }

  return razorpayRequest<RazorpayPayment>(
    `/payments/${encodeURIComponent(paymentId)}`
  );
}

export function verifyRazorpayWebhook(
  rawBody: string,
  signature: string
): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (
    typeof rawBody !== "string" ||
    !webhookSecret ||
    !webhookSecret.length
  ) {
    return false;
  }

  return safeEqualHex(
    signatureFor(webhookSecret, rawBody),
    signature
  );
}
