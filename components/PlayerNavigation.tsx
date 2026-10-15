
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ============================================================
   TURFZY — THE CRYSTAL PILL
   A layered emerald-glass navigation system.
   ============================================================ */

type IconName = "home" | "games" | "turfs" | "players" | "search" | "profile";

type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  desktopOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: "home" },
  { label: "Games", href: "/matches", icon: "games" },
  { label: "Turfs", href: "/turfs", icon: "turfs" },
  { label: "Players", href: "/player", icon: "players" },
  {
    label: "Squad Finder",
    href: "/squad-finder",
    icon: "search",
    desktopOnly: true,
  },
  { label: "Profile", href: "/profile", icon: "profile" },
];

/* ------------------------ NAV ICONS ------------------------ */

function NavIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 23,
    height: 23,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.65,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.5V21h13V9.5" />
          <path d="M9.5 21v-7h5v7" />
        </svg>
      );

    case "games":
      return (
        <svg {...common}>
          <rect x="3.5" y="5" width="17" height="16" rx="2" />
          <path d="M7.5 3v4M16.5 3v4M3.5 10h17" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01" />
        </svg>
      );

    case "turfs":
      return (
        <svg {...common}>
          <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
      );

    case "players":
      return (
        <svg {...common}>
          <circle cx="9" cy="7.5" r="3" />
          <path d="M2.8 20v-1.3a6.2 6.2 0 0 1 12.4 0V20Z" />
          <path d="M16 4.8a3 3 0 0 1 0 5.8M17 13a5 5 0 0 1 4.2 4.9V20" />
        </svg>
      );

    case "search":
      return (
        <svg {...common}>
          <circle cx="10.5" cy="10.5" r="6.7" />
          <path d="m15.5 15.5 5 5" />
        </svg>
      );

    case "profile":
      return (
        <svg {...common}>
          <circle cx="12" cy="7.5" r="4" />
          <path d="M4 21v-2a8 8 0 0 1 16 0v2Z" />
        </svg>
      );
  }
}

/* -------------------- ACTIVE ROUTE ------------------------- */

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/* ============================================================
   THE GEMSTONE

   SVG planes are independent:
   1. Dark glass body
   2. Crown / upper bevel
   3. Left and right facets
   4. Central pavilion
   5. Lower reflections
   6. Fine internal facet engraving
   7. Metallic perimeter
   ============================================================ */

