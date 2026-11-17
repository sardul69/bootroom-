
"use client";

import { useEffect, useState } from "react";

export type OwnerSection =
  | "overview"
  | "games"
  | "players"
  | "finance"
  | "turf-inbox"
  | "turfs"
  | "marketplace"
  | "administrators"
  | "tournaments"
  | "reports"
  | "settings";

type Props = {
  activeSection: OwnerSection;
  onNavigate: (section: OwnerSection) => void;
};

const groups: {
  title: string;
  items: { id: OwnerSection; label: string; icon: string }[];
}[] = [
  {
    title: "COMMAND",
    items: [
      { id: "overview", label: "Overview", icon: "◈" },
      { id: "games", label: "Games", icon: "⚽" },
      { id: "players", label: "Players", icon: "♟" },
      { id: "finance", label: "Finance", icon: "₹" },
    ],
  },
  {
    title: "VENUE MANAGEMENT",
    items: [
      { id: "turf-inbox", label: "Turf Inbox", icon: "⌑" },
      { id: "turfs", label: "Turf Directory", icon: "▦" },
    ],
  },
  {
    title: "BUSINESS",
    items: [
      { id: "marketplace", label: "Marketplace", icon: "◇" },
      { id: "administrators", label: "Administrators", icon: "♛" },
      { id: "tournaments", label: "Tournaments", icon: "🏆" },
      { id: "reports", label: "Reports", icon: "▤" },
      { id: "settings", label: "Settings", icon: "⚙" },
    ],
  },
];

