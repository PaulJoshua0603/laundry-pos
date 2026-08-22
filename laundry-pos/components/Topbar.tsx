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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function Topbar() {
  const { session, theme, toggleTheme, logout, notifications, unreadCount, markNotificationsRead, clearNotifications, showToast } = useApp();
  const [now, setNow] = useState<Date | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const menu = document.getElementById("userMenu");
      const avatar = document.getElementById("topbarAvatar");
      if (menu && !(avatar && avatar.contains(e.target as Node)) && !menu.contains(e.target as Node)) setMenuOpen(false);

      const bellPanel = document.getElementById("notifPanel");
      const bellBtn = document.getElementById("notifBellBtn");
      if (bellPanel && !(bellBtn && bellBtn.contains(e.target as Node)) && !bellPanel.contains(e.target as Node)) setBellOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function handleToggleBell() {
    setBellOpen((v) => {
      const next = !v;
      if (next) {
        showToast("🔔 Notification history opened");
        markNotificationsRead();
      }
      return next;
    });
  }

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

      <div className="notif-wrap">
        <button className="theme-toggle" id="notifBellBtn" aria-label="Notifications" title="Notifications" onClick={handleToggleBell}>
          🔔
          {unreadCount > 0 && <span className="notif-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </button>
        <div className={`notif-panel${bellOpen ? " show" : ""}`} id="notifPanel">
          <div className="notif-panel-head">
            <span>Notifications</span>
            {notifications.length > 0 && (
              <button className="notif-clear-btn" onClick={clearNotifications}>
                Clear all
              </button>
            )}
          </div>
          <div className="notif-panel-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No activity yet. Actions you take will show up here.</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`notif-item notif-item-${n.type || "default"}`}>
                  <span className="notif-item-dot" />
                  <div className="notif-item-body">
                    <div className="notif-item-msg">{n.message}</div>
                    <div className="notif-item-time">{timeAgo(n.time)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
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
