"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ORDER_TYPES, Order, OrderStatus, STATUS_MAP, STATUS_OPTIONS } from "@/lib/types";
import { peso } from "@/lib/format";

export default function OrdersView() {
  const {
    orders,
    switchView,
    showReceipt,
    sendPickupSms,
    updateOrderStatus,
    markOrderPaid,
    cancelOrder,
    deleteOrder,
  } = useApp();
  const [q, setQ] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const filtered = orders
    .filter((o) => o.id.toLowerCase().includes(q.toLowerCase()) || o.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const diff = new Date(a.time).getTime() - new Date(b.time).getTime();
      return sortOrder === "oldest" ? diff : -diff;
    });

  const uniqueOrderCount = new Set(filtered.map((o) => o.id)).size;
  const uniqueCustomers = new Set(filtered.map((o) => o.name.trim().toLowerCase())).size;
  const totalItems = filtered.reduce((n, o) => n + o.items.reduce((m, c) => m + c.qty, 0), 0);
  const totalLoads = filtered.reduce(
    (n, o) => n + o.items.reduce((m, c) => (c.service.cat === "wash" || c.service.cat === "dry" ? m + c.qty : m), 0),
    0
  );
  const totalAmount = filtered.reduce((s, o) => s + o.total, 0);

  function confirmDelete(o: Order) {
    if (window.confirm(`Permanently delete order ${o.id}? This cannot be undone.`)) deleteOrder(o.id);
  }

  return (
    <div className="view active" id="view-orders">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Transactions</div>
          <div className="section-title">Orders</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => switchView("pos")}>
          + New Order
        </button>
      </div>

      <div className="orders-stat-row">
        <div className="orders-stat-chip">
          <span className="orders-stat-icon">🧾</span>
          <div>
            <div className="orders-stat-val">{uniqueOrderCount}</div>
            <div className="orders-stat-label">Order{uniqueOrderCount !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="orders-stat-chip">
          <span className="orders-stat-icon">🙋</span>
          <div>
            <div className="orders-stat-val">{uniqueCustomers}</div>
            <div className="orders-stat-label">Customer{uniqueCustomers !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="orders-stat-chip">
          <span className="orders-stat-icon">🧺</span>
          <div>
            <div className="orders-stat-val">{totalItems}</div>
            <div className="orders-stat-label">Item{totalItems !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="orders-stat-chip orders-stat-chip-total">
          <span className="orders-stat-icon">💰</span>
          <div>
            <div className="orders-stat-val">{peso(totalAmount)}</div>
            <div className="orders-stat-label">Total</div>
          </div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search by name or order ID…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select className="sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}>
          <option value="newest">🕐 Newest first</option>
          <option value="oldest">📜 Oldest first</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Order ID</th>
              <th>Type</th>
              <th>Items</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Pickup</th>
              <th>Order Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "48px 20px" }}>
                  <div style={{ fontSize: 34, opacity: 0.3, marginBottom: 8 }}>🧺</div>
                  <div style={{ color: "var(--text3)", fontSize: 13 }}>No orders yet. Place your first order to see it here.</div>
                </td>
              </tr>
            ) : (
              filtered.map((o) => {
                const typeInfo = ORDER_TYPES[o.type] || ORDER_TYPES.walkin;
                const currentStatus = STATUS_MAP[o.status] || STATUS_MAP.washing;
                const pickupText = o.pickup
                  ? new Date(o.pickup).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                  : "—";
                const paidMethodLabel: any = { cash: "Cash", gcash: "GCash", maya: "Maya" }[o.paidMethod || ""] || "";
                const itemQty = o.items.reduce((n, c) => n + c.qty, 0);
                return (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td className="order-id-cell">{o.id}</td>
                    <td>
                      <span className="type-badge">
                        {typeInfo.icon} {typeInfo.label}
                      </span>
                    </td>
                    <td style={{ color: "var(--text2)" }}>
                      {itemQty} item{itemQty !== 1 ? "s" : ""}
                    </td>
                    <td className="mono" style={{ color: "var(--yellow)" }}>
                      {peso(o.total)}
                    </td>
                    <td>
                      <select
                        className={`status-select ${currentStatus.cls}`}
                        value={o.status}
                        onChange={(e) => updateOrderStatus(o.id, e.target.value as OrderStatus)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.icon} {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {o.paid ? (
                        <span className="pay-badge pay-badge-paid" title={`Paid via ${paidMethodLabel}`}>
                          ✓ Paid{paidMethodLabel ? ` · ${paidMethodLabel}` : ""}
                        </span>
                      ) : (
                        <div className="pay-unpaid-cell">
                          <span className="pay-badge pay-badge-unpaid">⏳ Unpaid</span>
                          <select
                            className="pay-mark-select"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) markOrderPaid(o.id, e.target.value as any);
                            }}
                          >
                            <option value="">Mark paid via…</option>
                            <option value="cash">💵 Cash</option>
                            <option value="gcash">📱 GCash</option>
                            <option value="maya">💜 Maya</option>
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {pickupText}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {new Date(o.time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="row-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => showReceipt(o)} title="View receipt">
                        🧾
                      </button>
                      {o.status === "ready" && o.phone && (
                        <button className="btn btn-sms btn-sm" onClick={() => sendPickupSms(o.id)} title={`Send pickup SMS to ${o.phone}`}>
                          📲 SMS
                        </button>
                      )}
                      {o.status !== "completed" && o.status !== "cancelled" && (
                        <button className="btn btn-success btn-sm" onClick={() => updateOrderStatus(o.id, "completed")} title="Mark as completed">
                          ✓ Done
                        </button>
                      )}
                      {o.status !== "cancelled" && (
                        <button className="btn btn-danger btn-sm" onClick={() => cancelOrder(o.id)} title="Cancel order">
                          ✕
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => confirmDelete(o)} title="Delete order permanently">
                        🗑️
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="orders-loads-footer">
        <span className="orders-loads-icon">🧺</span>
        TOTAL LOADS: <span className="orders-loads-val">{totalLoads}</span>
      </div>
    </div>
  );
}