export default function OwnerCommandSidebar({
  activeSection,
  onNavigate,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeSidebar() {
    setMobileOpen(false);
  }

  function navigate(section: OwnerSection) {
    onNavigate(section);
    closeSidebar();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSidebar();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <>
      {/* MOBILE MENU BUTTON */}
      <button
        type="button"
        className={`owner-mobile-menu ${mobileOpen ? "is-open" : ""}`}
        aria-label={
          mobileOpen ? "Close owner navigation" : "Open owner navigation"
        }
        aria-expanded={mobileOpen}
        aria-controls="owner-command-sidebar"
        onClick={() => setMobileOpen((value) => !value)}
      >
        {mobileOpen ? (
          <span className="owner-menu-close">×</span>
        ) : (
          <>
            <span />
            <span />
            <span />
          </>
        )}
      </button>

      {/* MOBILE BACKDROP */}
      {mobileOpen && (
        <button
          type="button"
          className="owner-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={closeSidebar}
        />
      )}

      {/* SIDEBAR */}
      <aside
        id="owner-command-sidebar"
        className={`owner-command-sidebar ${
          mobileOpen ? "is-open" : ""
        }`}
        aria-label="Owner command navigation"
        aria-hidden={!mobileOpen && undefined}
      >
        {/* BRAND */}
        <div className="owner-sidebar-brand">
          <div className="owner-brand-emblem">♛</div>

          <div>
            <div className="owner-brand-name">BOOTROOM</div>
            <div className="owner-brand-caption">OWNER COMMAND</div>
          </div>

          <button
            type="button"
            className="owner-sidebar-close"
            aria-label="Close navigation"
            onClick={closeSidebar}
          >
            ×
          </button>
        </div>

        {/* ACCESS STATUS */}
        <div className="owner-sidebar-access">
          <span className="owner-access-dot" />
          PRIVILEGED SESSION
        </div>

        {/* NAVIGATION */}
        <nav className="owner-sidebar-nav" aria-label="Owner navigation">
          {groups.map((group) => (
            <div className="owner-nav-group" key={group.title}>
              <div className="owner-nav-heading">{group.title}</div>

              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`owner-nav-item ${
                    activeSection === item.id ? "is-active" : ""
                  }`}
                  aria-current={
                    activeSection === item.id ? "page" : undefined
                  }
                  onClick={() => navigate(item.id)}
                >
                  <span className="owner-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>

                  <span>{item.label}</span>

                  {activeSection === item.id && (
                    <span className="owner-nav-indicator" />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* FOOTER */}
        <div className="owner-sidebar-footer">
          <div className="owner-footer-line" />
          <div className="owner-footer-title">THE FIVE. ONE CREST.</div>
          <div className="owner-footer-subtitle">ONE STANDARD.</div>
          <div className="owner-footer-version">BOOTROOM · KOLKATA</div>
        </div>
      </aside>

      <style jsx global>{`
        .owner-command-sidebar {
          position: fixed;
          z-index: 80;
          inset: 0 auto 0 0;
          display: flex;
          flex-direction: column;
          width: 258px;
          padding: 27px 17px 18px;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          color: #e9eee9;
          background:
            radial-gradient(
              circle at 0% 0%,
              rgba(58, 116, 78, 0.13),
              transparent 35%
            ),
            #080d0b;
          border-right: 1px solid rgba(192, 164, 100, 0.2);
          box-sizing: border-box;
        }

        .owner-sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 0 8px 22px;
        }

        .owner-brand-emblem {
          display: grid;
          place-items: center;
          flex: 0 0 39px;
          width: 39px;
          height: 39px;
          color: #d9bd7b;
          border: 1px solid rgba(217, 189, 123, 0.55);
          border-radius: 11px;
          background: linear-gradient(145deg, #18251d, #0b110e);
          font-size: 23px;
        }

        .owner-brand-name {
          color: #f1eee4;
          font-size: 14px;
          font-weight: 850;
          letter-spacing: 0.2em;
        }

        .owner-brand-caption {
          margin-top: 4px;
          color: #bda66e;
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.19em;
        }

        .owner-sidebar-access {
          display: flex;
          align-items: center;
          gap: 9px;
          margin: 0 3px 27px;
          padding: 10px 11px;
          color: #aab8ad;
          border: 1px solid rgba(125, 160, 133, 0.17);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.025);
          font-size: 9px;
          font-weight: 750;
          letter-spacing: 0.12em;
        }

        .owner-access-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #78e6a0;
          box-shadow: 0 0 10px rgba(120, 230, 160, 0.6);
        }

        .owner-sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }

        .owner-nav-heading {
          padding: 0 11px 9px;
          color: #718078;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.17em;
        }

        .owner-nav-item {
          position: relative;
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          min-height: 42px;
          margin: 2px 0;
          padding: 0 11px;
          color: #aab5ad;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          text-align: left;
          font: inherit;
          font-size: 12px;
          font-weight: 620;
          cursor: pointer;
          transition:
            color 160ms ease,
            background 160ms ease,
            border-color 160ms ease;
        }

        .owner-nav-item:hover {
          color: #f2f2e9;
          background: rgba(255, 255, 255, 0.045);
        }

        .owner-nav-item.is-active {
          color: #e9f6ec;
          border-color: rgba(116, 206, 145, 0.2);
          background: linear-gradient(
            90deg,
            rgba(69, 133, 88, 0.24),
            rgba(69, 133, 88, 0.055)
          );
        }

        .owner-nav-icon {
          display: grid;
          place-items: center;
          width: 19px;
          color: #c4ae77;
          font-size: 15px;
        }

        .owner-nav-item.is-active .owner-nav-icon {
          color: #8beaab;
        }

        .owner-nav-indicator {
          position: absolute;
          top: 9px;
          right: -1px;
          bottom: 9px;
          width: 2px;
          border-radius: 4px;
          background: #8beaab;
          box-shadow: 0 0 9px rgba(139, 234, 171, 0.55);
        }

        .owner-sidebar-footer {
          margin-top: auto;
          padding: 28px 9px 3px;
        }

        .owner-footer-line {
          height: 1px;
          margin-bottom: 17px;
          background: linear-gradient(
            90deg,
            rgba(194, 165, 103, 0.5),
            transparent
          );
        }

        .owner-footer-title {
          color: #d5bd82;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.13em;
        }

        .owner-footer-subtitle {
          margin-top: 4px;
          color: #e7e8df;
          font-size: 9px;
          letter-spacing: 0.16em;
        }

        .owner-footer-version {
          margin-top: 17px;
          color: #68756c;
          font-size: 8px;
          letter-spacing: 0.14em;
        }

        .owner-mobile-menu,
        .owner-sidebar-close,
        .owner-sidebar-backdrop {
          display: none;
        }

        @media (max-width: 900px) {
          .owner-command-sidebar {
            z-index: 100;
            width: min(82vw, 320px);
            max-width: 320px;
            transform: translateX(-105%);
            transition: transform 260ms cubic-bezier(0.2, 0.75, 0.25, 1);
            box-shadow: 18px 0 55px rgba(0, 0, 0, 0.35);
            visibility: hidden;
            pointer-events: none;
          }

          .owner-command-sidebar.is-open {
            transform: translateX(0);
            visibility: visible;
            pointer-events: auto;
          }

          .owner-sidebar-brand {
            position: relative;
            padding-right: 38px;
          }

          .owner-sidebar-close {
            position: absolute;
            top: 0;
            right: 0;
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            color: #e7d5a5;
            border: 1px solid rgba(194, 165, 103, 0.3);
            border-radius: 9px;
            background: rgba(255, 255, 255, 0.035);
            font-size: 25px;
            line-height: 1;
            cursor: pointer;
          }

          .owner-mobile-menu {
            position: fixed;
            z-index: 110;
            top: 13px;
            left: 13px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 5px;
            width: 44px;
            height: 44px;
            padding: 10px;
            color: #e3d3a9;
            border: 1px solid rgba(194, 165, 103, 0.35);
            border-radius: 10px;
            background: #0b120e;
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }

          .owner-mobile-menu span:not(.owner-menu-close) {
            display: block;
            width: 100%;
            height: 2px;
            border-radius: 2px;
            background: #e3d3a9;
          }

          .owner-menu-close {
            font-size: 27px;
            line-height: 20px;
          }

          .owner-sidebar-backdrop {
            position: fixed;
            z-index: 99;
            inset: 0;
            display: block;
            width: 100%;
            height: 100%;
            padding: 0;
            border: 0;
            background: rgba(0, 0, 0, 0.62);
            cursor: pointer;
            -webkit-tap-highlight-color: transparent;
          }
        }
      `}</style>
    </>
  );
}
