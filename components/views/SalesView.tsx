"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { peso } from "@/lib/format";
import { exportSalesExcel } from "@/lib/salesExcel";

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function getPeriodBounds(period: "today" | "week" | "month" | "year", offset: number) {
  const now = new Date();
  if (period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const buckets = [];
    for (let h = 0; h < 24; h++) {
      const bStart = new Date(start);
      bStart.setHours(h, 0, 0, 0);
      const bEnd = new Date(bStart);
      bEnd.setHours(h + 1, 0, 0, 0);
      const label = h === 0 ? "12AM" : h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`;
      buckets.push({ start: bStart, end: bEnd, label });
    }
    const isToday = offset === 0;
    const label = isToday ? "Today" : start.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    return { start, end, buckets, label, chartHint: "by hour" };
  }
  if (period === "week") {
    const start = startOfWeek(now);
    start.setDate(start.getDate() + offset * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const buckets = [];
    for (let i = 0; i < 7; i++) {
      const bStart = new Date(start);
      bStart.setDate(bStart.getDate() + i);
      const bEnd = new Date(bStart);
      bEnd.setDate(bEnd.getDate() + 1);
      buckets.push({ start: bStart, end: bEnd, label: bStart.toLocaleDateString("en-PH", { weekday: "short" }) });
    }
    const endLabelDate = new Date(end);
    endLabelDate.setDate(endLabelDate.getDate() - 1);
    const label = `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} – ${endLabelDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}`;
    return { start, end, buckets, label, chartHint: "by day" };
  }
  if (period === "month") {
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const daysInMonth = Math.round((end.getTime() - start.getTime()) / 86400000);
    const buckets = [];
    for (let i = 0; i < daysInMonth; i++) {
      const bStart = new Date(start);
      bStart.setDate(bStart.getDate() + i);
      const bEnd = new Date(bStart);
      bEnd.setDate(bEnd.getDate() + 1);
      buckets.push({ start: bStart, end: bEnd, label: String(i + 1) });
    }
    const label = start.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    return { start, end, buckets, label, chartHint: "by day" };
  }
  const y = now.getFullYear() + offset;
  const start = new Date(y, 0, 1);
  const end = new Date(y + 1, 0, 1);
  const buckets = [];
  for (let m = 0; m < 12; m++) {
    const bStart = new Date(y, m, 1);
    const bEnd = new Date(y, m + 1, 1);
    buckets.push({ start: bStart, end: bEnd, label: bStart.toLocaleDateString("en-PH", { month: "short" }) });
  }
  return { start, end, buckets, label: String(y), chartHint: "by month" };
}

export default function SalesView() {
  const { orders, salesPeriod, setSalesPeriod, salesOffset, setSalesOffset, session } = useApp();
  const [exporting, setExporting] = useState(false);

  const { start, end, buckets, label, chartHint } = useMemo(
    () => getPeriodBounds(salesPeriod, salesOffset),
    [salesPeriod, salesOffset]
  );

  const inRange = orders.filter((o) => {
    const t = new Date(o.time);
    return t >= start && t < end && o.status !== "cancelled";
  });
  const rev = inRange.reduce((s, o) => s + (o.paid ? o.total : 0), 0);
  const avg = inRange.length ? Math.round(rev / inRange.length) : 0;

  const bucketRevs = buckets.map((b) =>
    orders
      .filter((o) => {
        const t = new Date(o.time);
        return t >= b.start && t < b.end && o.status !== "cancelled";
      })
      .reduce((s, o) => s + (o.paid ? o.total : 0), 0)
  );
  const maxRev = Math.max(...bucketRevs, 1);

  const svcMap: Record<string, { name: string; icon: string; qty: number; rev: number }> = {};
  inRange.forEach((o) =>
    o.items.forEach((c) => {
      const k = c.service.id;
      if (!svcMap[k]) svcMap[k] = { name: c.service.name, icon: c.service.icon, qty: 0, rev: 0 };
      svcMap[k].qty += c.qty;
      svcMap[k].rev += c.service.price * c.qty;
    })
  );
  const sortedSvc = Object.values(svcMap).sort((a, b) => b.rev - a.rev);
  const maxSvcRev = sortedSvc[0]?.rev || 1;

  async function handleExport() {
    setExporting(true);
    try {
      const shopName = session?.business || "WashHub Laundry";
      const safeLabel = label.replace(/[^a-z0-9]+/gi, "-");
      await exportSalesExcel(inRange, {
        title: "Sales Tracking",
        subtitle: `${salesPeriod.charAt(0).toUpperCase() + salesPeriod.slice(1)} — ${label}`,
        shopName,
        filename: `${shopName.replace(/[^a-z0-9]+/gi, "-")}-sales-${salesPeriod}-${safeLabel}.xlsx`,
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="view active" id="view-sales">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Analytics</div>
          <div className="section-title">Sales Tracking</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
          {exporting ? "⏳ Exporting…" : "📊 Export Excel (A4)"}
        </button>
      </div>

      <div className="pills" id="salesPeriodPills">
        {(["today", "week", "month", "year"] as const).map((p) => (
          <div
            key={p}
            className={`pill${salesPeriod === p ? " active" : ""}`}
            onClick={() => {
              setSalesPeriod(p);
              setSalesOffset(0);
            }}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </div>
        ))}
      </div>

      <div className="sales-nav">
        <button className="btn btn-ghost btn-sm" onClick={() => setSalesOffset((o) => o - 1)}>
          ‹ Prev
        </button>
        <div className="sales-nav-label">{label}</div>
        <button className="btn btn-ghost btn-sm" disabled={salesOffset >= 0} onClick={() => setSalesOffset((o) => Math.min(0, o + 1))}>
          Next ›
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-label">Revenue</div>
          <div className="stat-card-val">{peso(rev)}</div>
          <div className="stat-card-sub">
            {salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This week" : salesPeriod === "month" ? "This month" : "This year"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Orders</div>
          <div className="stat-card-val">{inRange.length}</div>
          <div className="stat-card-sub">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Avg Order</div>
          <div className="stat-card-val">{peso(avg)}</div>
          <div className="stat-card-sub">Per transaction</div>
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Revenue Breakdown</span>
          <span style={{ fontSize: 11, color: "var(--text3)" }}>{chartHint}</span>
        </div>
        <div className="sales-chart">
          {buckets.map((b, i) => {
            const v = bucketRevs[i];
            const h = Math.max(Math.round((v / maxRev) * 100), v > 0 ? 4 : 1);
            const isPeak = v === maxRev && v > 0;
            return (
              <div key={i} className={`sales-bar-col${isPeak ? " is-peak" : ""}`}>
                <span className="sales-bar-val">{peso(v)}</span>
                <div className={`sales-bar${v === 0 ? " empty" : ""}`} style={{ height: `${h}%` }} />
                <span className="sales-bar-label">{b.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Top Services</span>
          <span style={{ fontSize: 11, color: "var(--text3)" }}>this period</span>
        </div>
        <div style={{ padding: "8px 0" }}>
          {sortedSvc.length === 0 ? (
            <div style={{ padding: "20px 16px", color: "var(--text3)", fontSize: 13, textAlign: "center" }}>No sales in this period.</div>
          ) : (
            sortedSvc.map((s) => (
              <div key={s.name} style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 6, borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                    {s.icon} {s.name}
                  </span>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--yellow)", fontWeight: 700 }}>{peso(s.rev)}</span>
                </div>
                <div style={{ height: 4, background: "var(--surface2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.round((s.rev / maxSvcRev) * 100)}%`, background: "var(--blue)", borderRadius: 2 }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>
                  {s.qty} load{s.qty !== 1 ? "s" : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
