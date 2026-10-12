'use client';
import Image from 'next/image';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
export default function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  async function google() {
    setLoading(true);
    setStatus('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    });
    if (error) {
      setStatus(error.message);
      setLoading(false);
    }
  }
  async function sendEmailOTP() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setStatus('Please enter your email address.');
      return;
    }
    setLoading(true);
    setStatus('');
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: true,
      },
    });
    if (error) {
      setStatus(error.message);
    } else {
      setVerificationSent(true);
      setStatus('Verification code sent. Check your email inbox.');
    }
    setLoading(false);
  }
  async function verifyEmailOTP() {
    const normalizedEmail = email.trim().toLowerCase();
    const token = code.trim();
    if (!token) {
      setStatus('Enter the verification code from your email.');
      return;
    }
    setLoading(true);
    setStatus('');
    const { error } = await supabase.auth.verifyOtp({
      email: normalizedEmail,
      token,
      type: 'email',
    });
    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }
    window.location.assign('/turfs');
  }
  return (
    <main className="loginWrap">
      <div className="loginCard">
        <Image
          src="/brand/bootroom-logo.png"
          alt="BOOTROOM"
          width={150}
          height={129}
        />
        <div className="label">ENTER THE GAME</div>
        <h1 className="display">SIGN IN.</h1>
        <button
          type="button"
          className="btn"
          style={{ width: '100%' }}
          onClick={google}
          disabled={loading}
        >
          CONTINUE WITH GOOGLE
        </button>
        <div
          style={{
            textAlign: 'center',
            padding: '18px 0',
            color: 'var(--mist)',
          }}
        >
          OR
        </div>
        <div className="field">
          <label htmlFor="login-email">Email address</label>
          <input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={verificationSent || loading}
            required
          />
        </div>
        {!verificationSent ? (
          <button
            type="button"
            className="btn green"
            style={{ width: '100%' }}
            onClick={sendEmailOTP}
            disabled={loading}
          >
            {loading ? 'PLEASE WAIT...' : 'SEND EMAIL CODE'}
          </button>
        ) : (
          <>
            <div className="field">
              <label htmlFor="email-code">Email verification code</label>
              <input
                id="email-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter the code from your email"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <button
              type="button"
              className="btn green"
              style={{ width: '100%' }}
              onClick={verifyEmailOTP}
              disabled={loading}
            >
              {loading ? 'VERIFYING...' : 'VERIFY & SIGN IN'}
            </button>
            <button
              type="button"
              className="btn"
              style={{ width: '100%', marginTop: '10px' }}
              onClick={sendEmailOTP}
              disabled={loading}
            >
              RESEND EMAIL CODE
            </button>
          </>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          {status}
        </p>
        <div className="notice">
          Sign in securely using a verification code sent to your email.
        </div>
      </div>
    </main>
  );
}