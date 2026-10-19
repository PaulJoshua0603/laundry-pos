"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { BUSINESS_DAY_START_HOUR, businessDayStart, peso } from "@/lib/format";
import { getLoadCount } from "@/lib/types";

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
  // Every boundary below starts at the business-day mark so these totals
  // match Orders, Daily Orders, Summary and the Sidebar exactly. Previously
  // this screen alone used midnight, and late-night orders were counted on a
  // different day here than everywhere else.
  if (period === "today") {
    const base = new Date(now);
    // Before the start hour we are still inside yesterday's business day.
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
    return { start, end, buckets, label, chartHint: "by hour" };
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
  const { orders, salesPeriod, setSalesPeriod, salesOffset, setSalesOffset } = useApp();
  const [hovered, setHovered] = useState<number | null>(null);

  const { start, end, buckets, label, chartHint } = useMemo(
    () => getPeriodBounds(salesPeriod, salesOffset),
    [salesPeriod, salesOffset]
  );

  // Memoised: a full pass over the order list, previously rerun on every
  // render including each tooltip hover on the chart.
  const { inRange, rev, avg } = useMemo(() => {
    const list = orders.filter((o) => {
      const t = new Date(o.time);
      return t >= start && t < end && o.status !== "cancelled";
    });
    const r = list.reduce((s, o) => s + (o.amountPaid || 0), 0);
    // "Avg order" is the value of a typical order, so it divides what was
    // RUNG UP by the order count. Dividing collected-so-far instead made the
    // average sag every time an order went out unpaid, which is a fact about
    // collection, not about what customers spend.
    const billedInRange = list.reduce((s, o) => s + o.total, 0);
    return { inRange: list, rev: r, avg: list.length ? Math.round(billedInRange / list.length) : 0 };
  }, [orders, start, end]);

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
  const prevRev = useMemo(
    () =>
      orders.reduce((s, o) => {
        if (o.status === "cancelled") return s;
        const t = new Date(o.time);
        return t >= prevBounds.start && t < prevBounds.end ? s + (o.amountPaid || 0) : s;
      }, 0),
    [orders, prevBounds]
  );
  const deltaPct = prevRev > 0 ? Math.round(((rev - prevRev) / prevRev) * 100) : null;
  const loads = inRange.reduce((n, o) => n + getLoadCount(o.items), 0);


  // How the period's money actually came in. Three named parts of one total,
  // so: a single stacked bar for the shape, and a legend carrying the figures
  // — never colour alone, and no number floating on every segment.
  const payMix = useMemo(() => {
    const sums = { cash: 0, gcash: 0, maya: 0 };
    inRange.forEach((o) => {
      const amt = o.amountPaid || 0;
      if (amt <= 0) return;
      const m = (o.paidMethod || "cash") as keyof typeof sums;
      if (m in sums) sums[m] += amt;
    });
    const collected = sums.cash + sums.gcash + sums.maya;
    const rows = ([
      { id: "cash", icon: "💵", label: "Cash", cls: "m-cash" },
      { id: "gcash", icon: "📱", label: "GCash", cls: "m-gcash" },
    ] as const)
      .map((m) => ({
        ...m,
        amount: sums[m.id],
        pct: collected > 0 ? Math.round((sums[m.id] / collected) * 100) : 0,
      }))
      .filter((m) => m.amount > 0);
    return { rows, collected };
  }, [inRange]);


  return (
    <div className="view active" id="view-sales">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Analytics</div>
          <div className="section-title">Sales Tracking</div>
        </div>
      </div>

      {/* Segmented control rather than loose pills: the four periods are one
          choice, so they read as one control with one selection in it. */}
      <div className="period-seg" role="tablist" aria-label="Reporting period">
        {(["today", "week", "month", "year"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={salesPeriod === p}
            className={`period-opt${salesPeriod === p ? " active" : ""}`}
            onClick={() => {
              setSalesPeriod(p);
              setSalesOffset(0);
            }}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
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

      {payMix.rows.length > 0 && (
        <div className="report-card">
          <div className="report-card-head">
            <span className="report-card-title">💳 How You Got Paid</span>
            <span className="report-card-hint">{peso(payMix.collected)} collected</span>
          </div>
          <div className="paymix">
            <div
              className="paymix-bar"
              role="img"
              aria-label={payMix.rows.map((m) => `${m.label} ${peso(m.amount)}, ${m.pct}%`).join("; ")}
            >
              {payMix.rows.map((m) => (
                <span
                  key={m.id}
                  className={`paymix-seg ${m.cls}`}
                  style={{ flexGrow: m.amount }}
                  title={`${m.label} · ${peso(m.amount)} (${m.pct}%)`}
                />
              ))}
            </div>
            {/* The legend is also the value table: identity never rests on
                colour alone, and the figures sit where they are read. */}
            <div className="paymix-legend">
              {payMix.rows.map((m) => (
                <div className="paymix-item" key={m.id}>
                  <span className={`paymix-key ${m.cls}`} aria-hidden="true" />
                  <span className="paymix-name">
                    {m.icon} {m.label}
                  </span>
                  <span className="paymix-pct">{m.pct}%</span>
                  <span className="paymix-amt">{peso(m.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
