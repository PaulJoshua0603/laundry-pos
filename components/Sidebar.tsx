"use client";

import { useApp, ViewId } from "@/context/AppContext";
import { BUSINESS_HOURS } from "@/lib/types";
import { isToday, peso } from "@/lib/format";

const NAV: { id: ViewId; icon: string; label: string }[] = [
  { id: "pos", icon: "🛒", label: "New Order" },
  { id: "orders", icon: "📋", label: "Orders" },
  { id: "summary", icon: "📊", label: "Daily Summary" },
  { id: "sales", icon: "📈", label: "Sales Tracking" },
  { id: "payments", icon: "💳", label: "Payment Methods" },
];

export default function Sidebar() {
  const { activeView, switchView, orders } = useApp();
  const today = orders.filter((o) => o.status !== "cancelled" && isToday(o.time));
  const rev = today.reduce((s, o) => s + (o.paid ? o.total : 0), 0);
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
      <div className="sidebar-stats">
        <div className="sidebar-stat-label">Revenue</div>
        <div className="sidebar-stat-val">{peso(rev)}</div>
        <div className="sidebar-stat-sub">
          {today.length} order{today.length !== 1 ? "s" : ""} today
        </div>
        {unpaidTotal > 0 && <div className="sidebar-stat-unpaid">{peso(unpaidTotal)} unpaid</div>}
      </div>
      <div className="sidebar-hours">🕐 {BUSINESS_HOURS.label}</div>
    </nav>
  );
}
