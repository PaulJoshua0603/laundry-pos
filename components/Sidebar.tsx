"use client";

import { useMemo } from "react";
import { useApp, ViewId } from "@/context/AppContext";
import { BUSINESS_HOURS, getBalance, getLoadCount } from "@/lib/types";
import { getBusinessDayKey, isBusinessToday, peso } from "@/lib/format";

// Order set by the shop owner to match how the till is actually used.
const NAV: { id: ViewId; icon: string; label: string }[] = [
  { id: "pos", icon: "🛒", label: "New Order" },
  { id: "orders", icon: "📋", label: "Orders" },
  { id: "unpaid", icon: "⏳", label: "Unpaid Customers" },
  { id: "sales", icon: "📈", label: "Sales Tracking" },
  // Payment Methods and All Data (Reference) merged into one Tools entry —
  // both were occasional-use settings screens taking a permanent nav slot.
  { id: "tools", icon: "🛠️", label: "Tools" },
];

export default function Sidebar() {
  const { activeView, switchView, orders } = useApp();
  // Business day (calendar day), matching Orders and Sales Tracking. This used
  // the raw calendar day, so the sidebar disagreed with every other screen.
  /* Every figure below is derived from the full order list, and this panel is
     mounted all day — so without memoisation it walked ~800 orders five times
     on every context change, including each toast. Now it recomputes only
     when the orders actually change. */
  const stats = useMemo(() => {
    const today = orders.filter((o) => o.status !== "cancelled" && isBusinessToday(o.time));
  // Count what was actually collected, including down-payments on orders that
  // aren't fully settled yet. Counting only `paid ? total : 0` hid every
  // partial payment and under-reported the day's takings.
  const rev = today.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const paidCount = today.filter((o) => o.paid).length;
  const loads = today.reduce((n, o) => n + getLoadCount(o.items), 0);


  // Collected split by method — what should be in the drawer at closing
  // versus what landed in an e-wallet. `paidMethod` holds the method of the
  // most recent payment, so an order settled half in cash and half in GCash
  // is attributed whole to the later one; part-payments are rare enough that
  // this stays a straight answer to "how much cash should I have?".
  const byMethod = { cash: 0, gcash: 0, maya: 0 };
  today.forEach((o) => {
    const amt = o.amountPaid || 0;
    if (amt <= 0) return;
    const m = o.paidMethod || "cash";
    if (m in byMethod) byMethod[m as keyof typeof byMethod] += amt;
  });
  const methodRows = ([
    { id: "cash", icon: "💵", label: "Cash", cls: "m-cash" },
    { id: "gcash", icon: "📱", label: "GCash", cls: "m-gcash" },
  ] as const)
    .map((m) => ({ ...m, amount: byMethod[m.id] }))
    .filter((m) => m.amount > 0);

  // The target was a hardcoded ₱1,000 — below a normal day's takings here, so
  // the bar read 100% every single day and measured nothing. Compare against
  // what this shop actually does instead: the mean of its last 14 trading
  // days. A quiet day now reads as a quiet day.
  const todayKey = getBusinessDayKey(new Date().toISOString());
  const perDay = new Map<string, number>();
  orders.forEach((o) => {
    if (o.status === "cancelled") return;
    const k = getBusinessDayKey(o.time);
    if (k === todayKey) return;
    perDay.set(k, (perDay.get(k) || 0) + (o.amountPaid || 0));
  });
  const recentDays = Array.from(perDay.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 14)
    .map(([, v]) => v);
  const target = recentDays.length ? Math.round(recentDays.reduce((s, v) => s + v, 0) / recentDays.length) : 0;
  // The label shows the true figure (a 132% day is worth seeing); the bar caps.
  const pctRaw = target > 0 ? Math.round((rev / target) * 100) : 0;
  const pct = Math.max(0, Math.min(100, pctRaw));

  const unpaidOrders = orders.filter((o) => o.status !== "cancelled" && !o.paid);
  // Only the outstanding balance is owed — summing the full order total
  // overstated the debt for any partially-paid order, and disagreed with the
  // figure on the Unpaid Customers screen.
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + getBalance(o), 0);

    return {
      today, rev, paidCount, loads, target, pct, pctRaw, methodRows, unpaidOrders, unpaidTotal,
    };
  }, [orders]);

  const {
    today, rev, paidCount, loads, target, pct, pctRaw, methodRows, unpaidOrders, unpaidTotal,
  } = stats;

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
      <div className="revcard">
        <div className="revcard-glow" aria-hidden="true" />

        <div className="revcard-head">
          <span className="revcard-eyebrow"><span className="revcard-pulse" />Revenue</span>
          <span className="revcard-today">Today</span>
        </div>

        {/* The headline sits on its own line at full weight; the peso sign is
            deliberately lighter so the digits carry the glance. */}
        <div className="revcard-hero">
          <span className="revcard-cur">₱</span>
          <span className="revcard-fig">{rev.toLocaleString()}</span>
        </div>

        {/* One meta line instead of a sub-line plus a row of chips — the same
            three facts, a third of the vertical space, and nothing competing
            with the headline above it. */}
        <div className="revcard-meta">
          <span>{today.length} order{today.length !== 1 ? "s" : ""}</span>
          <span className="revcard-sep" />
          <span>{paidCount} paid</span>
          <span className="revcard-sep" />
          <span>{loads} load{loads !== 1 ? "s" : ""}</span>
        </div>

        {/* Where the money came in. The one thing worth knowing at closing:
            how much of the day was cash, and so what should be in the drawer. */}
        {methodRows.length > 0 && (
          <div className="revcard-block">
            <div className="revcard-bar" title="Share of today's takings by payment method">
              {methodRows.map((m) => (
                <span key={m.id} className={`revcard-seg ${m.cls}`} style={{ flexGrow: m.amount }} />
              ))}
            </div>
            {methodRows.map((m) => (
              <div key={m.id} className="revcard-row">
                <span className={`revcard-key ${m.cls}`} aria-hidden="true" />
                <span className="revcard-row-name">{m.label}</span>
                <span className="revcard-row-amt">{peso(m.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Today against a normal day for this shop — the mean of its last 14
            trading days, so a quiet day reads as quiet. */}
        {target > 0 && (
          <div className="revcard-block">
            <div className="revcard-pacerow">
              <span className="revcard-pacelabel">Usual day</span>
              <span className="revcard-pacepct">{pctRaw}%</span>
            </div>
            <div className="revcard-pace" title={`${pctRaw}% of a typical ${peso(target)} day`}>
              <div className={`revcard-pacefill${pctRaw >= 100 ? " over" : ""}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {unpaidTotal > 0 && (
          <button className="revcard-unpaid" onClick={() => switchView("unpaid")}>
            <span className="revcard-unpaid-label">Unpaid · {unpaidOrders.length}</span>
            <span className="revcard-unpaid-amt">{peso(unpaidTotal)}</span>
          </button>
        )}
      </div>
      <div className="sidebar-hours">🕐 {BUSINESS_HOURS.label}</div>
    </nav>
  );
}
