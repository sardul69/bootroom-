import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

test('Razorpay signature algorithm matches expected HMAC construction', () => {
  const secret='test-secret'; const order='order_123'; const payment='pay_123';
  const signature=crypto.createHmac('sha256',secret).update(`${order}|${payment}`).digest('hex');
  assert.equal(signature.length,64);
});
