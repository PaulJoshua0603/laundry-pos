"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { businessDayLabel, getBusinessDayKey, peso } from "@/lib/format";
import { getLoadCount, Order, STATUS_MAP } from "@/lib/types";

export default function DailyOrdersView() {
  const { orders, showReceipt } = useApp();
  const [openDay, setOpenDay] = useState<string | null>(null);

  const days = useMemo(() => {
    const groups: Record<string, Order[]> = {};
    orders.forEach((o) => {
      const key = getBusinessDayKey(o.time);
      if (!groups[key]) groups[key] = [];
      groups[key].push(o);
    });
    return Object.entries(groups)
      .map(([key, list]) => {
        const active = list.filter((o) => o.status !== "cancelled");
        const loads = active.reduce((n, o) => n + getLoadCount(o.items), 0);
        const total = active.reduce((s, o) => s + o.total, 0);
        const paidTotal = active.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
        return {
          key,
          label: businessDayLabel(key),
          orders: list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()),
          orderCount: active.length,
          loads,
          total,
          paidTotal,
        };
      })
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [orders]);

  return (
    <div className="view active" id="view-daily-orders">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Transactions</div>
          <div className="section-title">Daily Orders</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: -8, marginBottom: 4 }}>
        🕐 Business day runs 6:00 AM – 12:00 AM · orders before 6AM count toward the previous day
      </div>

      {days.length === 0 ? (
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "48px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 34, opacity: 0.3, marginBottom: 8 }}>📅</div>
          <div style={{ color: "var(--text3)", fontSize: 13 }}>No orders yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {days.map((d) => {
            const isOpen = openDay === d.key || (openDay === null && d.key === days[0].key);
            return (
              <div key={d.key} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden" }}>
                <div
                  onClick={() => setOpenDay(isOpen ? "__none__" : d.key)}
                  style={{
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    borderBottom: isOpen ? "1px solid var(--border)" : "none",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {isOpen ? "▾" : "▸"} {d.label}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>
                      {d.orderCount} order{d.orderCount !== 1 ? "s" : ""} · 🧺 {d.loads} load{d.loads !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: "var(--yellow)" }}>
                      {peso(d.total)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{peso(d.paidTotal)} paid</div>
                  </div>
                </div>

                {isOpen && (
                  <div>
                    {d.orders.map((o) => {
                      const status = STATUS_MAP[o.status] || STATUS_MAP.washing;
                      const loadQty = getLoadCount(o.items);
                      return (
                        <div
                          key={o.id}
                          onClick={() => showReceipt(o)}
                          style={{
                            padding: "10px 16px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                              {o.name} <span style={{ color: "var(--text3)", fontWeight: 400 }}>· {o.id}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text3)" }}>
                              {status.icon} {status.label} · 🧺 {loadQty} load{loadQty !== 1 ? "s" : ""} ·{" "}
                              {new Date(o.time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                          <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: o.status === "cancelled" ? "var(--text3)" : "var(--yellow)" }}>
                            {o.status === "cancelled" ? "cancelled" : peso(o.total)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
