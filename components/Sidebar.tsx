"use client";

import { useMemo } from "react";
import { useApp, ViewId } from "@/context/AppContext";
import { BUSINESS_HOURS, getBalance, getLoadCount } from "@/lib/types";
import { BUSINESS_DAY_START_HOUR, getBusinessDayKey, isBusinessToday, peso } from "@/lib/format";

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
  // Business day (calendar day), matching Orders and Daily Summary. This used
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

  // What the day actually rang up, as opposed to what has been collected.
  // The gap between the two is money still owed on today's work.
  const billed = today.reduce((s, o) => s + o.total, 0);
  // Average ORDER VALUE. This divided collected-so-far by the order count,
  // which is not an average of anything: on a day with unpaid orders it
  // reported a typical order as far cheaper than any order on the list.
  const avgOrder = today.length ? Math.round(billed / today.length) : 0;

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
    // Minutes since the business-day start, wrapping past midnight. Reads the
    // shared constant rather than a hardcoded 6 — that literal was left over
    // from the old 6AM boundary and would have offset this comparison by six
    // hours, silently comparing the wrong slice of yesterday.
    return ((h - BUSINESS_DAY_START_HOUR + 24) % 24) * 60 + m;
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

    return {
      today, rev, paidCount, loads, target, pct, pctRaw, billed, avgOrder, methodRows,
      yesterdaySoFar, deltaPct, unpaidOrders, unpaidTotal,
    };
  }, [orders]);

  const {
    today, rev, paidCount, loads, target, pct, pctRaw, billed, avgOrder, methodRows,
    yesterdaySoFar, deltaPct, unpaidOrders, unpaidTotal,
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

        {/* Where the money came in. The single most useful thing to see at
            closing: how much of the day was cash, and so what should
            physically be in the drawer. */}
        {methodRows.length > 0 && (
          <div className="rev-split">
            <div className="rev-split-bar" title="Share of today's takings by payment method">
              {methodRows.map((m) => (
                <span key={m.id} className={`rev-split-seg ${m.cls}`} style={{ flexGrow: m.amount }} />
              ))}
            </div>
            {methodRows.map((m) => (
              <div key={m.id} className="rev-split-row">
                <span className="rev-split-name">
                  <span className={`rev-split-dot ${m.cls}`} /> {m.icon} {m.label}
                </span>
                <span className="rev-split-amt">{peso(m.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* At-a-glance shift numbers — what a till operator actually wants
            without leaving the current screen. */}
        <div className="sidebar-stat-chips">
          <span className="sidebar-chip">🧺 {loads} load{loads !== 1 ? "s" : ""}</span>
          <span className="sidebar-chip">🧾 {peso(avgOrder)} avg</span>
        </div>

        {/* Rung up versus taken in. Only worth the line when they differ. */}
        {billed > rev && (
          <div className="rev-billed">
            <span>Billed {peso(billed)}</span>
            <span className="rev-billed-gap">{peso(billed - rev)} still out</span>
          </div>
        )}

        {target > 0 && (
          <>
            <div className="sidebar-stat-progress" title={`${pctRaw}% of a typical ${peso(target)} day`}>
              <div className={`sidebar-stat-progress-fill${pctRaw >= 100 ? " over" : ""}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="sidebar-stat-target">
              <span>{pctRaw}% of your usual day</span>
              <span>{peso(target)}</span>
            </div>
          </>
        )}
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
