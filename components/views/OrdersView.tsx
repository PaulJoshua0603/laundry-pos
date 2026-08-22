"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { getLoadCount, isExtraLine, isLoadLine, ORDER_TYPES, Order, OrderStatus, STATUS_MAP, STATUS_OPTIONS } from "@/lib/types";
import { businessDayLabel, getBusinessDayKey, isBusinessToday, peso } from "@/lib/format";
import EditOrderModal from "@/components/EditOrderModal";

const INITIAL_DAYS_SHOWN = 3;

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
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [daysShown, setDaysShown] = useState(INITIAL_DAYS_SHOWN);

  const query = q.trim().toLowerCase();
  const filtered = orders.filter(
    (o) => o.id.toLowerCase().includes(query) || o.name.toLowerCase().includes(query)
  );

  // Group into business-day boxes, newest day first, orders within each
  // day sorted per the chosen sort order.
  const dayGroups = useMemo(() => {
    const map = new Map<string, Order[]>();
    filtered.forEach((o) => {
      const key = getBusinessDayKey(o.time);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    });
    const keys = Array.from(map.keys()).sort((a, b) => (sortOrder === "newest" ? (a < b ? 1 : -1) : a < b ? -1 : 1));
    return keys.map((key) => {
      const dayOrders = map.get(key)!.sort((a, b) => {
        const diff = new Date(a.time).getTime() - new Date(b.time).getTime();
        return sortOrder === "oldest" ? diff : -diff;
      });
      return { key, orders: dayOrders };
    });
  }, [filtered, sortOrder]);

  const visibleGroups = query ? dayGroups : dayGroups.slice(0, daysShown);
  const hasMoreDays = !query && dayGroups.length > daysShown;

  // Top stat chips reflect the CURRENT business day only (6AM–12AM), so a
  // load from yesterday never bleeds into "today"'s totals.
  const todayOrders = orders.filter((o) => o.status !== "cancelled" && isBusinessToday(o.time));
  const uniqueOrderCount = todayOrders.length;
  const uniqueCustomers = new Set(todayOrders.map((o) => o.name.trim().toLowerCase())).size;
  const totalLoads = todayOrders.reduce((n, o) => n + getLoadCount(o.items), 0);
  const totalAmount = todayOrders.reduce((s, o) => s + o.total, 0);

  function confirmDelete(o: Order) {
    if (window.confirm(`Permanently delete order ${o.id}? This cannot be undone.`)) deleteOrder(o.id);
  }

  function toggleDay(key: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function dayTotals(dayOrders: Order[]) {
    const active = dayOrders.filter((o) => o.status !== "cancelled");
    return {
      count: dayOrders.length,
      customers: new Set(active.map((o) => o.name.trim().toLowerCase())).size,
      total: active.reduce((s, o) => s + o.total, 0),
    };
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
            <div className="orders-stat-val">{totalLoads}</div>
            <div className="orders-stat-label">Total Loads</div>
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
          {q && (
            <button className="search-clear-btn" onClick={() => setQ("")} title="Clear search">
              ✕
            </button>
          )}
        </div>
        <select className="sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}>
          <option value="newest">🕐 Newest first</option>
          <option value="oldest">📜 Oldest first</option>
        </select>
      </div>

      {query && filtered.length === 0 ? (
        <div className="orders-empty-search">
          <div style={{ fontSize: 34, opacity: 0.35, marginBottom: 8 }}>🔎</div>
          <div style={{ color: "var(--text3)", fontSize: 14, fontWeight: 600 }}>No customer found</div>
          <div style={{ color: "var(--text3)", fontSize: 12, marginTop: 4 }}>
            No orders match “{q}”. Try a different name or order ID.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="orders-empty-search">
          <div style={{ fontSize: 34, opacity: 0.3, marginBottom: 8 }}>🧺</div>
          <div style={{ color: "var(--text3)", fontSize: 13 }}>No orders yet. Place your first order to see it here.</div>
        </div>
      ) : (
        <>
          {visibleGroups.map(({ key, orders: dayOrders }) => {
            const collapsed = collapsedDays.has(key);
            const totals = dayTotals(dayOrders);
            return (
              <div className="day-group-box" key={key}>
                <div className="day-group-header" onClick={() => toggleDay(key)}>
                  <div className="day-group-title">
                    <span className={`day-group-caret${collapsed ? " collapsed" : ""}`}>▾</span>
                    <span className="day-group-date">{businessDayLabel(key)}</span>
                    <span className="day-group-count">{totals.count} order{totals.count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="day-group-meta">
                    <span>🙋 {totals.customers}</span>
                    <span className="day-group-total">💰 {peso(totals.total)}</span>
                  </div>
                </div>

                {!collapsed && (
                  <div className="table-wrap day-group-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Customer</th>
                          <th>Order ID</th>
                          <th>Type</th>
                          <th>Loads, Items</th>
                          <th>Total</th>
                          <th>Status</th>
                          <th>Payment</th>
                          <th>Pickup</th>
                          <th>Order Time</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dayOrders.map((o) => {
                          const typeInfo = ORDER_TYPES[o.type] || ORDER_TYPES.walkin;
                          const currentStatus = STATUS_MAP[o.status] || STATUS_MAP.washing;
                          const pickupText = o.pickup
                            ? new Date(o.pickup).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                            : "—";
                          const paidMethodLabel: any = { cash: "Cash", gcash: "GCash", maya: "Maya" }[o.paidMethod || ""] || "";
                          const loadQty = getLoadCount(o.items);
                          const extraLines = o.items.filter(isExtraLine);
                          const extraQty = extraLines.reduce((n, c) => n + c.qty, 0);
                          const extraAmount = extraLines.reduce((n, c) => n + c.service.price * c.qty, 0);
                          const initials =
                            o.name
                              .trim()
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((p) => p[0]?.toUpperCase())
                              .join("") || "?";
                          return (
                            <tr key={o.id}>
                              <td>
                                <div className="customer-cell">
                                  <span className="customer-avatar">{initials}</span>
                                  <span>{o.name}</span>
                                </div>
                              </td>
                              <td className="order-id-cell">{o.id}</td>
                              <td>
                                <span className="type-badge">
                                  {typeInfo.icon} {typeInfo.label}
                                </span>
                              </td>
                              <td>
                                <div className="loads-items-cell">
                                  <span className="loads-chip">
                                    🧺 {loadQty} load{loadQty !== 1 ? "s" : ""}
                                  </span>
                                  {extraQty > 0 && (
                                    <span className="items-chip" title={`${peso(extraAmount)} in add-ons/fees`}>
                                      ➕ {extraQty} item{extraQty !== 1 ? "s" : ""}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="mono" style={{ color: "var(--yellow)" }}>
                                <div className="total-cell">
                                  <span>{peso(o.total)}</span>
                                  {extraAmount > 0 && <span className="total-cell-sub">incl. {peso(extraAmount)} extras</span>}
                                </div>
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
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingOrder(o)} title="Edit order details">
                                  ✏️
                                </button>
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
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {hasMoreDays && (
            <div className="day-group-loadmore">
              <button className="btn btn-ghost" onClick={() => setDaysShown((n) => n + INITIAL_DAYS_SHOWN)}>
                Show older transactions ({dayGroups.length - daysShown} more day{dayGroups.length - daysShown !== 1 ? "s" : ""})
              </button>
            </div>
          )}
        </>
      )}

      {editingOrder && <EditOrderModal order={editingOrder} onClose={() => setEditingOrder(null)} />}
    </div>
  );
}
