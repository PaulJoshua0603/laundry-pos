"use client";

import { useApp } from "@/context/AppContext";
import { isBusinessToday, peso } from "@/lib/format";
import { getBalance, getLoadCount } from "@/lib/types";
import { useMemo, useState } from "react";
import { exportSalesExcel } from "@/lib/salesExcel";

export default function SummaryView() {
  const { orders, session, clearDayOrders } = useApp();
  const [exporting, setExporting] = useState(false);

  // Use the 6AM–midnight business day, matching the Orders and Sidebar views.
  // This screen used the raw calendar day, so a load taken at 2AM counted
  // toward a different day here than it did everywhere else and the totals
  // disagreed.
  const today = useMemo(() => orders.filter((o) => o.status !== "cancelled" && isBusinessToday(o.time)), [orders]);
  const paidOrders = today.filter((o) => o.paid);
  const unpaidOrders = today.filter((o) => !o.paid);
  const rev = today.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const billed = today.reduce((s, o) => s + o.total, 0);
  const avg = paidOrders.length ? Math.round(rev / paidOrders.length) : 0;
  const unpaidTotal = unpaidOrders.reduce((s, o) => s + getBalance(o), 0);
  const loads = today.reduce((n, o) => n + getLoadCount(o.items), 0);

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
  /* Payment method is a CATEGORICAL encoding, so these three have to be
     genuinely distinguishable. The previous set did not survive checking:
     GCash (#6D5EF5) and Maya (#A855F7) measured ΔE 0.9 apart under
     protanopia — the same colour — and 9.8 under normal vision, which is
     below the readable floor even with full colour vision.

     This set is validated: worst adjacent pair ΔE 9.4 (deuteranopia),
     26.5 (normal), and all three clear 3:1 contrast on the card surface.
     Each segment is also named in the key below, so identity never depends
     on colour alone. */
  const payColors: Record<string, string> = { cash: "#199e70", gcash: "#3987e5", maya: "#d95926" };

  function clearDayData() {
    // This permanently deletes from the cloud now, so it takes a deliberate
    // typed confirmation rather than a single OK — one stray click used to be
    // enough to wipe a trading day.
    if (today.length === 0) {
      window.alert("There are no orders from today to clear.");
      return;
    }
    const typed = window.prompt(
      `This permanently DELETES today's ${today.length} order(s) — ${peso(rev)} collected — from this device AND the cloud.\n\n` +
        `It cannot be undone. Past days are not affected.\n\n` +
        `Type DELETE to confirm:`
    );
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== "DELETE") {
      window.alert("Not cleared — you didn't type DELETE.");
      return;
    }
    // Goes through the context so the rows are removed from the cloud as well
    // as locally, and the UI updates in place. The old version only rewrote
    // localStorage and then reloaded — in cloud mode the orders were re-fetched
    // straight back from the server, so the button appeared to do nothing.
    clearDayOrders();
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

      {/* Same KPI language as Sales Tracking: collected revenue leads, the
          supporting figures sit at equal weight beside it. */}
      <div className="kpi-row">
        <div className="kpi-card kpi-card-hero">
          <div className="kpi-label">Collected today</div>
          <div className="kpi-val">{peso(rev)}</div>
          <div className="kpi-sub">
            of {peso(billed)} billed{unpaidTotal > 0 ? ` · ${peso(unpaidTotal)} still owed` : " · all settled"}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Orders</div>
          <div className="kpi-val">{today.length}</div>
          <div className="kpi-sub">
            {paidOrders.length} paid · {unpaidOrders.length} unpaid
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Avg order</div>
          <div className="kpi-val">{peso(avg)}</div>
          <div className="kpi-sub">per paid transaction</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Loads</div>
          <div className="kpi-val">{loads}</div>
          <div className="kpi-sub">washed &amp; dried</div>
        </div>
      </div>

      {/* Collection progress — the single number an owner checks at closing. */}
      <div className="panel">
        <div className="panel-head">
          <span className="panel-title">Collection</span>
          <span className="panel-hint">
            {billed > 0 ? `${Math.round((rev / billed) * 100)}% of today's sales collected` : "No sales yet today"}
          </span>
        </div>
        <div className="panel-body">
          <div className="svc-track" style={{ height: 10 }}>
            <div
              className="svc-fill"
              style={{ width: `${billed > 0 ? Math.round((rev / billed) * 100) : 0}%`, background: "var(--green)" }}
            />
          </div>
          <div className="meter-key">
            <span className="meter-key-item">
              <span className="meter-dot" style={{ background: "var(--green)" }} />
              Collected <span className="meter-key-val">{peso(rev)}</span>
            </span>
            <span className="meter-key-item">
              <span className="meter-dot" style={{ background: "var(--surface2)" }} />
              Outstanding <span className="meter-key-val">{peso(unpaidTotal)}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="summary-cols">
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Top services</span>
            <span className="panel-hint">by revenue</span>
          </div>
          <div className="panel-body">
            {sorted.length === 0 ? (
              <div className="report-empty">No data yet.</div>
            ) : (
              sorted.slice(0, 6).map((s, i) => (
                <div className="svc-row" key={`${s.id || s.name}-${i}`}>
                  <div className="svc-row-top">
                    <span className="svc-name">
                      {s.icon} {s.name}
                    </span>
                    <span className="svc-val">{peso(s.rev)}</span>
                  </div>
                  <div className="svc-track">
                    <div className="svc-fill" style={{ width: `${Math.round((s.rev / maxRev) * 100)}%` }} />
                  </div>
                  <div className="svc-sub">
                    {s.qty} × {peso(s.price)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Payment mix as one stacked meter rather than three separate bars —
            it is a part-to-whole, so it reads better as a single 100% strip.
            Each method is also named in the key, so identity never rests on
            colour alone. */}
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Payment mix</span>
            <span className="panel-hint">{peso(rev)} collected</span>
          </div>
          <div className="panel-body">
            {rev === 0 ? (
              <div className="report-empty">Nothing collected yet today.</div>
            ) : (
              <>
                <div className="meter">
                  {Object.entries(payMap)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <div
                        className="meter-seg"
                        key={k}
                        style={{ width: `${(v / payTotal) * 100}%`, background: payColors[k] }}
                        title={`${k}: ${peso(v)}`}
                      />
                    ))}
                </div>
                <div className="meter-key">
                  {Object.entries(payMap).map(([k, v]) => (
                    <span className="meter-key-item" key={k}>
                      <span className="meter-dot" style={{ background: payColors[k] }} />
                      {payIcons[k]} {k.charAt(0).toUpperCase() + k.slice(1)}{" "}
                      <span className="meter-key-val">{peso(v)}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
