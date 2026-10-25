import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function sign(secret, message) {
  return crypto
    .createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('hex');
}

test('payment signature matches Razorpay HMAC construction', () => {
  const secret = 'test-secret';
  const order = 'order_123';
  const payment = 'pay_123';
  const signature = sign(secret, `${order}|${payment}`);

  assert.match(signature, /^[a-f0-9]{64}$/);
  assert.equal(
    signature,
    crypto.createHmac('sha256', secret)
      .update(`${order}|${payment}`, 'utf8')
      .digest('hex')
  );
});

test('changing the payment ID changes the signature', () => {
  const signature = sign('test-secret', 'order_123|pay_123');
  const tampered = sign('test-secret', 'order_123|pay_456');

  assert.notEqual(signature, tampered);
});

test('changing the secret changes the signature', () => {
  const message = 'order_123|pay_123';

  assert.notEqual(
    sign('secret-one', message),
    sign('secret-two', message)
  );
});

test('webhook signature is tied to the exact raw body', () => {
  const secret = 'webhook-test-secret';
  const body = '{"event":"payment.captured"}';
  const signature = sign(secret, body);

  assert.equal(signature.length, 64);
  assert.notEqual(signature, sign(secret, `${body} `));
});

test('malformed signature formats fail the format check', () => {
  assert.equal(/^[a-f0-9]{64}$/i.test('invalid'), false);
  assert.equal(/^[a-f0-9]{64}$/i.test('g'.repeat(64)), false);
  assert.equal(/^[a-f0-9]{64}$/i.test('a'.repeat(63)), false);
});
