"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { businessDayLabel, getBusinessDayKey, peso } from "@/lib/format";
import { buildDailyOrderNoMap, getBalance, getLoadCount, Order, STATUS_MAP } from "@/lib/types";
import EditOrderModal from "@/components/EditOrderModal";

export default function DailyOrdersView() {
  const { orders, showReceipt } = useApp();
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Tracked by id so the modal always shows the live order rather than a
  // snapshot frozen at the moment it was opened.
  const [editingId, setEditingId] = useState<string | null>(null);
  // One pass instead of a filter+sort of the whole list per rendered row.
  const dailyNos = useMemo(() => buildDailyOrderNoMap(orders), [orders]);
  const editingOrder = editingId ? orders.find((o) => o.id === editingId) ?? null : null;

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
        const paidTotal = active.reduce((s, o) => s + (o.amountPaid || 0), 0);
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
      <div className="daily-hint">🕐 Business day runs 6:00 AM – 12:00 AM · orders before 6AM count toward the previous day</div>

      {days.length === 0 ? (
        <div className="daily-empty">
          <div className="daily-empty-icon">📅</div>
          <div className="daily-empty-text">No orders yet.</div>
        </div>
      ) : (
        <div className="daily-day-list">
          {days.map((d) => {
            const isOpen = openDay === d.key || (openDay === null && d.key === days[0].key);
            return (
              <div key={d.key} className="daily-day-card">
                <div className={`daily-day-header${isOpen ? " open" : ""}`} onClick={() => setOpenDay(isOpen ? "__none__" : d.key)}>
                  <div>
                    <div className="daily-day-title">
                      <span className="daily-day-caret">{isOpen ? "▾" : "▸"}</span> {d.label}
                    </div>
                    <div className="daily-day-meta">
                      {d.orderCount} order{d.orderCount !== 1 ? "s" : ""} · 🧺 {d.loads} load{d.loads !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="daily-day-total">{peso(d.total)}</div>
                    <div className="daily-day-paid">{peso(d.paidTotal)} collected</div>
                  </div>
                </div>

                {isOpen && (
                  <div>
                    {d.orders.map((o) => {
                      const status = STATUS_MAP[o.status] || STATUS_MAP.washing;
                      const loadQty = getLoadCount(o.items);
                      const balance = getBalance(o);
                      return (
                        <div key={o.id} className="daily-order-row">
                          <div className="daily-order-info" onClick={() => showReceipt(o)}>
                            <div className="daily-order-name">
                              {o.name} <span className="daily-order-no">· #{dailyNos.get(o.id) ?? 0}</span>
                            </div>
                            <div className="daily-order-meta">
                              {status.icon} {status.label} · 🧺 {loadQty} load{loadQty !== 1 ? "s" : ""} ·{" "}
                              {new Date(o.time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                          <div className="daily-order-end">
                            {o.status !== "cancelled" && (
                              <span className={`pay-badge ${o.paid ? "pay-badge-paid" : "pay-badge-unpaid"}`}>
                                {o.paid ? "✓ Paid" : o.amountPaid > 0 ? `◐ ${peso(balance)} left` : "⏳ Unpaid"}
                              </span>
                            )}
                            <span className={`daily-order-amount${o.status === "cancelled" ? " cancelled" : ""}`} onClick={() => showReceipt(o)}>
                              {o.status === "cancelled" ? "cancelled" : peso(o.total)}
                            </span>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(o.id)} title="Edit order">
                              ✏️
                            </button>
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

      {editingOrder && <EditOrderModal order={editingOrder} onClose={() => setEditingId(null)} />}
    </div>
  );
}
