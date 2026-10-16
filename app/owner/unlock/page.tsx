"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function OwnerUnlockPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function unlock(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/owner/access",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({ password }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          result.error || "Access denied."
        );
        return;
      }

      setPassword("");
      router.replace("/owner");
      router.refresh();
    } catch {
      setMessage(
        "Connection failed. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="royal-shell">
      <section className="royal-unlock">
        <div
          className="royal-crown"
          aria-hidden="true"
        >
          ♛
        </div>

        <div className="royal-brand">
          BOOTROOM
        </div>

        <div className="royal-kicker">
          THE ROYAL OWNER CONSOLE
        </div>

        <div className="royal-divider" />

        <div className="royal-kicker">
          PRIVATE · OWNER ACCESS ONLY
        </div>

        <h1>Your kingdom awaits.</h1>

        <p className="royal-copy">
          Your BOOTROOM account is verified separately.
          Enter your private Owner password to continue.
        </p>

        <form
          onSubmit={unlock}
          className="royal-form"
        >
          <label htmlFor="owner-password">
            OWNER ACCESS PASSWORD
          </label>

          <input
            id="owner-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            required
            maxLength={512}
            placeholder="Enter your private password"
          />

          {message && (
            <p
              className="royal-error"
              role="alert"
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !password}
          >
            {busy
              ? "VERIFYING ACCESS…"
              : "UNLOCK OWNER CONSOLE →"}
          </button>
        </form>

        <p className="royal-footnote">
          SERVER-VERIFIED ACCESS · HTTP-ONLY SESSION ·
          30-MINUTE EXPIRY
        </p>
      </section>
    </main>
  );
}