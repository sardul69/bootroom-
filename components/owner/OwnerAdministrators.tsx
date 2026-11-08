
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Account = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  is_admin: boolean;
  is_owner: boolean;
};

type AccountResponse = {
  accounts?: Account[];
  error?: string;
};

type ActionResponse = {
  ok?: boolean;
  error?: string;
};

type Filter = "ALL" | "ADMINS" | "PLAYERS";

export default function OwnerAdministrators() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedAccount = accounts.find(
    (account) => account.id === selectedId
  );

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/owner/administrators", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      const result: AccountResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to load registered accounts."
        );
      }

      if (!Array.isArray(result.accounts)) {
        throw new Error("Invalid account list received from server.");
      }

      setAccounts(result.accounts);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load registered accounts."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const filteredAccounts = useMemo(() => {
    const term = search.trim().toLowerCase();

    return [...accounts]
      .filter((account) => {
        if (filter === "ADMINS" && !account.is_admin) return false;
        if (filter === "PLAYERS" && (account.is_admin || account.is_owner)) {
          return false;
        }

        if (!term) return true;

        return (
          (account.email ?? "").toLowerCase().includes(term) ||
          (account.full_name ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        if (a.is_owner !== b.is_owner) return a.is_owner ? -1 : 1;
        if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;

        return (
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
        );
      });
  }, [accounts, search, filter]);

  const administratorCount = accounts.filter(
    (account) => account.is_admin
  ).length;

  const resetPromotion = () => {
    setSelectedId("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
  };

  async function promoteAccount() {
    if (!selectedAccount) return;

    setError("");
    setSuccess("");

    if (selectedAccount.is_owner || selectedAccount.is_admin) {
      setError("This account cannot be promoted.");
      return;
    }

    if (!selectedAccount.email) {
      setError(
        "This account has no registered email address and cannot use admin email login."
      );
      return;
    }

    if (password.length < 12 || password.length > 128) {
      setError("Administrator passwords must contain 12–128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setBusyId(selectedAccount.id);

    try {
      const response = await fetch("/api/owner/administrators", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          profileId: selectedAccount.id,
          password,
          confirmPassword,
        }),
      });

      const result: ActionResponse = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || "Unable to promote this account."
        );
      }

      resetPromotion();
      setSuccess(
        `${selectedAccount.email} has been promoted to administrator.`
      );

      await loadAccounts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to promote this account."
      );
    } finally {
      setBusyId("");
    }
  }

  async function revokeAccount(account: Account) {
    if (!account.is_admin || account.is_owner) return;

    const approved = window.confirm(
      `Revoke administrator access for ${
        account.email ?? "this account"
      }?\n\nTheir administrator session will stop working immediately.`
    );

    if (!approved) return;

    setError("");
    setSuccess("");
    setBusyId(account.id);

    try {
      const response = await fetch("/api/owner/administrators", {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          profileId: account.id,
        }),
      });

      const result: ActionResponse = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.error || "Unable to revoke administrator access."
        );
      }

      if (selectedId === account.id) {
        resetPromotion();
      }

      setSuccess(
        `Administrator access revoked for ${
          account.email ?? "the selected account"
        }.`
      );

      await loadAccounts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to revoke administrator access."
      );
    } finally {
      setBusyId("");
    }
  }

  function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "Unknown date";

    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <section className="oa-root">
      <div className="oa-heading">
        <div>
          <div className="oa-eyebrow">OWNER CONTROL · ACCESS MANAGEMENT</div>
          <h2>Administrators</h2>
          <p>
            Manage registered Turfzy accounts and grant or revoke
            administrator access.
          </p>
        </div>

        <button
          type="button"
          className="oa-refresh"
          onClick={() => void loadAccounts()}
          disabled={loading || Boolean(busyId)}
        >
          {loading ? "LOADING…" : "↻ REFRESH"}
        </button>
      </div>

      <div className="oa-stats">
        <div className="oa-stat">
          <span>REGISTERED ACCOUNTS</span>
          <strong>{accounts.length}</strong>
        </div>

        <div className="oa-stat">
          <span>ADMINISTRATORS</span>
          <strong>{administratorCount}</strong>
        </div>

        <div className="oa-stat">
          <span>OTHER ACCOUNTS</span>
          <strong>
            {accounts.filter((account) => !account.is_admin && !account.is_owner).length}
          </strong>
        </div>
      </div>

      <div className="oa-notice">
        <span className="oa-notice-mark">✦</span>
        <div>
          <strong>Administrator permissions</strong>
          <p>
            Administrators currently receive permission to create games only.
            They cannot appoint administrators, revoke access, or access
            another administrator&apos;s dashboard.
          </p>
        </div>
      </div>

      {error && (
        <div className="oa-message oa-error" role="alert">
          {error}
        </div>
      )}

      {success && (
        <div className="oa-message oa-success" role="status">
          {success}
        </div>
      )}

      <div className="oa-toolbar">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name or email..."
          aria-label="Search registered accounts"
        />

        <div className="oa-filters" aria-label="Account filter">
          {(["ALL", "ADMINS", "PLAYERS"] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="oa-list-heading">
        <span>REGISTERED ACCOUNTS</span>
        <span>{filteredAccounts.length} SHOWN</span>
      </div>

      {loading && accounts.length === 0 ? (
        <div className="oa-empty">Loading registered accounts…</div>
      ) : filteredAccounts.length === 0 ? (
        <div className="oa-empty">
          {error
            ? "Account information could not be loaded."
            : "No matching accounts found."}
        </div>
      ) : (
        <div className="oa-account-list">
          {filteredAccounts.map((account) => {
            const isBusy = busyId === account.id;

            return (
              <article className="oa-account" key={account.id}>
                <div className="oa-account-main">
                  <div className="oa-avatar" aria-hidden="true">
                    {(account.full_name || account.email || "?")
                      .trim()
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="oa-identity">
                    <strong>
                      {account.full_name || "Unnamed account"}
                    </strong>
                    <span>{account.email || "No email registered"}</span>
                    <small>
                      Registered {formatDate(account.created_at)}
                    </small>
                  </div>
                </div>

                <div className="oa-account-actions">
                  {account.is_owner ? (
                    <span className="oa-role oa-owner">OWNER</span>
                  ) : account.is_admin ? (
                    <>
                      <span className="oa-role oa-admin">ADMIN</span>
                      <button
                        type="button"
                        className="oa-revoke"
                        onClick={() => void revokeAccount(account)}
                        disabled={Boolean(busyId)}
                      >
                        {isBusy ? "WAIT…" : "REVOKE"}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="oa-role oa-player">PLAYER</span>
                      <button
                        type="button"
                        className="oa-promote"
                        onClick={() => {
                          setError("");
                          setSuccess("");
                          setSelectedId(account.id);
                          setPassword("");
                          setConfirmPassword("");
                        }}
                        disabled={
                          Boolean(busyId) ||
                          !account.email
                        }
                        title={
                          !account.email
                            ? "An email address is required for admin login."
                            : "Promote this account"
                        }
                      >
                        PROMOTE
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedAccount && !selectedAccount.is_admin && !selectedAccount.is_owner && (
        <div className="oa-promotion">
          <div className="oa-eyebrow">NEW ADMINISTRATOR</div>
          <h3>Grant administrator access</h3>

          <p>
            Selected account:
            <strong> {selectedAccount.email}</strong>
          </p>

          <label htmlFor="oa-password">ADMIN PASSWORD</label>
          <input
            id="oa-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Minimum 12 characters"
            disabled={Boolean(busyId)}
          />

          <label htmlFor="oa-confirm-password">
            CONFIRM ADMIN PASSWORD
          </label>
          <input
            id="oa-confirm-password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Enter the same password again"
            disabled={Boolean(busyId)}
          />

          <label className="oa-show-password">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
              disabled={Boolean(busyId)}
            />
            Show password while entering
          </label>

          <div className="oa-password-note">
            Passwords are hashed on the server. The administrator will use
            their registered email address and this password at
            /admin/login.
          </div>

          <div className="oa-promotion-actions">
            <button
              type="button"
              className="oa-cancel"
              onClick={resetPromotion}
              disabled={Boolean(busyId)}
            >
              CANCEL
            </button>

            <button
              type="button"
              className="oa-confirm"
              onClick={() => void promoteAccount()}
              disabled={
                Boolean(busyId) ||
                password.length < 12 ||
                password.length > 128 ||
                password !== confirmPassword
              }
            >
              {busyId === selectedAccount.id
                ? "PROMOTING…"
                : "CONFIRM PROMOTION"}
            </button>
          </div>
        </div>
      )}

      <div className="oa-footer">
        ACCESS CONTROL IS ENFORCED SERVER-SIDE · OWNER AUTHORIZATION REQUIRED
      </div>

      <style jsx>{`
        .oa-root {
          margin-top: 34px;
          padding: 24px;
          border: 1px solid rgba(231, 200, 121, 0.2);
          border-radius: 22px;
          background: linear-gradient(
            145deg,
            rgba(17, 24, 21, 0.98),
            rgba(7, 12, 10, 0.98)
          );
          color: #f5f1e5;
        }

        .oa-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }

        .oa-eyebrow {
          color: #d6b86f;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.18em;
        }

        .oa-heading h2 {
          margin: 8px 0;
          font-size: clamp(25px, 4vw, 34px);
          letter-spacing: -0.04em;
        }

        .oa-heading p,
        .oa-notice p {
          margin: 0;
          color: #a9b1a9;
          font-size: 13px;
          line-height: 1.65;
        }

        button,
        input {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .oa-refresh {
          flex-shrink: 0;
          padding: 11px 13px;
          border: 1px solid rgba(231, 200, 121, 0.35);
          border-radius: 10px;
          background: transparent;
          color: #e7c879;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
        }

        .oa-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin: 24px 0;
        }

        .oa-stat {
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.025);
        }

        .oa-stat span {
          display: block;
          color: #8f9b90;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.1em;
          line-height: 1.5;
        }

        .oa-stat strong {
          display: block;
          margin-top: 7px;
          color: #f1d58e;
          font-size: 27px;
        }

        .oa-notice {
          display: flex;
          gap: 12px;
          padding: 15px;
          border: 1px solid rgba(92, 245, 142, 0.15);
          border-radius: 13px;
          background: rgba(92, 245, 142, 0.035);
        }

        .oa-notice-mark {
          color: #76e9a0;
          font-size: 20px;
        }

        .oa-notice strong {
          display: block;
          margin-bottom: 5px;
          font-size: 13px;
        }

        .oa-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin: 23px 0 18px;
        }

        .oa-toolbar > input {
          flex: 1 1 220px;
          min-width: 0;
        }

        .oa-root input:not([type="checkbox"]) {
          box-sizing: border-box;
          width: 100%;
          padding: 13px 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          outline: none;
          background: #0a100d;
          color: #f5f1e5;
          font-size: 13px;
        }

        .oa-root input:focus {
          border-color: rgba(231, 200, 121, 0.7);
        }

        .oa-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }

        .oa-filters button {
          padding: 10px 12px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 9px;
          background: transparent;
          color: #a9b1a9;
          font-size: 9px;
          font-weight: 800;
        }

        .oa-filters button.active {
          border-color: rgba(231, 200, 121, 0.5);
          background: rgba(231, 200, 121, 0.09);
          color: #f1d58e;
        }

        .oa-list-heading {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          margin: 20px 0 10px;
          color: #8f9b90;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.12em;
        }

        .oa-account-list {
          display: grid;
          gap: 8px;
        }

        .oa-account {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 13px;
          border: 1px solid rgba(255, 255, 255, 0.075);
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.022);
        }

        .oa-account-main {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }

        .oa-avatar {
          display: grid;
          flex-shrink: 0;
          width: 38px;
          height: 38px;
          place-items: center;
          border: 1px solid rgba(231, 200, 121, 0.3);
          border-radius: 50%;
          background: rgba(231, 200, 121, 0.08);
          color: #e7c879;
          font-weight: 800;
        }

        .oa-identity {
          display: grid;
          gap: 3px;
          min-width: 0;
        }

        .oa-identity strong,
        .oa-identity span,
        .oa-identity small {
          overflow-wrap: anywhere;
        }

        .oa-identity strong {
          font-size: 12px;
        }

        .oa-identity span {
          color: #c0c8c0;
          font-size: 11px;
        }

        .oa-identity small {
          color: #78867b;
          font-size: 10px;
        }

        .oa-account-actions {
          display: flex;
          flex-shrink: 0;
          align-items: center;
          gap: 7px;
        }

        .oa-role {
          padding: 6px 8px;
          border-radius: 7px;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .oa-owner {
          background: rgba(231, 200, 121, 0.12);
          color: #e7c879;
        }

        .oa-admin {
          background: rgba(92, 245, 142, 0.1);
          color: #76e9a0;
        }

        .oa-player {
          background: rgba(255, 255, 255, 0.06);
          color: #aeb9b0;
        }

        .oa-promote,
        .oa-revoke {
          padding: 8px 9px;
          border-radius: 8px;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .oa-promote {
          border: 1px solid rgba(92, 245, 142, 0.35);
          background: rgba(92, 245, 142, 0.08);
          color: #76e9a0;
        }

        .oa-revoke {
          border: 1px solid rgba(255, 130, 130, 0.3);
          background: rgba(255, 100, 100, 0.07);
          color: #ff9999;
        }

        .oa-promotion {
          margin-top: 22px;
          padding: 20px;
          border: 1px solid rgba(231, 200, 121, 0.3);
          border-radius: 15px;
          background: rgba(231, 200, 121, 0.035);
        }

        .oa-promotion h3 {
          margin: 8px 0;
          font-size: 21px;
        }

        .oa-promotion > p {
          margin: 0 0 19px;
          color: #a9b1a9;
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .oa-promotion > p strong {
          color: #f1d58e;
        }

        .oa-promotion > label:not(.oa-show-password) {
          display: block;
          margin: 15px 0 7px;
          color: #c5cdbf;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.1em;
        }

        .oa-show-password {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          color: #a9b1a9;
          font-size: 11px;
        }

        .oa-show-password input {
          accent-color: #76e9a0;
        }

        .oa-password-note {
          margin-top: 13px;
          color: #89968b;
          font-size: 11px;
          line-height: 1.65;
        }

        .oa-promotion-actions {
          display: flex;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 19px;
        }

        .oa-cancel,
        .oa-confirm {
          padding: 12px 15px;
          border-radius: 9px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.06em;
        }

        .oa-cancel {
          border: 1px solid rgba(255, 255, 255, 0.13);
          background: transparent;
          color: #c1c9c1;
        }

        .oa-confirm {
          border: 1px solid #d6b86f;
          background: linear-gradient(120deg, #d6b86f, #f1d58e);
          color: #17150e;
        }

        .oa-message {
          margin-top: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .oa-error {
          border: 1px solid rgba(255, 130, 130, 0.25);
          background: rgba(255, 100, 100, 0.07);
          color: #ffaaaa;
        }

        .oa-success {
          border: 1px solid rgba(92, 245, 142, 0.2);
          background: rgba(92, 245, 142, 0.06);
          color: #8af0ac;
        }

        .oa-empty {
          padding: 30px 15px;
          border: 1px dashed rgba(255, 255, 255, 0.13);
          border-radius: 12px;
          color: #929e94;
          text-align: center;
          font-size: 12px;
        }

        .oa-footer {
          margin-top: 22px;
          color: #748078;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          line-height: 1.6;
          text-align: center;
        }

        @media (max-width: 520px) {
          .oa-root {
            padding: 16px;
          }

          .oa-heading {
            flex-direction: column;
          }

          .oa-stats {
            gap: 6px;
          }

          .oa-stat {
            padding: 11px 8px;
          }

          .oa-stat span {
            font-size: 8px;
          }

          .oa-stat strong {
            font-size: 22px;
          }

          .oa-account {
            align-items: flex-start;
            flex-direction: column;
          }

          .oa-account-actions {
            align-self: flex-end;
          }

          .oa-toolbar {
            flex-direction: column;
          }

          .oa-filters button {
            flex: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .oa-root * {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </section>
  );
}
