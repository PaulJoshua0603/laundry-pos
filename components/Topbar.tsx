"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useApp } from "@/context/AppContext";
import { BUSINESS_HOURS } from "@/lib/types";
import { initialsOf } from "@/lib/format";

function isShopOpen(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  return h >= BUSINESS_HOURS.openHour && h < BUSINESS_HOURS.closeHour;
}

export default function Topbar() {
  const { session, theme, toggleTheme, logout } = useApp();
  const [now, setNow] = useState<Date | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const menu = document.getElementById("userMenu");
      const avatar = document.getElementById("topbarAvatar");
      if (!menu) return;
      if (avatar && avatar.contains(e.target as Node)) return; // handled by onClick
      if (!menu.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const open = now ? isShopOpen(now) : true;
  const dateStr = now ? `${now.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" })} · ${now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : "";

  return (
    <header className="topbar">
      <div className="logo">
        <div className="logo-dot">
          <Image src="/logo.png" alt="Logo" width={28} height={28} />
        </div>
        <span id="shopName">{session?.business || "Laundry Shop"}</span>{" "}
        <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400, marginLeft: 2 }}>POS</span>
      </div>
      <div className="topbar-divider" />
      <div className="topbar-date">{dateStr}</div>
      <div className="topbar-spacer" />
      <div className={`topbar-badge${open ? "" : " is-closed"}`} title={BUSINESS_HOURS.label}>
        {open ? "OPEN" : "CLOSED"}
      </div>
      <button className="theme-toggle" aria-label="Toggle dark / light mode" title="Toggle dark / light mode" onClick={toggleTheme}>
        {theme === "light" ? "🌙" : "☀️"}
      </button>
      <div className="topbar-user">
        <div className="topbar-avatar" id="topbarAvatar" title="Account" onClick={() => setMenuOpen((v) => !v)}>
          {session ? initialsOf(session.name) : "U"}
        </div>
        <div className={`user-menu${menuOpen ? " show" : ""}`} id="userMenu">
          <div className="user-menu-header">
            <div className="user-menu-name">{session?.name || "—"}</div>
            <div className="user-menu-email">{session?.email || "—"}</div>
            <div className="user-menu-email" style={{ marginTop: 2 }}>
              {session?.business || ""}
            </div>
          </div>
          <div className="user-menu-item danger" onClick={logout}>
            <span>🚪</span> Sign out
          </div>
        </div>
      </div>
    </header>
  );
}