function CrystalPill() {
  return (
    <svg
      className="tz-crystal-svg"
      viewBox="0 0 320 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="tzc-metal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8b9c78" />
          <stop offset="12%" stopColor="#e8d7a4" />
          <stop offset="24%" stopColor="#78916c" />
          <stop offset="49%" stopColor="#344b35" />
          <stop offset="72%" stopColor="#a6a77c" />
          <stop offset="88%" stopColor="#d4c08d" />
          <stop offset="100%" stopColor="#647957" />
        </linearGradient>

        <linearGradient id="tzc-glass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#17452f" />
          <stop offset="20%" stopColor="#092c1e" />
          <stop offset="48%" stopColor="#03150e" />
          <stop offset="74%" stopColor="#062419" />
          <stop offset="100%" stopColor="#10412a" />
        </linearGradient>

        <linearGradient id="tzc-crown" x1="0%" y1="0%" x2="75%" y2="100%">
          <stop offset="0%" stopColor="#a6e9b8" stopOpacity=".7" />
          <stop offset="20%" stopColor="#3ca96c" stopOpacity=".55" />
          <stop offset="60%" stopColor="#0b5635" stopOpacity=".35" />
          <stop offset="100%" stopColor="#02170e" stopOpacity=".75" />
        </linearGradient>

        <linearGradient id="tzc-left" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#b5f0c3" stopOpacity=".72" />
          <stop offset="28%" stopColor="#248b53" stopOpacity=".7" />
          <stop offset="65%" stopColor="#07502f" stopOpacity=".65" />
          <stop offset="100%" stopColor="#02150d" stopOpacity=".95" />
        </linearGradient>

        <linearGradient id="tzc-right" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8cdda7" stopOpacity=".45" />
          <stop offset="32%" stopColor="#17643c" stopOpacity=".65" />
          <stop offset="70%" stopColor="#052719" stopOpacity=".9" />
          <stop offset="100%" stopColor="#010d08" stopOpacity=".98" />
        </linearGradient>

        <linearGradient id="tzc-bottom" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#167446" stopOpacity=".8" />
          <stop offset="45%" stopColor="#042417" stopOpacity=".95" />
          <stop offset="82%" stopColor="#0b5935" stopOpacity=".9" />
          <stop offset="100%" stopColor="#88c997" stopOpacity=".55" />
        </linearGradient>

        <linearGradient id="tzc-sheen" x1="0%" y1="0%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#f4ffe9" stopOpacity=".3" />
          <stop offset="15%" stopColor="#9df3b5" stopOpacity=".13" />
          <stop offset="38%" stopColor="#fff" stopOpacity="0" />
          <stop offset="72%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#d9ffdf" stopOpacity=".16" />
        </linearGradient>

        <radialGradient id="tzc-depth" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#176d40" stopOpacity=".42" />
          <stop offset="50%" stopColor="#07502d" stopOpacity=".15" />
          <stop offset="100%" stopColor="#001008" stopOpacity=".1" />
        </radialGradient>

        <linearGradient id="tzc-edge" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f1dfb0" stopOpacity=".88" />
          <stop offset="25%" stopColor="#7da47d" stopOpacity=".58" />
          <stop offset="55%" stopColor="#334b34" stopOpacity=".8" />
          <stop offset="100%" stopColor="#c8bd88" stopOpacity=".75" />
        </linearGradient>

        <clipPath id="tzc-clip">
          <path d="M28 7 L49 3 L271 3 L292 7 L316 28 L316 72 L292 93 L271 97 L49 97 L28 93 L4 72 L4 28 Z" />
        </clipPath>
      </defs>

      <g clipPath="url(#tzc-clip)">
        {/* 1 — Main obsidian-green glass */}
        <rect width="320" height="100" fill="url(#tzc-glass)" />

        {/* 2 — Depth beneath the facets */}
        <rect width="320" height="100" fill="url(#tzc-depth)" />

        {/* 3 — Crown planes */}
        <path
          d="M28 7 L49 3 L96 19 L224 19 L271 3 L292 7 L259 29 L61 29 Z"
          fill="url(#tzc-crown)"
        />

        <path
          d="M49 3 L96 19 L61 29 L28 7 Z"
          fill="#b0f0bd"
          opacity=".25"
        />

        <path
          d="M271 3 L224 19 L259 29 L292 7 Z"
          fill="#b7dba6"
          opacity=".15"
        />

        {/* 4 — Outer side facets */}
        <path
          d="M4 28 L28 7 L61 29 L74 50 L61 71 L28 93 L4 72 Z"
          fill="url(#tzc-left)"
        />

        <path
          d="M316 28 L292 7 L259 29 L246 50 L259 71 L292 93 L316 72 Z"
          fill="url(#tzc-right)"
        />

        {/* 5 — Upper central planes */}
        <path
          d="M61 29 L96 19 L126 35 L160 29 L194 35 L224 19 L259 29 L246 50 L259 71 L194 64 L160 75 L126 64 L61 71 L74 50 Z"
          fill="#0a4a2e"
          opacity=".8"
        />

        <path
          d="M61 29 L126 35 L160 29 L160 50 L74 50 Z"
          fill="#5acb83"
          opacity=".17"
        />

        <path
          d="M259 29 L194 35 L160 29 L160 50 L246 50 Z"
          fill="#8ad9a1"
          opacity=".09"
        />

        {/* 6 — Deep center facet */}
        <path
          d="M74 50 L160 50 L246 50 L259 71 L194 64 L160 75 L126 64 L61 71 Z"
          fill="#02150d"
          opacity=".88"
        />

        <path
          d="M126 35 L160 29 L194 35 L160 50 Z"
          fill="#45ad70"
          opacity=".16"
        />

        {/* 7 — Lower pavilion */}
        <path
          d="M28 93 L61 71 L126 64 L160 75 L194 64 L259 71 L292 93 L271 97 L49 97 Z"
          fill="url(#tzc-bottom)"
        />

        <path
          d="M61 71 L126 64 L160 75 L124 91 L49 97 L28 93 Z"
          fill="#0c6840"
          opacity=".35"
        />

        <path
          d="M259 71 L194 64 L160 75 L196 91 L271 97 L292 93 Z"
          fill="#67c789"
          opacity=".15"
        />

        {/* 8 — Internal engraved facet boundaries */}
        <g
          fill="none"
          stroke="#a6e6b3"
          strokeWidth=".65"
          strokeOpacity=".34"
        >
          <path d="M28 7 L61 29 L74 50 L61 71 L28 93" />
          <path d="M49 3 L96 19 L126 35 L160 29 L194 35 L224 19 L271 3" />
          <path d="M61 29 L126 35 L160 50 L194 35 L259 29" />
          <path d="M74 50 L160 50 L246 50" />
          <path d="M61 71 L126 64 L160 75 L194 64 L259 71" />
          <path d="M49 97 L124 91 L160 75 L196 91 L271 97" />
          <path d="M292 7 L259 29 L246 50 L259 71 L292 93" />
        </g>

        {/* 9 — Restrained internal reflections */}
        <path
          d="M28 7 L49 3 L96 19 L224 19 L271 3 L292 7 L316 28 L316 72 L292 93 L271 97 L49 97 L28 93 L4 72 L4 28 Z"
          fill="url(#tzc-sheen)"
        />

        <path
          d="M34 12 L52 8 L91 8"
          fill="none"
          stroke="#e5f6d8"
          strokeWidth=".9"
          strokeOpacity=".42"
        />

        <path
          d="M286 12 L268 8 L229 8"
          fill="none"
          stroke="#e5d7aa"
          strokeWidth=".75"
          strokeOpacity=".32"
        />

        <path
          d="M49 96 L271 96"
          fill="none"
          stroke="#c5e8ae"
          strokeWidth="1"
          strokeOpacity=".25"
        />
      </g>

      {/* 10 — Main metallic bevel */}
      <path
        d="M28 7 L49 3 L271 3 L292 7 L316 28 L316 72 L292 93 L271 97 L49 97 L28 93 L4 72 L4 28 Z"
        fill="none"
        stroke="url(#tzc-edge)"
        strokeWidth="2"
      />

      {/* 11 — Fine inset perimeter */}
      <path
        d="M32 11 L52 7 L268 7 L288 11 L309 30 L309 70 L288 89 L268 93 L52 93 L32 89 L11 70 L11 30 Z"
        fill="none"
        stroke="#c6c59a"
        strokeWidth=".7"
        strokeOpacity=".62"
      />

      {/* 12 — Inner glass boundary */}
      <path
        d="M39 15 L58 12 L262 12 L281 15 L301 33 L301 67 L281 85 L262 88 L58 88 L39 85 L19 67 L19 33 Z"
        fill="none"
        stroke="#bde6c5"
        strokeWidth=".55"
        strokeOpacity=".22"
      />
    </svg>
  );
}

