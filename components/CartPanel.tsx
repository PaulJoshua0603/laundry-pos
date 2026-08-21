"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { peso } from "@/lib/format";
import { PaymentMethod } from "@/lib/types";

/** Local "YYYY-MM-DDTHH:mm" string for right now, for the datetime-local input. */
function nowForDatetimeLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export default function CartPanel({ mobileOpen, onCartClose }: { mobileOpen: boolean; onCartClose: () => void }) {
  const { cart, changeQty, removeFromCart, clearCart, cartTotal, payment, selectPayment, paySettings, checkout, showToast, showReceipt } = useApp();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState("");
  const [type, setType] = useState<"walkin" | "delivery">("walkin");
  const [pickup, setPickup] = useState(nowForDatetimeLocal());
  const [nameErr, setNameErr] = useState(false);

  function resetCustomerFields() {
    setName("");
    setPhone("");
    setAddr("");
    setType("walkin");
    setPickup(nowForDatetimeLocal());
  }

  function handleClear() {
    clearCart();
    resetCustomerFields();
  }

  function handleCheckout() {
    if (cart.length === 0) return;
    if (!name.trim()) {
      setNameErr(true);
      showToast("⚠️ Customer name is required.", "error");
      setTimeout(() => setNameErr(false), 2000);
      return;
    }
    const order = checkout({ name: name.trim(), phone: phone.trim(), addr: addr.trim(), type, pickup });
    if (order) {
      showReceipt(order);
      resetCustomerFields();
    }
  }

  const payMethods: { id: PaymentMethod; icon: string; label: string; extraClass?: string }[] = [
    { id: "cash", icon: "💵", label: "Cash" },
    { id: "gcash", icon: "📱", label: "GCash" },
    { id: "maya", icon: "💜", label: "Maya" },
    { id: "later", icon: "🕒", label: "Pay Later", extraClass: "pay-btn-later" },
  ];

  const showQr = payment === "gcash" || payment === "maya";
  const info = showQr ? paySettings[payment as "gcash" | "maya"] : null;

  return (
    <aside className={`cart${mobileOpen ? " mobile-open" : ""}`} id="cartPanel">
      <div className="cart-header">
        <div className="cart-title">Current Order</div>
        <div className="cart-count" id="cartCountBadge">
          {cart.reduce((n, c) => n + c.qty, 0)}
        </div>
      </div>

      <div className="customer-strip">
        <div className="customer-row">
          <input
            className="customer-field"
            type="text"
            placeholder="Customer name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={nameErr ? { borderColor: "var(--red)" } : undefined}
            required
          />
          <input
            className="customer-field"
            type="tel"
            placeholder="Phone (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <input className="customer-field" type="text" placeholder="Address (optional)" value={addr} onChange={(e) => setAddr(e.target.value)} />
        <div className="customer-row">
          <select className="customer-field" value={type} onChange={(e) => setType(e.target.value as any)}>
            <option value="walkin">🚶 Walk-in</option>
            <option value="delivery">🛵 Delivery</option>
          </select>
        </div>
        <div className="customer-row">
          <div className="pickup-field-wrap pickup-field-wrap-full">
            <input
              className={`customer-field pickup-field${pickup ? " has-value" : ""}`}
              type="datetime-local"
              title="Pickup time (optional)"
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
            />
            {!pickup && <span className="pickup-field-label">📅 Pick date &amp; time</span>}
          </div>
        </div>
      </div>

      <div className="cart-items" id="cartItems">
        {cart.length === 0 ? (
          <div className="cart-empty" id="cartEmpty">
            <div className="cart-empty-icon">🧺</div>
            <div className="cart-empty-text">No items yet. Tap a service.</div>
          </div>
        ) : (
          cart.map((c) => (
            <div className="cart-item" key={c.service.id}>
              <div style={{ fontSize: 20, marginTop: 1 }}>{c.service.icon}</div>
              <div className="cart-item-info">
                <div className="cart-item-name">{c.service.name}</div>
                <div className="cart-item-price">
                  {c.service.desc} · {peso(c.service.price)} each
                </div>
                <div className="cart-item-controls">
                  <button className="qty-btn" onClick={() => changeQty(c.service.id, -1)}>
                    −
                  </button>
                  <span className="qty-display">{c.qty}</span>
                  <button className="qty-btn" onClick={() => changeQty(c.service.id, 1)}>
                    +
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                <button className="cart-item-del" onClick={() => removeFromCart(c.service.id)}>
                  ✕
                </button>
                <span className="cart-item-total">{peso(c.service.price * c.qty)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cart-footer">
        <div className="cart-line">
          <span className="cart-line-label">Subtotal</span>
          <span className="cart-line-val">{peso(cartTotal)}</span>
        </div>
        <div className="cart-line">
          <span className="cart-line-label">Discount</span>
          <span className="cart-line-val" style={{ color: "var(--green)" }}>
            —
          </span>
        </div>
        <div className="cart-divider" />
        <div className="cart-line">
          <span className="cart-total-label">Total</span>
          <span className="cart-total-val">{peso(cartTotal)}</span>
        </div>

        <div className="pay-methods">
          {payMethods.map((p) => (
            <div key={p.id} className={`pay-btn${p.extraClass ? " " + p.extraClass : ""}${payment === p.id ? " active" : ""}`} onClick={() => selectPayment(p.id)}>
              {p.icon} {p.label}
            </div>
          ))}
        </div>

        {showQr && (
          <div className="qr-preview" style={{ display: "flex" }}>
            {info?.qr || info?.number ? (
              <>
                {info.qr ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="qr-preview-img" src={info.qr} alt={`${payment} QR`} />
                ) : (
                  <div className="qr-preview-img" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
                    {payment === "gcash" ? "📱" : "💜"}
                  </div>
                )}
                <div className="qr-preview-info">
                  <div className="qr-preview-title">
                    {payment === "gcash" ? "📱" : "💜"} Show this {payment === "gcash" ? "GCash" : "Maya"} code to the customer
                  </div>
                  <div className="qr-preview-sub">{info.number || "No account number set yet"}</div>
                </div>
              </>
            ) : (
              <div className="qr-preview-empty">No {payment === "gcash" ? "GCash" : "Maya"} QR set up yet. Add one in Payment Methods so it shows here at checkout.</div>
            )}
          </div>
        )}
        {payment === "later" && (
          <div className="later-note" style={{ display: "block" }}>
            This order will be marked <b>Unpaid</b>. Collect payment anytime from the Orders tab.
          </div>
        )}

        <button className="btn-checkout" disabled={cart.length === 0} onClick={handleCheckout}>
          Charge {peso(cartTotal)}
        </button>
        <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", color: "var(--red)", borderColor: "var(--red-dim)" }} onClick={handleClear}>
          Clear Order
        </button>
      </div>
    </aside>
  );
}
