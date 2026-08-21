"use client";

import { useApp, ViewId } from "@/context/AppContext";
import { BUSINESS_HOURS } from "@/lib/types";
import { isToday, peso } from "@/lib/format";

const NAV: { id: ViewId; icon: string; label: string }[] = [
  { id: "pos", icon: "🛒", label: "New Order" },
  { id: "orders", icon: "📋", label: "Orders" },
  { id: "daily", icon: "📅", label: "Daily Orders" },
  { id: "summary", icon: "📊", label: "Daily Summary" },
  { id: "sales", icon: "📈", label: "Sales Tracking" },
  { id: "payments", icon: "💳", label: "Payment Methods" },
];

export default function Sidebar() {
  const { activeView, switchView, orders } = useApp();
  const today = orders.filter((o) => o.status !== "cancelled" && isToday(o.time));
  const rev = today.reduce((s, o) => s + (o.paid ? o.total : 0), 0);
  const paidCount = today.filter((o) => o.paid).length;
  const target = 1000;
  const pct = Math.max(0, Math.min(100, Math.round((rev / target) * 100)));
  const unpaidTotal = orders.filter((o) => o.status !== "cancelled" && !o.paid).reduce((s, o) => s + o.total, 0);

  return (
    <nav className="sidebar">
      <div className="sidebar-section-label">Menu</div>
      {NAV.map((n) => (
        <div
          key={n.id}
          className={`nav-item${activeView === n.id ? " active" : ""}`}
          onClick={() => switchView(n.id)}
          id={`nav-${n.id}`}
        >
          <span className="nav-icon">{n.icon}</span> {n.label}
          {n.id === "orders" && <span className="nav-badge">{orders.length}</span>}
        </div>
      ))}

      <div className="sidebar-section-label" style={{ marginTop: 8 }}>
        Today
      </div>
      <div className="sidebar-stats sidebar-stats-premium">
        <div className="sidebar-stat-glow" />
        <div className="sidebar-stat-top">
          <div className="sidebar-stat-label">
            <span className="sidebar-stat-dot" /> Revenue
          </div>
          <span className="sidebar-stat-badge">TODAY</span>
        </div>
        <div className="sidebar-stat-val">{peso(rev)}</div>
        <div className="sidebar-stat-sub">
          <span className="sidebar-stat-check">✓</span>
          {today.length} order{today.length !== 1 ? "s" : ""} · {paidCount} paid
        </div>
        <div className="sidebar-stat-progress">
          <div className="sidebar-stat-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        {unpaidTotal > 0 && (
          <div className="sidebar-stat-unpaid">
            <span>⏳ Unpaid</span>
            <span>{peso(unpaidTotal)}</span>
          </div>
        )}
      </div>
      <div className="sidebar-hours">🕐 {BUSINESS_HOURS.label}</div>
    </nav>
  );
}
