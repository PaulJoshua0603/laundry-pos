"use client";

import { useApp, ViewId } from "@/context/AppContext";
import { BUSINESS_HOURS, getBalance } from "@/lib/types";
import { isBusinessToday, peso } from "@/lib/format";

const NAV: { id: ViewId; icon: string; label: string }[] = [
  { id: "pos", icon: "🛒", label: "New Order" },
  { id: "orders", icon: "📋", label: "Orders" },
  { id: "unpaid", icon: "⏳", label: "Unpaid Customers" },
  { id: "daily", icon: "📅", label: "Daily Orders" },
  { id: "summary", icon: "📊", label: "Daily Summary" },
  { id: "sales", icon: "📈", label: "Sales Tracking" },
  { id: "payments", icon: "💳", label: "Payment Methods" },
  { id: "rawdata", icon: "🗂️", label: "All Data (Reference)" },
];

export default function Sidebar() {
  const { activeView, switchView, orders } = useApp();
  // Business day (6AM–midnight), matching Orders and Daily Summary. This used
  // the raw calendar day, so the sidebar disagreed with every other screen.
  const today = orders.filter((o) => o.status !== "cancelled" && isBusinessToday(o.time));
  // Count what was actually collected, including down-payments on orders that
  // aren't fully settled yet. Counting only `paid ? total : 0` hid every
  // partial payment and under-reported the day's takings.
  const rev = today.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const paidCount = today.filter((o) => o.paid).length;
  const target = 1000;
  const pct = Math.max(0, Math.min(100, Math.round((rev / target) * 100)));
  const unpaidOrders = orders.filter((o) => o.status !== "cancelled" && !o.paid);
  // Only the outstanding balance is owed — summing the full order total
  // overstated the debt for any partially-paid order, and disagreed with the
  // figure on the Unpaid Customers screen.
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + getBalance(o), 0);

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
          {n.id === "unpaid" && unpaidOrders.length > 0 && (
            <span className="nav-badge nav-badge-warn">{unpaidOrders.length}</span>
          )}
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
          <div className="sidebar-stat-unpaid" onClick={() => switchView("unpaid")} role="button" tabIndex={0}>
            <span>⏳ Unpaid ({unpaidOrders.length})</span>
            <span>{peso(unpaidTotal)}</span>
          </div>
        )}
      </div>
      <div className="sidebar-hours">🕐 {BUSINESS_HOURS.label}</div>
    </nav>
  );
}
