"use client";

import { useApp, ViewId } from "@/context/AppContext";
import { BUSINESS_HOURS, getBalance, getLoadCount } from "@/lib/types";
import { getBusinessDayKey, isBusinessToday, peso } from "@/lib/format";

const NAV: { id: ViewId; icon: string; label: string }[] = [
  { id: "pos", icon: "🛒", label: "New Order" },
  { id: "orders", icon: "📋", label: "Orders" },
  { id: "unpaid", icon: "⏳", label: "Unpaid Customers" },
  { id: "daily", icon: "📅", label: "Daily Orders" },
  { id: "summary", icon: "📊", label: "Daily Summary" },
  { id: "sales", icon: "📈", label: "Sales Tracking" },
  // Payment Methods and All Data (Reference) merged into one Tools entry —
  // both were occasional-use settings screens taking a permanent nav slot.
  { id: "tools", icon: "🛠️", label: "Tools" },
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
  const loads = today.reduce((n, o) => n + getLoadCount(o.items), 0);
  const target = 1000;
  const pct = Math.max(0, Math.min(100, Math.round((rev / target) * 100)));

  // Same point in yesterday's business day, so the comparison is like-for-like
  // rather than today-so-far against yesterday's full total.
  const yesterdayKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getBusinessDayKey(d.toISOString());
  })();
  const msIntoDay = (iso: string) => {
    const t = new Date(iso);
    const h = t.getHours(), m = t.getMinutes();
    // Hours since the 6AM business-day start, wrapping past midnight.
    return ((h - 6 + 24) % 24) * 60 + m;
  };
  const nowInto = msIntoDay(new Date().toISOString());
  const yesterdaySoFar = orders
    .filter((o) => o.status !== "cancelled" && getBusinessDayKey(o.time) === yesterdayKey && msIntoDay(o.time) <= nowInto)
    .reduce((s, o) => s + (o.amountPaid || 0), 0);
  const deltaPct = yesterdaySoFar > 0 ? Math.round(((rev - yesterdaySoFar) / yesterdaySoFar) * 100) : null;
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
        <div className="sidebar-stat-valrow">
          <div className="sidebar-stat-val">{peso(rev)}</div>
          {deltaPct !== null && (
            <span
              className={`sidebar-stat-delta${deltaPct >= 0 ? " up" : " down"}`}
              title={`vs ${peso(yesterdaySoFar)} by this time yesterday`}
            >
              {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}%
            </span>
          )}
        </div>
        <div className="sidebar-stat-sub">
          <span className="sidebar-stat-check">✓</span>
          {today.length} order{today.length !== 1 ? "s" : ""} · {paidCount} paid
        </div>

        {/* At-a-glance shift numbers — what a till operator actually wants
            without leaving the current screen. */}
        <div className="sidebar-stat-chips">
          <span className="sidebar-chip">🧺 {loads} load{loads !== 1 ? "s" : ""}</span>
          <span className="sidebar-chip">🧾 {today.length ? peso(Math.round(rev / today.length)) : peso(0)} avg</span>
        </div>

        <div className="sidebar-stat-progress" title={`${pct}% of the ${peso(target)} daily target`}>
          <div className="sidebar-stat-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="sidebar-stat-target">
          <span>{pct}% of daily target</span>
          <span>{peso(target)}</span>
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
