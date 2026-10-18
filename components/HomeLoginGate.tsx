
"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const FIRST_LOGIN_KEY = "turfzy-first-login-celebrated";
const PENDING_LOGIN_KEY = "turfzy-login-pending";

export default function HomeLoginGate() {
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [celebrate, setCelebrate] = useState(false);

  const celebrateFirstLogin = useCallback(() => {
    try {
      const alreadyCelebrated =
        localStorage.getItem(FIRST_LOGIN_KEY) === "yes";
      const pendingLogin =
        localStorage.getItem(PENDING_LOGIN_KEY) === "yes";

      if (alreadyCelebrated || !pendingLogin) return;

      localStorage.setItem(FIRST_LOGIN_KEY, "yes");
      localStorage.removeItem(PENDING_LOGIN_KEY);
      setCelebrate(true);
      window.setTimeout(() => setCelebrate(false), 4500);
    } catch {
      // Login still works if browser storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );

    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;

      if (error) {
        setError("We couldn't check your session. Please refresh and try again.");
        setChecking(false);
        return;
      }

      const hasSession = Boolean(data.session);
      setSignedIn(hasSession);
      setChecking(false);

      if (hasSession) celebrateFirstLogin();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        setSignedIn(true);
        setChecking(false);
        celebrateFirstLogin();
      } else if (event === "SIGNED_OUT") {
        setSignedIn(false);
        setCelebrate(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [celebrateFirstLogin]);

  async function signInWithGoogle() {
    setLoading(true);
    setError("");

    try {
      localStorage.setItem(PENDING_LOGIN_KEY, "yes");
    } catch {
      // OAuth can continue if local storage is unavailable.
    }

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    });

    if (error) {
      try {
        localStorage.removeItem(PENDING_LOGIN_KEY);
      } catch {
        // Ignore unavailable browser storage.
      }

      setError(error.message);
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="tz-gate tz-loading">
        <div className="tz-orbit">
          <span />
          <span />
          <span />
          <div className="tz-orbit-core">T</div>
        </div>
        <p className="tz-loading-label">PREPARING YOUR PITCH</p>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (signedIn) {
    return (
      <>
        {celebrate && (
          <div className="tz-confetti" aria-hidden="true">
            {Array.from({ length: 65 }, (_, i) => (
              <span
                key={i}
                style={{
                  left: `${(i * 37) % 100}%`,
                  animationDelay: `${(i % 18) * 0.07}s`,
                  background:
                    i % 3 === 0
                      ? "#75ffa8"
                      : i % 3 === 1
                        ? "#e7d29a"
                        : "#ffffff",
                }}
              />
            ))}
            <div className="tz-welcome">
              <span>WELCOME TO THE SQUAD</span>
              <strong>YOU'RE IN.</strong>
            </div>
          </div>
        )}

        <style jsx>{styles}</style>
      </>
    );
  }

  return (
    <div className="tz-gate">
      <div className="tz-grid" aria-hidden="true" />
      <div className="tz-light tz-light-one" aria-hidden="true" />
      <div className="tz-light tz-light-two" aria-hidden="true" />

      <section className="tz-card">
        <div className="tz-topline">
          <span className="tz-status-dot" />
          TURFZY ACCESS PORTAL
          <span className="tz-version">01 / PLAYER</span>
        </div>

        <div className="tz-logo-frame">
          <div className="tz-logo-halo" />
          <Image
            src="/brand/bootroom-logo.png"
            alt="BOOTROOM football community"
            width={150}
            height={129}
            priority
            className="tz-logo"
          />
        </div>

        <p className="tz-eyebrow">KOLKATA · FOOTBALL COMMUNITY</p>

        <h1>
          YOUR CITY.
          <br />
          YOUR SQUAD.
          <br />
          <span>YOUR GAME.</span>
        </h1>

        <p className="tz-description">
          Every great match starts somewhere.
          <br />
          Find your people. Get on the pitch.
        </p>

        <div className="tz-divider">
          <span />
          <i>PLAYER ENTRY</i>
          <span />
        </div>

        <button
          className="tz-google"
          type="button"
          onClick={signInWithGoogle}
          disabled={loading}
        >
          <span className="tz-google-mark" aria-hidden="true">
            G
          </span>
          <span>{loading ? "CONNECTING..." : "CONTINUE WITH GOOGLE"}</span>
          <span className="tz-arrow">↗</span>
        </button>

        <a className="tz-email" href="/login">
          Prefer email? <span>Sign in with a verification code</span>
        </a>

        {error && (
          <p className="tz-error" role="alert">
            {error}
          </p>
        )}

        <div className="tz-trust">
          <span>SECURE SIGN-IN</span>
          <span className="tz-trust-dot">◆</span>
          <span>BUILT FOR THE GAME</span>
        </div>
      </section>

      <p className="tz-bottom-note">
        THE PITCH IS WAITING <span>—</span> ARE YOU IN?
      </p>

      <style jsx>{styles}</style>
    </div>
  );
}

const styles = `
  .tz-gate {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow-x: hidden;
    overflow-y: auto;
    padding: max(24px, env(safe-area-inset-top)) 18px
      max(28px, env(safe-area-inset-bottom));
    color: #f1f7f1;
    background:
      radial-gradient(ellipse at 50% 0%, rgba(24, 111, 61, .23), transparent 45%),
      linear-gradient(145deg, #030705, #09150e 52%, #030705);
    isolation: isolate;
  }

  .tz-grid {
    position: absolute;
    inset: 0;
    z-index: -2;
    opacity: .16;
    pointer-events: none;
    background-image:
      linear-gradient(rgba(117,255,168,.12) 1px, transparent 1px),
      linear-gradient(90deg, rgba(117,255,168,.12) 1px, transparent 1px);
    background-size: 42px 42px;
    mask-image: linear-gradient(to bottom, black, transparent 80%);
  }

  .tz-light {
    position: absolute;
    z-index: -1;
    width: 280px;
    height: 280px;
    border-radius: 50%;
    filter: blur(90px);
    opacity: .18;
    pointer-events: none;
  }

  .tz-light-one {
    top: 8%;
    left: -180px;
    background: #24e879;
  }

  .tz-light-two {
    right: -190px;
    bottom: 8%;
    background: #b3a06b;
    opacity: .11;
  }

  .tz-card {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    max-width: 440px;
    padding: 24px clamp(20px, 6vw, 32px) 25px;
    border: 1px solid rgba(142, 199, 151, .27);
    border-radius: 25px;
    background:
      linear-gradient(145deg, rgba(20, 34, 25, .96), rgba(5, 12, 8, .98));
    box-shadow:
      0 30px 100px rgba(0,0,0,.48),
      inset 0 1px rgba(255,255,255,.07),
      0 0 45px rgba(42, 220, 105, .045);
    animation: tz-arrive .65s cubic-bezier(.2,.75,.25,1) both;
  }

  .tz-topline {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 15px;
    border-bottom: 1px solid rgba(255,255,255,.09);
    color: #9bb3a1;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 1.3px;
  }

  .tz-status-dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: #75ffa8;
    box-shadow: 0 0 10px rgba(117,255,168,.75);
  }

  .tz-version {
    margin-left: auto;
    color: #718878;
    font-size: 8px;
    letter-spacing: .8px;
  }

  .tz-logo-frame {
    position: relative;
    display: grid;
    place-items: center;
    height: 125px;
    margin-top: 12px;
  }

  .tz-logo-halo {
    position: absolute;
    width: 130px;
    height: 90px;
    border-radius: 50%;
    background: rgba(43, 200, 105, .16);
    filter: blur(35px);
  }

  .tz-logo {
    position: relative;
    width: 115px;
    height: auto;
    object-fit: contain;
    filter: drop-shadow(0 8px 20px rgba(0,0,0,.4));
  }

  .tz-eyebrow {
    margin: 12px 0 15px;
    text-align: center;
    color: #8cf5aa;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 2.2px;
  }

  h1 {
    margin: 0;
    text-align: center;
    font-size: clamp(34px, 9vw, 49px);
    font-weight: 900;
    line-height: .99;
    letter-spacing: -1.9px;
  }

  h1 span {
    color: #8cf5aa;
    text-shadow: 0 0 28px rgba(72, 255, 136, .15);
  }

  .tz-description {
    margin: 18px 0 23px;
    text-align: center;
    color: #a8bcae;
    font-size: 13px;
    line-height: 1.8;
  }

  .tz-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 14px;
  }

  .tz-divider span {
    height: 1px;
    flex: 1;
    background: rgba(180, 218, 185, .16);
  }

  .tz-divider i {
    color: #829a89;
    font-size: 8px;
    font-style: normal;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .tz-google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 11px;
    width: 100%;
    min-height: 57px;
    padding: 12px 14px;
    border: 1px solid rgba(190, 255, 207, .85);
    border-radius: 13px;
    color: #041009;
    background: linear-gradient(115deg, #b4ffca, #72f29a 55%, #a5ffc0);
    box-shadow:
      0 7px 24px rgba(43, 224, 105, .13),
      inset 0 1px rgba(255,255,255,.8);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .45px;
    cursor: pointer;
    transition: transform .18s ease, filter .18s ease;
  }

  .tz-google:hover {
    filter: brightness(1.06);
    transform: translateY(-1px);
  }

  .tz-google:focus-visible,
  .tz-email:focus-visible {
    outline: 2px solid #e7d29a;
    outline-offset: 4px;
  }

  .tz-google:disabled {
    cursor: wait;
    opacity: .7;
  }

  .tz-google-mark {
    display: grid;
    place-items: center;
    width: 23px;
    height: 23px;
    flex: 0 0 auto;
    border-radius: 50%;
    color: #176b3b;
    background: rgba(255,255,255,.62);
    font-size: 14px;
    font-weight: 900;
  }

  .tz-arrow {
    margin-left: auto;
    font-size: 17px;
  }

  .tz-email {
    display: block;
    margin-top: 19px;
    text-align: center;
    color: #8ea394;
    font-size: 11px;
    text-decoration: none;
  }

  .tz-email span {
    color: #d5e4d9;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .tz-error {
    margin: 15px 0 0;
    color: #ffb5aa;
    text-align: center;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  .tz-trust {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 9px;
    margin-top: 25px;
    padding-top: 17px;
    border-top: 1px solid rgba(255,255,255,.08);
    color: #6f8977;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 1px;
  }

  .tz-trust-dot {
    color: #b5a06a;
    font-size: 6px;
  }

  .tz-bottom-note {
    margin: 18px 0 0;
    color: #688271;
    text-align: center;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .tz-bottom-note span {
    color: #b6a16d;
  }

  .tz-loading {
    gap: 22px;
  }

  .tz-loading-label {
    color: #90c6a0;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 3px;
  }

  .tz-orbit {
    position: relative;
    display: grid;
    place-items: center;
    width: 90px;
    height: 90px;
  }

  .tz-orbit span {
    position: absolute;
    inset: 0;
    border: 1px solid rgba(117,255,168,.45);
    border-radius: 50%;
    animation: tz-spin 3s linear infinite;
  }

  .tz-orbit span:nth-child(2) {
    inset: 10px -5px;
    border-color: rgba(231,210,154,.35);
    transform: rotate(60deg);
    animation-direction: reverse;
  }

  .tz-orbit span:nth-child(3) {
    inset: -5px 10px;
    border-color: rgba(117,255,168,.2);
    transform: rotate(-45deg);
  }

  .tz-orbit-core {
    display: grid;
    place-items: center;
    width: 45px;
    height: 45px;
    border: 1px solid #75ffa8;
    border-radius: 14px;
    color: #75ffa8;
    font-size: 23px;
    font-weight: 900;
    box-shadow: 0 0 28px rgba(117,255,168,.14);
  }

  .tz-confetti {
    position: fixed;
    inset: 0;
    z-index: 10000;
    overflow: hidden;
    pointer-events: none;
  }

  .tz-confetti > span {
    position: absolute;
    top: -20px;
    width: 7px;
    height: 12px;
    border-radius: 2px;
    animation: tz-fall 3.2s ease-in forwards;
  }

  .tz-welcome {
    position: absolute;
    top: 38%;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: 90vw;
    padding: 24px 28px;
    border: 1px solid rgba(117,255,168,.3);
    border-radius: 18px;
    background: rgba(4,13,8,.9);
    box-shadow: 0 20px 70px rgba(0,0,0,.35);
    text-align: center;
    transform: translate(-50%, -50%);
    animation: tz-welcome-in .45s ease-out both;
  }

  .tz-welcome span {
    color: #9acba7;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 2px;
  }

  .tz-welcome strong {
    color: #a2ffbb;
    font-size: clamp(30px, 8vw, 44px);
    font-weight: 900;
    letter-spacing: -1px;
  }

  @keyframes tz-fall {
    to {
      transform: translate3d(25px, 110vh, 0) rotate(760deg);
      opacity: 0;
    }
  }

  @keyframes tz-spin {
    to { transform: rotate(360deg); }
  }

  @keyframes tz-arrive {
    from { opacity: 0; transform: translateY(12px) scale(.985); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes tz-welcome-in {
    from { opacity: 0; transform: translate(-50%, -44%) scale(.96); }
    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  }

  @media (max-height: 760px) {
    .tz-card { padding-top: 17px; padding-bottom: 18px; }
    .tz-logo-frame { height: 90px; }
    .tz-logo { width: 90px; }
    .tz-eyebrow { margin-top: 5px; }
    h1 { font-size: clamp(31px, 7vw, 40px); }
    .tz-description { margin: 12px 0 16px; }
    .tz-trust { margin-top: 18px; padding-top: 12px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .tz-card, .tz-orbit span, .tz-confetti > span, .tz-welcome {
      animation: none !important;
    }
    .tz-google { transition: none; }
  }
`;
