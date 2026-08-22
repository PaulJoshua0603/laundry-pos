"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { peso } from "@/lib/format";
import { getDailyOrderNo } from "@/lib/types";

export default function UnpaidView() {
  const { orders, markOrderPaid, switchView } = useApp();
  const [q, setQ] = useState("");

  const unpaid = orders
    .filter((o) => !o.paid && o.status !== "cancelled")
    .filter((o) => o.name.toLowerCase().includes(q.toLowerCase()) || o.id.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const totalUnpaid = unpaid.reduce((s, o) => s + o.total, 0);

  return (
    <div className="view active" id="view-unpaid">
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Accounts</div>
          <div className="section-title">Unpaid Customers</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => switchView("pos")}>
          + New Order
        </button>
      </div>

      <div className="orders-stat-row">
        <div className="orders-stat-chip">
          <span className="orders-stat-icon">⏳</span>
          <div>
            <div className="orders-stat-val">{unpaid.length}</div>
            <div className="orders-stat-label">Unpaid Order{unpaid.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="orders-stat-chip">
          <span className="orders-stat-icon">🙋</span>
          <div>
            <div className="orders-stat-val">{new Set(unpaid.map((o) => o.name.trim().toLowerCase())).size}</div>
            <div className="orders-stat-label">Customers</div>
          </div>
        </div>
        <div className="orders-stat-chip orders-stat-chip-total">
          <span className="orders-stat-icon">💰</span>
          <div>
            <div className="orders-stat-val">{peso(totalUnpaid)}</div>
            <div className="orders-stat-label">Total Owed</div>
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
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Unpaid</th>
              <th>Customer Name</th>
              <th>Amount</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {unpaid.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: "48px 20px" }}>
                  <div style={{ fontSize: 34, opacity: 0.3, marginBottom: 8 }}>🎉</div>
                  <div style={{ color: "var(--text3)", fontSize: 13 }}>No unpaid customers. Everyone's settled up!</div>
                </td>
              </tr>
            ) : (
              unpaid.map((o) => {
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
                      <span className="pay-badge pay-badge-unpaid">⏳ Unpaid</span>
                    </td>
                    <td>
                      <div className="customer-cell">
                        <span className="customer-avatar">{initials}</span>
                        <div>
                          <div>{o.name}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text3)" }} className="mono">
                            #{getDailyOrderNo(o, orders)} · {o.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="mono" style={{ color: "var(--yellow)", fontWeight: 700 }}>
                      {peso(o.total)}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      {new Date(o.time).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="row-actions">
                      <select
                        className="pay-mark-select"
                        value=""
                        onChange={(e) => {
                          if (e.target.value) markOrderPaid(o.id, e.target.value as any);
                        }}
                      >
                        <option value="">✓ Mark as Paid…</option>
                        <option value="cash">💵 Cash</option>
                        <option value="gcash">📱 GCash</option>
                        <option value="maya">💜 Maya</option>
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
