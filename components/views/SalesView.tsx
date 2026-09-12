"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { BUSINESS_DAY_START_HOUR, businessDayStart, peso } from "@/lib/format";
import { getLoadCount } from "@/lib/types";
import { exportSalesExcel } from "@/lib/salesExcel";

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function hourLabel(h: number) {
  return h === 0 ? "12AM" : h < 12 ? `${h}AM` : h === 12 ? "12PM" : `${h - 12}PM`;
}

/** Rounds an axis maximum up to a clean 1 / 2 / 2.5 / 5 / 10 × power of ten. */
function niceMax(v: number): number {
  if (v <= 0) return 100;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

function compactPeso(n: number): string {
  if (n >= 1000) return `₱${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `₱${Math.round(n)}`;
}

function getPeriodBounds(period: "today" | "week" | "month" | "year", offset: number) {
  const now = new Date();
  // Every boundary below starts at the 6AM business-day mark so these totals
  // match Orders, Daily Orders, Summary and the Sidebar exactly. Previously
  // this screen alone used midnight, and late-night orders were counted on a
  // different day here than everywhere else.
  if (period === "today") {
    const base = new Date(now);
    // Before 6AM we are still inside yesterday's business day.
    if (now.getHours() < BUSINESS_DAY_START_HOUR) base.setDate(base.getDate() - 1);
    base.setDate(base.getDate() + offset);
    const start = businessDayStart(base);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const buckets = [];
    for (let h = 0; h < 24; h++) {
      const bStart = new Date(start);
      bStart.setHours(start.getHours() + h, 0, 0, 0);
      const bEnd = new Date(bStart);
      bEnd.setHours(bStart.getHours() + 1, 0, 0, 0);
      buckets.push({ start: bStart, end: bEnd, label: hourLabel(bStart.getHours()) });
    }
    const label = offset === 0 ? "Today" : start.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    return { start, end, buckets, label, chartHint: "by hour (6AM–6AM)" };
  }
  if (period === "week") {
    const start = businessDayStart(startOfWeek(now));
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
    const start = businessDayStart(base);
    const end = businessDayStart(new Date(base.getFullYear(), base.getMonth() + 1, 1));
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
  const start = businessDayStart(new Date(y, 0, 1));
  const end = businessDayStart(new Date(y + 1, 0, 1));
  const buckets = [];
  for (let m = 0; m < 12; m++) {
    const bStart = businessDayStart(new Date(y, m, 1));
    const bEnd = businessDayStart(new Date(y, m + 1, 1));
    buckets.push({ start: bStart, end: bEnd, label: bStart.toLocaleDateString("en-PH", { month: "short" }) });
  }
  return { start, end, buckets, label: String(y), chartHint: "by month" };
}

export default function SalesView() {
  const { orders, salesPeriod, setSalesPeriod, salesOffset, setSalesOffset, session } = useApp();
  const [exporting, setExporting] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  const { start, end, buckets, label, chartHint } = useMemo(
    () => getPeriodBounds(salesPeriod, salesOffset),
    [salesPeriod, salesOffset]
  );

  const inRange = orders.filter((o) => {
    const t = new Date(o.time);
    return t >= start && t < end && o.status !== "cancelled";
  });
  const rev = inRange.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const avg = inRange.length ? Math.round(rev / inRange.length) : 0;

  // One pass per bucket, carrying the order count too so the tooltip can show
  // it without re-scanning.
  const bucketData = useMemo(
    () =>
      buckets.map((b) => {
        let rev = 0;
        let count = 0;
        orders.forEach((o) => {
          if (o.status === "cancelled") return;
          const t = new Date(o.time);
          if (t < b.start || t >= b.end) return;
          rev += o.amountPaid || 0;
          count++;
        });
        return { ...b, rev, count };
      }),
    [buckets, orders]
  );
  const bucketRevs = bucketData.map((b) => b.rev);
  const maxRev = Math.max(...bucketRevs, 0);
  // Round the axis top to a clean number so the ticks read 0 / 2,000 / 4,000
  // rather than 0 / 1,847 / 3,694.
  const axisMax = niceMax(maxRev);
  const peakIndex = maxRev > 0 ? bucketRevs.indexOf(maxRev) : -1;
  // With 30+ day buckets an x-label under every column is unreadable, so thin
  // them to roughly 8 across the axis.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 8));

  // Same window, one period earlier — the honest comparison for the delta.
  const prevBounds = useMemo(() => getPeriodBounds(salesPeriod, salesOffset - 1), [salesPeriod, salesOffset]);
  const prevRev = orders.reduce((s, o) => {
    if (o.status === "cancelled") return s;
    const t = new Date(o.time);
    return t >= prevBounds.start && t < prevBounds.end ? s + (o.amountPaid || 0) : s;
  }, 0);
  const deltaPct = prevRev > 0 ? Math.round(((rev - prevRev) / prevRev) * 100) : null;
  const loads = inRange.reduce((n, o) => n + getLoadCount(o.items), 0);

  const svcMap: Record<string, { id: string; name: string; icon: string; qty: number; rev: number }> = {};
  inRange.forEach((o) =>
    o.items.forEach((c) => {
      const k = c.service.id;
      if (!svcMap[k]) svcMap[k] = { id: k, name: c.service.name, icon: c.service.icon, qty: 0, rev: 0 };
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

      {/* Revenue is the headline, so it gets a wider tile and the comparison.
          The rest are supporting figures at equal weight. */}
      <div className="kpi-row">
        <div className="kpi-card kpi-card-hero">
          <div className="kpi-label">Revenue collected</div>
          <div className="kpi-valrow">
            <div className="kpi-val">{peso(rev)}</div>
            {deltaPct !== null && (
              <span
                className={`kpi-delta${deltaPct >= 0 ? " up" : " down"}`}
                title={`Previous ${salesPeriod}: ${peso(prevRev)}`}
              >
                {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct)}%
              </span>
            )}
          </div>
          <div className="kpi-sub">
            {deltaPct !== null ? `vs ${peso(prevRev)} previous ${salesPeriod}` : "No comparable previous period"}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Orders</div>
          <div className="kpi-val">{inRange.length}</div>
          <div className="kpi-sub">excl. cancelled</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg order</div>
          <div className="kpi-val">{peso(avg)}</div>
          <div className="kpi-sub">per transaction</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Loads</div>
          <div className="kpi-val">{loads}</div>
          <div className="kpi-sub">washed &amp; dried</div>
        </div>
      </div>

      <div className="report-card">
        <div className="report-card-head">
          <span className="report-card-title">Revenue Breakdown</span>
          <span className="report-card-hint">{chartHint}</span>
        </div>

        {/* Single series, so no legend — the card title names what is plotted.
            Values live on the axis and in the tooltip; only the peak is
            direct-labelled, because a number on every column is unreadable
            (the previous version labelled all 30). */}
        <div className="chart">
          <div className="chart-grid" aria-hidden="true">
            {[1, 0.75, 0.5, 0.25, 0].map((f) => (
              <div className="chart-gridline" key={f}>
                <span className="chart-tick">{compactPeso(axisMax * f)}</span>
              </div>
            ))}
          </div>

          <div className="chart-plot" role="img" aria-label={`Revenue ${chartHint}, total ${peso(rev)}`}>
            {bucketData.map((b, i) => {
              const pct = axisMax > 0 ? (b.rev / axisMax) * 100 : 0;
              const isPeak = i === peakIndex;
              const showLabel = i % labelEvery === 0 || isPeak;
              return (
                <div
                  className={`chart-col${isPeak ? " is-peak" : ""}${hovered === i ? " is-hover" : ""}`}
                  key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
                >
                  {isPeak && b.rev > 0 && <span className="chart-peak-label">{compactPeso(b.rev)}</span>}
                  <div className="chart-bar-track">
                    <div
                      className={`chart-bar${b.rev === 0 ? " is-empty" : ""}`}
                      style={{ height: b.rev > 0 ? `max(3px, ${pct}%)` : "2px" }}
                    />
                  </div>
                  <span className={`chart-xlabel${showLabel ? "" : " is-hidden"}`}>{b.label}</span>

                  {hovered === i && (
                    <div className="chart-tip" role="tooltip">
                      <div className="chart-tip-label">{b.label}</div>
                      <div className="chart-tip-val">{peso(b.rev)}</div>
                      <div className="chart-tip-sub">
                        {b.count} order{b.count !== 1 ? "s" : ""}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {maxRev === 0 && <div className="report-empty">No revenue recorded in this period.</div>}
      </div>

      <div className="report-card">
        <div className="report-card-head">
          <span className="report-card-title">🏆 Top Services</span>
          <span className="report-card-hint">this period</span>
        </div>
        <div className="report-list">
          {sortedSvc.length === 0 ? (
            <div className="report-empty">No sales in this period.</div>
          ) : (
            sortedSvc.map((s, i) => (
              <div className="report-row" key={`${s.id || s.name}-${i}`}>
                <div className="report-row-top">
                  <span className="report-row-label">
                    {s.icon} {s.name}
                  </span>
                  <span className="report-row-val">{peso(s.rev)}</span>
                </div>
                <div className="report-bar-track">
                  <div className="report-bar-fill" style={{ width: `${Math.round((s.rev / maxSvcRev) * 100)}%` }} />
                </div>
                <div className="report-row-sub">
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
