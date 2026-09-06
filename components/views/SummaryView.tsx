"use client";

import { useApp } from "@/context/AppContext";
import { isToday, peso } from "@/lib/format";
import { getBalance, Order } from "@/lib/types";
import { useMemo, useState } from "react";
import { saveOrders } from "@/lib/storage";
import { exportSalesExcel } from "@/lib/salesExcel";

export default function SummaryView() {
  const { orders, session } = useApp();
  const [exporting, setExporting] = useState(false);

  const today = useMemo(() => orders.filter((o) => o.status !== "cancelled" && isToday(o.time)), [orders]);
  const paidOrders = today.filter((o) => o.paid);
  const unpaidOrders = today.filter((o) => !o.paid);
  const rev = today.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const avg = paidOrders.length ? Math.round(rev / paidOrders.length) : 0;
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + getBalance(o), 0);

  const svcMap: Record<string, { id: string; name: string; icon: string; desc: string; price: number; qty: number; rev: number }> = {};
  today.forEach((o) =>
    o.items.forEach((c) => {
      const k = c.service.id;
      if (!svcMap[k]) svcMap[k] = { ...c.service, qty: 0, rev: 0 };
      svcMap[k].qty += c.qty;
      svcMap[k].rev += c.service.price * c.qty;
    })
  );
  const sorted = Object.values(svcMap).sort((a, b) => b.rev - a.rev);
  const maxRev = sorted[0]?.rev || 1;

  const payMap: Record<string, number> = { cash: 0, gcash: 0, maya: 0 };
  today.forEach((o) => {
    if (!o.amountPaid) return;
    const m = o.paidMethod || o.payment;
    if (m && payMap[m] !== undefined) payMap[m] += o.amountPaid;
  });
  const payTotal = Object.values(payMap).reduce((a, b) => a + b, 0) || 1;
  const payIcons: Record<string, string> = { cash: "💵", gcash: "📱", maya: "💜" };
  const payColors: Record<string, string> = { cash: "var(--green)", gcash: "var(--blue)", maya: "#A855F7" };

  function clearDayData() {
    if (!window.confirm("Clear all order data for today? This cannot be undone. (Past days stay in Sales Tracking.)")) return;
    const next = orders.filter((o) => !isToday(o.time));
    if (session) saveOrders(session.userId, next);
    window.location.reload();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const shopName = session?.business || "WashHub Laundry";
      const dateStr = new Date().toLocaleDateString("en-CA");
      await exportSalesExcel(today, {
        title: "Daily Summary",
        subtitle: new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
        shopName,
        filename: `${shopName.replace(/[^a-z0-9]+/gi, "-")}-daily-sales-${dateStr}.xlsx`,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="view active" id="view-summary">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Analytics</div>
          <div className="section-title">Daily Summary</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? "⏳ Exporting…" : "📊 Export Excel (A4)"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={clearDayData}>
            Clear Day
          </button>
        </div>
      </div>

      <div className="stats-row stats-row-4">
        <div className="stat-card">
          <div className="stat-card-label">Revenue</div>
          <div className="stat-card-val">{peso(rev)}</div>
          <div className="stat-card-sub">Collected today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Orders</div>
          <div className="stat-card-val">{today.length}</div>
          <div className="stat-card-sub">Today</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg Order</div>
          <div className="stat-card-val">{peso(avg)}</div>
          <div className="stat-card-sub">Per paid transaction</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Unpaid</div>
          <div className="stat-card-val" style={{ color: "var(--yellow)" }}>
            {peso(unpaidTotal)}
          </div>
          <div className="stat-card-sub">
            {unpaidOrders.length} order{unpaidOrders.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div className="report-card">
        <div className="report-card-head">
          <span className="report-card-title">🏆 Top Services</span>
          <span className="report-card-hint">by revenue</span>
        </div>
        <div className="report-list">
          {sorted.length === 0 ? (
            <div className="report-empty">No data yet.</div>
          ) : (
            sorted.map((s, i) => (
              <div className="report-row" key={`${s.id || s.name}-${i}`}>
                <div className="report-row-top">
                  <span className="report-row-label">
                    {s.icon} {s.name} <span className="report-row-desc">({s.desc})</span>
                  </span>
                  <span className="report-row-val">{peso(s.rev)}</span>
                </div>
                <div className="report-bar-track">
                  <div className="report-bar-fill" style={{ width: `${Math.round((s.rev / maxRev) * 100)}%` }} />
                </div>
                <div className="report-row-sub">
                  {s.qty} load{s.qty !== 1 ? "s" : ""} · {peso(s.price)} each
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="report-card">
        <div className="report-card-head">
          <span className="report-card-title">💳 Payment Methods</span>
        </div>
        <div className="report-list report-list-padded">
          {Object.entries(payMap).map(([k, v]) => (
            <div className="report-pay-row" key={k}>
              <div className="report-row-top">
                <span className="report-row-label-plain">
                  {payIcons[k]} {k.charAt(0).toUpperCase() + k.slice(1)}
                </span>
                <span className="report-row-val-plain">{peso(v)}</span>
              </div>
              <div className="report-bar-track">
                <div className="report-bar-fill" style={{ width: `${Math.round((v / payTotal) * 100)}%`, background: payColors[k] }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
