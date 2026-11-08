"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setStatus("");

    try {
      const result = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const data = await result.json();

      if (!result.ok || !data.ok) {
        setStatus(data.error || "Unable to sign in.");
        setLoading(false);
        return;
      }

      window.location.assign("/admin/dashboard");
    } catch {
      setStatus("Connection error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main
      className="loginWrap"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        background:
          "radial-gradient(ellipse at 50% 0%, #173d2a 0%, #0b110d 48%, #050706 100%)",
      }}
    >
      <div
        className="loginCard"
        style={{
          width: "100%",
          maxWidth: "440px",
          boxSizing: "border-box",
          padding: "32px 24px",
          borderRadius: "24px",
          border: "1px solid rgba(120, 255, 170, 0.22)",
          background:
            "linear-gradient(145deg, rgba(24, 34, 28, 0.98), rgba(8, 12, 9, 0.98))",
          boxShadow:
            "0 24px 70px rgba(0, 0, 0, 0.45), 0 0 35px rgba(38, 220, 105, 0.07)",
        }}
      >
        <Image
          src="/brand/bootroom-logo.png"
          alt="BOOTROOM"
          width={150}
          height={129}
          priority
        />

        <div className="label">TURFZY ADMINISTRATION</div>
        <h1 className="display">ADMIN SIGN IN.</h1>

        <form onSubmit={handleLogin}>
          <div className="field">
            <label htmlFor="admin-email">Registered email address</label>
            <input
              id="admin-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="admin-password">Admin password</label>
            <input
              id="admin-password"
              type="password"
              placeholder="Enter your admin password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            className="btn green"
            style={{ width: "100%" }}
            disabled={loading}
          >
            {loading ? "AUTHENTICATING..." : "ENTER ADMIN DASHBOARD"}
          </button>
        </form>

        <p className="muted" style={{ fontSize: 12 }}>
          {status}
        </p>

        <div className="notice">
          Restricted access. Only accounts appointed by the Turfzy owner can
          enter this dashboard.
        </div>
      </div>
    </main>
  );
}
