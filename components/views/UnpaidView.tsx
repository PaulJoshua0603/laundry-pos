"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { peso } from "@/lib/format";
import { buildDailyOrderNoMap, getBalance } from "@/lib/types";

const PAY_METHODS = [
  { id: "cash", icon: "💵", label: "Cash" },
  { id: "gcash", icon: "📱", label: "GCash" },
  { id: "maya", icon: "💜", label: "Maya" },
] as const;

/**
 * Takes a payment against one order.
 *
 * The separate "Settle Full…" dropdown is gone. Leaving the box empty pays
 * the whole balance — the overwhelmingly common case, now one click — and
 * typing a figure pays that instead. The button states which of the two it
 * is about to do and for how much, so there is no dropdown to read and no
 * way to be unsure what pressing it costs the customer.
 */
function PartialPayRow({ orderId, balance }: { orderId: string; balance: number }) {
  const { addPartialPayment } = useApp();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "gcash" | "maya">("cash");

  const typed = parseFloat(amount);
  const hasTyped = amount.trim() !== "" && Number.isFinite(typed) && typed > 0;
  // Never take more than is owed, whatever is typed.
  const willPay = hasTyped ? Math.min(typed, balance) : balance;
  const settlesInFull = willPay >= balance;

  function handleAdd() {
    if (willPay <= 0) return;
    addPartialPayment(orderId, willPay, method);
    setAmount("");
  }

  return (
    <div className="paytake">
      <div className="paytake-amount">
        <span className="paytake-peso">₱</span>
        <input
          className="paytake-input"
          type="number"
          inputMode="decimal"
          min={0}
          max={balance}
          placeholder={String(balance)}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          aria-label={`Amount to pay, up to ${balance}`}
        />
      </div>

      {/* Segmented buttons rather than a select: three options, always worth
          seeing, and one tap instead of open-scan-choose. */}
      <div className="paytake-methods" role="group" aria-label="Payment method">
        {PAY_METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`paytake-method${method === m.id ? " active" : ""}`}
            onClick={() => setMethod(m.id)}
            title={m.label}
            aria-pressed={method === m.id}
          >
            <span aria-hidden="true">{m.icon}</span>
            <span className="paytake-method-label">{m.label}</span>
          </button>
        ))}
      </div>

      <button
        className={`paytake-go${settlesInFull ? " full" : ""}`}
        onClick={handleAdd}
        disabled={willPay <= 0}
        title={settlesInFull ? "Pay off the whole balance" : "Record a part payment"}
      >
        {settlesInFull ? "Settle" : "Add"} {peso(willPay)}
      </button>
    </div>
  );
}

export default function UnpaidView() {
  const { orders, switchView } = useApp();
  const [q, setQ] = useState("");
  // One pass instead of a filter+sort of the whole list per rendered row.
  const dailyNos = useMemo(() => buildDailyOrderNoMap(orders), [orders]);

  const unpaid = orders
    .filter((o) => !o.paid && o.status !== "cancelled")
    .filter((o) => o.name.toLowerCase().includes(q.toLowerCase()) || o.id.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const totalUnpaid = unpaid.reduce((s, o) => s + getBalance(o), 0);
  const partialCount = unpaid.filter((o) => (o.amountPaid || 0) > 0).length;
  const collectedSoFar = unpaid.reduce((s, o) => s + (o.amountPaid || 0), 0);

  // Age drives collection priority far more than order sequence does, so it is
  // shown per row and used to flag the ones going stale.
  const daysOld = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  const staleCount = unpaid.filter((o) => daysOld(o.time) >= 7).length;
  const oldest = unpaid.reduce((m, o) => Math.max(m, daysOld(o.time)), 0);

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

      <div className="kpi-row">
        <div className="kpi-card kpi-card-hero">
          <div className="kpi-label">Total still owed</div>
          <div className="kpi-valrow">
            <div className="kpi-val" style={{ color: "var(--yellow)" }}>
              {peso(totalUnpaid)}
            </div>
            {staleCount > 0 && <span className="kpi-delta down">{staleCount} over 7 days</span>}
          </div>
          <div className="kpi-sub">
            across {unpaid.length} order{unpaid.length !== 1 ? "s" : ""}
            {oldest > 0 ? ` · oldest ${oldest} day${oldest !== 1 ? "s" : ""}` : ""}
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Customers</div>
          <div className="kpi-val">{new Set(unpaid.map((o) => o.name.trim().toLowerCase())).size}</div>
          <div className="kpi-sub">with a balance</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Part-paid</div>
          <div className="kpi-val">{partialCount}</div>
          <div className="kpi-sub">{peso(collectedSoFar)} already in</div>
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
              <th>Total</th>
              <th>Paid So Far</th>
              <th>Balance</th>
              <th>Date</th>
              <th>Record Payment</th>
            </tr>
          </thead>
          <tbody>
            {unpaid.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "48px 20px" }}>
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
                const balance = getBalance(o);
                const age = daysOld(o.time);
                const paidPct = o.total > 0 ? Math.round(((o.amountPaid || 0) / o.total) * 100) : 0;
                return (
                  <tr key={o.id} className={age >= 7 ? "is-stale" : undefined}>
                    <td>
                      <span className="pay-badge pay-badge-unpaid">{o.amountPaid > 0 ? `◐ ${paidPct}% paid` : "⏳ Unpaid"}</span>
                      {age >= 7 && <div className="age-flag">{age}d old</div>}
                    </td>
                    <td>
                      <div className="customer-cell">
                        <span className="customer-avatar">{initials}</span>
                        <div>
                          <div>{o.name}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text3)" }} className="mono">
                            #{dailyNos.get(o.id) ?? 0} · {o.id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="mono" style={{ color: "var(--text2)" }}>
                      {peso(o.total)}
                    </td>
                    {/* The placeholder dash was painted green, the colour this
                        table uses for money received — so "nothing paid yet"
                        read at a glance as a payment. Only a real amount is green. */}
                    <td className="mono" style={{ color: o.amountPaid > 0 ? "var(--green)" : "var(--text3)" }}>
                      {o.amountPaid > 0 ? peso(o.amountPaid) : "—"}
                    </td>
                    <td className="mono" style={{ color: "var(--yellow)", fontWeight: 700 }}>
                      {peso(balance)}
                    </td>
                    <td className="mono" style={{ fontSize: 11 }}>
                      <div>{new Date(o.time).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</div>
                      <div style={{ color: "var(--text3)", fontSize: 10 }}>
                        {age === 0 ? "today" : age === 1 ? "yesterday" : `${age} days ago`}
                      </div>
                    </td>
                    <td>
                      <PartialPayRow orderId={o.id} balance={balance} />
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
