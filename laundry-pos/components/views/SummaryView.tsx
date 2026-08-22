"use client";

import { useApp } from "@/context/AppContext";
import { isToday, peso } from "@/lib/format";
import { Order } from "@/lib/types";
import { useMemo, useState } from "react";
import { saveOrders } from "@/lib/storage";
import { exportSalesExcel } from "@/lib/salesExcel";

export default function SummaryView() {
  const { orders, session } = useApp();
  const [exporting, setExporting] = useState(false);

  const today = useMemo(() => orders.filter((o) => o.status !== "cancelled" && isToday(o.time)), [orders]);
  const paidOrders = today.filter((o) => o.paid);
  const unpaidOrders = today.filter((o) => !o.paid);
  const rev = paidOrders.reduce((s, o) => s + o.total, 0);
  const avg = paidOrders.length ? Math.round(rev / paidOrders.length) : 0;
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + o.total, 0);

  const svcMap: Record<string, { name: string; icon: string; desc: string; price: number; qty: number; rev: number }> = {};
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
  paidOrders.forEach((o) => {
    const m = o.paidMethod || o.payment;
    if (m && payMap[m] !== undefined) payMap[m] += o.total;
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

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Top Services</span>
          <span style={{ fontSize: 11, color: "var(--text3)" }}>by revenue</span>
        </div>
        <div style={{ padding: "8px 0" }}>
          {sorted.length === 0 ? (
            <div style={{ padding: "20px 16px", color: "var(--text3)", fontSize: 13, textAlign: "center" }}>No data yet.</div>
          ) : (
            sorted.map((s) => (
              <div key={s.name} style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {s.icon} {s.name} <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 400 }}>({s.desc})</span>
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--yellow)", fontWeight: 700 }}>{peso(s.rev)}</span>
                </div>
                <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round((s.rev / maxRev) * 100)}%`, background: "var(--blue)", borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>
                  {s.qty} load{s.qty !== 1 ? "s" : ""} · {peso(s.price)} each
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Payment Methods</span>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {Object.entries(payMap).map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "var(--text2)" }}>
                  {payIcons[k]} {k.charAt(0).toUpperCase() + k.slice(1)}
                </span>
                <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{peso(v)}</span>
              </div>
              <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.round((v / payTotal) * 100)}%`, background: payColors[k], borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
