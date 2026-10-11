
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function PlayerNavigation() {
  const [visible, setVisible] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    let previousY = window.scrollY;

    function handleScroll() {
      const currentY = window.scrollY;

      if (currentY < 20 || currentY < previousY - 2) {
        setVisible(true);
      } else if (currentY > previousY + 5) {
        setVisible(false);
      }

      previousY = currentY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      aria-label="Player navigation"
      style={{
        position: "fixed",
        zIndex: 1000,
        bottom: "max(16px, env(safe-area-inset-bottom))",
        left: "50%",
        transform: `translate(-50%, ${visible ? "0" : "150px"})`,
        opacity: visible ? 1 : 0,
        transition: "transform 220ms ease, opacity 220ms ease",
        pointerEvents: visible ? "auto" : "none",
        background: "#07140f",
        border: "1px solid #b99a52",
        borderRadius: 18,
        padding: "10px 20px",
        boxShadow: "0 8px 28px #0008",
      }}
    >
      <Link
        href="/profile"
        aria-current={pathname === "/profile" ? "page" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          minWidth: 110,
          minHeight: 42,
          color: "#e1c477",
          textDecoration: "none",
          fontWeight: 700,
          fontSize: 15,
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 21 }}>◉</span>
        Profile
      </Link>
    </nav>
  );
}
