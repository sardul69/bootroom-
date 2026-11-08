"use client";

import { useState } from "react";

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

  function navigate(section: OwnerSection) {
    onNavigate(section);
    setMobileOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="owner-mobile-menu"
        aria-label="Open owner navigation"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="owner-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={`owner-command-sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="owner-sidebar-brand">
          <div className="owner-brand-emblem">♛</div>
          <div>
            <div className="owner-brand-name">BOOTROOM</div>
            <div className="owner-brand-caption">OWNER COMMAND</div>
          </div>
        </div>

        <div className="owner-sidebar-access">
          <span className="owner-access-dot" />
          PRIVILEGED SESSION
        </div>

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
          overflow-y: auto;
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
        .owner-sidebar-backdrop {
          display: none;
        }

        @media (max-width: 900px) {
          .owner-command-sidebar {
            width: 275px;
            transform: translateX(-102%);
            transition: transform 220ms ease;
            box-shadow: 18px 0 55px rgba(0, 0, 0, 0.35);
          }

          .owner-command-sidebar.is-open {
            transform: translateX(0);
          }

          .owner-mobile-menu {
            position: fixed;
            z-index: 79;
            top: 13px;
            left: 13px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 5px;
            width: 42px;
            height: 42px;
            padding: 10px;
            border: 1px solid rgba(194, 165, 103, 0.35);
            border-radius: 10px;
            background: #0b120e;
            cursor: pointer;
          }

          .owner-mobile-menu span {
            display: block;
            width: 100%;
            height: 2px;
            border-radius: 2px;
            background: #e3d3a9;
          }

          .owner-sidebar-backdrop {
            position: fixed;
            z-index: 78;
            inset: 0;
            display: block;
            border: 0;
            background: rgba(0, 0, 0, 0.62);
          }
        }
      `}</style>
    </>
  );
}