/* ============================================================
   NAVIGATION COMPONENT
   ============================================================ */

export default function PlayerNavigation() {
  const pathname = usePathname();

  return (
    <>
      <nav className="tz-crystal-nav" aria-label="Main navigation">
        <span className="tz-crystal-nav__inner" aria-hidden="true" />
        <span className="tz-crystal-nav__reflection" aria-hidden="true" />

        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              aria-label={item.label}
              className={[
                "tz-crystal-tab",
                active ? "tz-crystal-tab--active" : "",
                item.desktopOnly ? "tz-crystal-tab--desktop-only" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {active && (
                <>
                  <span
                    className="tz-crystal-tab__glow"
                    aria-hidden="true"
                  />
                  <span
                    className="tz-crystal-tab__gem"
                    aria-hidden="true"
                  >
                    <CrystalPill />
                  </span>
                </>
              )}

              <span className="tz-crystal-tab__content">
                <span className="tz-crystal-tab__icon">
                  <NavIcon name={item.icon} />
                </span>
                <span className="tz-crystal-tab__label">
                  {item.label}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <style jsx global>{`
        /* ================== NAVIGATION SHELL ================== */

        .tz-crystal-nav,
        .tz-crystal-nav * {
          box-sizing: border-box;
        }

        .tz-crystal-nav {
          position: fixed;
          z-index: 900;
          left: 50%;
          bottom: max(22px, env(safe-area-inset-bottom));
          transform: translateX(-50%);
          isolation: isolate;

          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0;

          width: min(1280px, calc(100vw - 48px));
          min-height: 88px;
          padding: 7px 9px;

          border: 1px solid rgba(125, 166, 127, 0.62);
          border-radius: 999px;

          background:
            radial-gradient(
              ellipse at 50% -40%,
              rgba(42, 93, 57, 0.18),
              transparent 72%
            ),
            linear-gradient(
              180deg,
              rgba(7, 22, 15, 0.97) 0%,
              rgba(2, 11, 7, 0.98) 55%,
              rgba(5, 18, 11, 0.97) 100%
            );

          -webkit-backdrop-filter: blur(22px) saturate(145%);
          backdrop-filter: blur(22px) saturate(145%);

          box-shadow:
            0 16px 40px rgba(0, 0, 0, 0.4),
            inset 0 1px 1px rgba(235, 247, 223, 0.2),
            inset 0 -2px 6px rgba(0, 0, 0, 0.65);
        }

        .tz-crystal-nav__inner {
          position: absolute;
          inset: 5px;
          z-index: -1;
          border: 1px solid rgba(178, 200, 168, 0.13);
          border-radius: inherit;
          pointer-events: none;
        }

        .tz-crystal-nav__reflection {
          position: absolute;
          top: 2px;
          left: 14%;
          right: 14%;
          height: 1px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(235, 241, 213, 0.26),
            rgba(183, 222, 190, 0.16),
            transparent
          );
          pointer-events: none;
        }

        /* ================== INDIVIDUAL TABS ================== */

        .tz-crystal-tab {
          position: relative;
          isolation: isolate;
          flex: 1 1 0;
          min-width: 0;
          height: 70px;

          display: flex;
          align-items: center;
          justify-content: center;

          color: rgba(191, 204, 197, 0.78);
          text-decoration: none;
          border-radius: 999px;
          outline: none;
          -webkit-tap-highlight-color: transparent;

          transition: color 180ms ease;
        }

        .tz-crystal-tab__content {
          position: relative;
          z-index: 5;

          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 5px;

          width: 100%;
          min-width: 0;
          pointer-events: none;
        }

        .tz-crystal-tab__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 25px;
          color: inherit;

          filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
        }

        .tz-crystal-tab__icon svg {
          display: block;
          width: 23px;
          height: 23px;
        }

        .tz-crystal-tab__label {
          display: block;
          max-width: 100%;
          padding-inline: 2px;

          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;

          font-family: Arial, Helvetica, sans-serif;
          font-size: 10px;
          font-weight: 650;
          line-height: 1.2;
          letter-spacing: 0.105em;
          text-transform: uppercase;
        }

        /* ================== ACTIVE GEMSTONE ================== */

        .tz-crystal-tab--active {
          color: #f0dfb0;
        }

        .tz-crystal-tab--active .tz-crystal-tab__content {
          z-index: 5;
        }

        .tz-crystal-tab--active .tz-crystal-tab__label {
          text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
        }

        .tz-crystal-tab--active .tz-crystal-tab__icon {
          filter:
            drop-shadow(0 0 3px rgba(229, 213, 156, 0.15))
            drop-shadow(0 1px 2px rgba(0, 0, 0, 0.75));
        }

        .tz-crystal-tab__glow {
          position: absolute;
          z-index: 0;
          inset: 7px -2px;

          background: radial-gradient(
            ellipse at center,
            rgba(35, 130, 71, 0.2),
            rgba(12, 69, 37, 0.08) 55%,
            transparent 78%
          );

          filter: blur(7px);
          pointer-events: none;
        }

        .tz-crystal-tab__gem {
          position: absolute;
          z-index: 2;
          top: 50%;
          left: 50%;

          width: calc(100% + 8px);
          max-width: 270px;
          height: 72px;

          transform: translate(-50%, -50%);
          pointer-events: none;

          filter:
            drop-shadow(0 4px 5px rgba(0, 0, 0, 0.42))
            drop-shadow(0 0 4px rgba(24, 109, 57, 0.15));
        }

        .tz-crystal-svg {
          display: block;
          width: 100%;
          height: 100%;
          overflow: visible;
        }

        /* ================== INTERACTION ================== */

        .tz-crystal-tab:not(.tz-crystal-tab--active):hover {
          color: #f3f0e5;
        }

        .tz-crystal-tab:focus-visible {
          outline: 2px solid rgba(218, 194, 135, 0.9);
          outline-offset: 2px;
        }

        /* ================== DESKTOP ================== */

        @media (min-width: 700px) {
          .tz-crystal-nav {
            min-height: 94px;
            padding: 8px 12px;
          }

          .tz-crystal-tab {
            height: 76px;
          }

          .tz-crystal-tab__gem {
            height: 84px;
            max-width: 290px;
          }

          .tz-crystal-tab__label {
            font-size: 11px;
            letter-spacing: 0.15em;
          }

          .tz-crystal-tab__icon svg {
            width: 24px;
            height: 24px;
          }
        }

        /* ================== MOBILE ================== */

        @media (max-width: 699px) {
          .tz-crystal-nav {
            width: calc(100vw - 48px);
            min-height: 76px;
            padding: 5px 7px;
          }

          .tz-crystal-tab {
            height: 62px;
          }

          .tz-crystal-tab__content {
            gap: 4px;
          }

          .tz-crystal-tab__icon {
            height: 23px;
          }

          .tz-crystal-tab__icon svg {
            width: 22px;
            height: 22px;
          }

          .tz-crystal-tab__label {
            font-size: 9px;
            letter-spacing: 0.035em;
          }

          .tz-crystal-tab__gem {
            width: calc(100% + 8px);
            max-width: 168px;
            height: 65px;
          }

          .tz-crystal-tab--desktop-only {
            display: none;
          }
        }

        @media (max-width: 370px) {
          .tz-crystal-nav {
            width: calc(100vw - 28px);
            padding-inline: 4px;
          }

          .tz-crystal-tab__label {
            font-size: 8px;
            letter-spacing: 0;
          }

          .tz-crystal-tab__icon svg {
            width: 20px;
            height: 20px;
          }

          .tz-crystal-tab__gem {
            height: 61px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .tz-crystal-tab {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
