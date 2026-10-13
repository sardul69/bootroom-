"use client";

import Link from "next/link";

export default function PlayerNavigation() {
  return (
    <nav style={{
      position: "fixed",
      bottom: 20,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 1000,
      display: "flex",
      gap: 10,
      padding: 8,
      borderRadius: 18,
      background: "#07140f",
      border: "1px solid #4cbd83",
      boxShadow: "0 0 24px #16a76555",
    }}>
      <Link href="/" style={linkStyle}>Home</Link>
      <Link href="/profile" style={linkStyle}>Profile</Link>
    </nav>
  );
}

const linkStyle = {
  color: "#d4f5df",
  textDecoration: "none",
  fontWeight: 800,
  padding: "14px 24px",
  borderRadius: 12,
};