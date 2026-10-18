
import "server-only";

import crypto from "node:crypto";

const RAZORPAY_API = "https://api.razorpay.com/v1";
const REQUEST_TIMEOUT_MS = 10_000;

type RazorpayMode = "test" | "live";

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

type RazorpayCredentials = {
  keyId: string;
  keySecret: string;
  mode: RazorpayMode;
};

function getCredentials(): RazorpayCredentials {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const expectedMode = process.env.RAZORPAY_EXPECTED_MODE?.trim();

  if (!keyId || !keySecret?.trim()) {
    throw new Error("Razorpay server credentials are not configured.");
  }

  if (expectedMode !== "test" && expectedMode !== "live") {
    throw new Error(
      "Set RAZORPAY_EXPECTED_MODE to exactly 'test' or 'live'."
    );
  }

  const match = /^rzp_(test|live)_[A-Za-z0-9]+$/.exec(keyId);

  if (!match) {
    throw new Error("Razorpay Key ID has an invalid format.");
  }

  const mode = match[1] as RazorpayMode;

  if (mode !== expectedMode) {
    throw new Error(
      `Razorpay environment mismatch: expected ${expectedMode}, received ${mode}.`
    );
  }

  return { keyId, keySecret, mode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isSafeIdentifier(
  value: unknown,
  prefix: "order_" | "pay_"
): value is string {
  return (
    typeof value === "string" &&
    new RegExp(`^${prefix}[A-Za-z0-9]+$`).test(value)
  );
}

function safeEqualHex(expected: Buffer, receivedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) {
    return false;
  }

  const received = Buffer.from(receivedHex, "hex");

  return (
    received.length === expected.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

function signatureFor(secret: string, message: string): Buffer {
  return crypto
    .createHmac("sha256", secret)
    .update(message, "utf8")
    .digest();
}

function validateOrder(
  value: unknown,
  expectedAmount?: number
): RazorpayOrder {
  if (
    !isRecord(value) ||
    value.entity !== "order" ||
    !isSafeIdentifier(value.id, "order_") ||
    !Number.isSafeInteger(value.amount) ||
    !Number.isSafeInteger(value.amount_paid) ||
    !Number.isSafeInteger(value.amount_due) ||
    Number(value.amount) <= 0 ||
    Number(value.amount_paid) < 0 ||
    Number(value.amount_due) < 0 ||
    Number(value.amount_paid) > Number(value.amount) ||
    Number(value.amount_due) > Number(value.amount) ||
    Number(value.amount_paid) + Number(value.amount_due) !==
      Number(value.amount) ||
    value.currency !== "INR" ||
    !["created", "attempted", "paid"].includes(String(value.status)) ||
    !(
      value.receipt === null ||
      (typeof value.receipt === "string" &&
        value.receipt.length <= 40)
    ) ||
    (expectedAmount !== undefined && value.amount !== expectedAmount)
  ) {
    throw new Error("Razorpay returned an invalid order response.");
  }

  return value as unknown as RazorpayOrder;
}

function validatePayment(value: unknown): RazorpayPayment {
  if (
    !isRecord(value) ||
    value.entity !== "payment" ||
    !isSafeIdentifier(value.id, "pay_") ||
    !(
      value.order_id === null ||
      isSafeIdentifier(value.order_id, "order_")
    ) ||
    !Number.isSafeInteger(value.amount) ||
    Number(value.amount) <= 0 ||
    value.currency !== "INR" ||
    !["created", "authorized", "captured", "refunded", "failed"].includes(
      String(value.status)
    ) ||
    typeof value.captured !== "boolean" ||
    !Number.isSafeInteger(value.amount_refunded) ||
    Number(value.amount_refunded) < 0 ||
    Number(value.amount_refunded) > Number(value.amount)
  ) {
    throw new Error("Razorpay returned an invalid payment response.");
  }

  // A refunded payment was previously captured; do not reject it
  // merely because its current status is "refunded".
  if (
    (value.status === "captured" || value.status === "refunded") &&
    value.captured !== true
  ) {
    throw new Error("Razorpay payment status is inconsistent.");
  }

  if (
    (value.status === "created" ||
      value.status === "authorized" ||
      value.status === "failed") &&
    value.captured !== false
  ) {
    throw new Error("Razorpay payment status is inconsistent.");
  }

  if (
    value.status === "refunded" &&
    Number(value.amount_refunded) <= 0
  ) {
    throw new Error("Razorpay refund details are inconsistent.");
  }

  return value as unknown as RazorpayPayment;
}

async function razorpayRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid Razorpay API path.");
  }

  const { keyId, keySecret } = getCredentials();
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const headers = new Headers(init?.headers);

    headers.set(
      "Authorization",
      `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`
    );
    headers.set("Accept", "application/json");

    if (init?.body) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${RAZORPAY_API}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Razorpay API request failed with HTTP ${response.status}.`
      );
    }

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new Error("Razorpay returned an invalid response.");
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Razorpay request timed out.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createRazorpayOrder(input: {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<RazorpayOrder> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("Order amount must be a positive integer in paise.");
  }

  if (
    typeof input.receipt !== "string" ||
    input.receipt.trim().length === 0 ||
    input.receipt.length > 40
  ) {
    throw new Error("Invalid Razorpay order receipt.");
  }

  if (
    input.notes &&
    (
      !isRecord(input.notes) ||
      Object.keys(input.notes).length > 15 ||
      Object.entries(input.notes).some(
        ([key, value]) =>
          !key ||
          key.length > 256 ||
          typeof value !== "string" ||
          value.length > 256
      )
    )
  ) {
    throw new Error("Invalid Razorpay order notes.");
  }

  const result = await razorpayRequest<unknown>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
    }),
  });

  return validateOrder(result, input.amount);
}

export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  if (
    !isSafeIdentifier(orderId, "order_") ||
    !isSafeIdentifier(paymentId, "pay_") ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const { keySecret } = getCredentials();
  const expected = signatureFor(
    keySecret,
    `${orderId}|${paymentId}`
  );

  return safeEqualHex(expected, signature);
}

export async function fetchRazorpayOrder(
  orderId: string
): Promise<RazorpayOrder> {
  if (!isSafeIdentifier(orderId, "order_")) {
    throw new Error("Invalid Razorpay order ID.");
  }

  const result = await razorpayRequest<unknown>(
    `/orders/${encodeURIComponent(orderId)}`
  );

  return validateOrder(result);
}

export async function fetchRazorpayPayment(
  paymentId: string
): Promise<RazorpayPayment> {
  if (!isSafeIdentifier(paymentId, "pay_")) {
    throw new Error("Invalid Razorpay payment ID.");
  }

  const result = await razorpayRequest<unknown>(
    `/payments/${encodeURIComponent(paymentId)}`
  );

  return validatePayment(result);
}

export function verifyRazorpayWebhook(
  rawBody: string,
  signature: string
): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (
    typeof rawBody !== "string" ||
    !webhookSecret?.trim() ||
    typeof signature !== "string" ||
    !/^[a-f0-9]{64}$/i.test(signature)
  ) {
    return false;
  }

  const expected = signatureFor(webhookSecret, rawBody);

  return safeEqualHex(expected, signature);
}
