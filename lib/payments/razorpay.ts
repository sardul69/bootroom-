import crypto from 'node:crypto';

const keyId = process.env.RAZORPAY_KEY_ID!;
const keySecret = process.env.RAZORPAY_KEY_SECRET!;
const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

export async function createRazorpayOrder(input: { amount: number; receipt: string; notes?: Record<string,string> }) {
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: input.amount, currency: 'INR', receipt: input.receipt, notes: input.notes ?? {} }),
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(`Razorpay order creation failed: ${res.status}`);
  return res.json();
}

export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export function verifyRazorpayWebhook(rawBody: string, signature: string) {
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
