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
  const [amountPaidInput, setAmountPaidInput] = useState("");
  const [nameErr, setNameErr] = useState(false);

  function resetCustomerFields() {
    setName("");
    setPhone("");
    setAddr("");
    setType("walkin");
    setPickup(nowForDatetimeLocal());
    setAmountPaidInput("");
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
    const typedAmount = amountPaidInput.trim() === "" ? undefined : parseFloat(amountPaidInput);
    const order = checkout({ name: name.trim(), phone: phone.trim(), addr: addr.trim(), type, pickup, amountPaid: typedAmount });
    if (order) {
      showReceipt(order);
      resetCustomerFields();
    }
  }

  // Maya was removed from the till at the owner's request — the shop takes
  // Cash and GCash only. "maya" stays in the PaymentMethod type and in every
  // read path so historical orders already recorded against it still display
  // and report correctly; it simply can't be chosen for a new order.
  const payMethods: { id: PaymentMethod; icon: string; label: string; extraClass?: string }[] = [
    { id: "cash", icon: "💵", label: "Cash" },
    { id: "gcash", icon: "📱", label: "GCash" },
    { id: "later", icon: "🕒", label: "Pay Later", extraClass: "pay-btn-later" },
  ];

  // Parsed once: `received` is what the customer handed over, `changeDue` is
  // anything above the total. checkout() still clamps the recorded amount to
  // the total, so tendering more never inflates the sale.
  const receivedRaw = parseFloat(amountPaidInput);
  const received = amountPaidInput.trim() !== "" && !Number.isNaN(receivedRaw) ? receivedRaw : null;
  const changeDue = received !== null ? Math.max(0, received - cartTotal) : 0;

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

      {/* Phone and Address were removed from the till at the owner's request —
          on a 1366x768 screen they cost two rows that the item list needs, and
          they were optional in practice. Both fields still exist on the order
          and can be filled in from Edit Order when a delivery needs them, so
          nothing is lost from the data model. */}
      <div className="customer-strip">
        <div className="customer-row">
          {/* Uppercased as it is typed rather than rejected, so lower-case
              input simply becomes upper-case instead of silently doing
              nothing. Names are stored upper-case, which also keeps them
              consistent with the receipt and the basket tag. */}
          <input
            className="customer-field"
            type="text"
            placeholder="CUSTOMER NAME *"
            value={name}
            onChange={(e) => setName(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            spellCheck={false}
            style={nameErr ? { borderColor: "var(--red)" } : undefined}
            required
          />
        </div>
        {/* The Walk-in / Delivery selector was removed at the owner's request —
            every order at this till is a walk-in. `type` still defaults to
            "walkin" on the order and remains editable in Edit Order, so
            delivery orders can still be recorded when they happen. */}
        <div className="customer-row">
          <div className="pickup-field-wrap">
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
              <div className="cart-item-icon">{c.service.icon}</div>
              <div className="cart-item-info">
                <div className="cart-item-name">{c.service.name}</div>
                <div className="cart-item-price">{peso(c.service.price)} each</div>
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
              <div className="cart-item-end">
                <span className="cart-item-total">{peso(c.service.price * c.qty)}</span>
                <button className="cart-item-del" onClick={() => removeFromCart(c.service.id)}>
                  ✕
                </button>
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
        {/* Replaces the old "Discount —" row, which was a permanent em-dash
            that earned nothing. Change is derived from the cash-received
            field below: anything tendered above the total is the customer's
            change. Purely a till aid — the order still records at most the
            total as paid, never the tendered amount. */}
        <div className="cart-line">
          <span className="cart-line-label">Change</span>
          <span className="cart-line-val" style={{ color: changeDue > 0 ? "var(--green)" : undefined }}>
            {changeDue > 0 ? peso(changeDue) : "—"}
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

        <div className="partial-pay-field">
          {/* One field for both cases: under the total it is a part payment,
              over it is cash tendered and the difference is the change. The
              `max` cap was removed so a larger tendered amount can be typed. */}
          <label className="field-label" htmlFor="amountPaidInput">
            Cash received <span className="field-label-optional">(optional — for part payment or change)</span>
          </label>
          <div className="partial-pay-input-wrap">
            <span className="partial-pay-peso">₱</span>
            <input
              id="amountPaidInput"
              className="partial-pay-input"
              type="number"
              inputMode="decimal"
              min={0}
              placeholder={`e.g. ${cartTotal || 0}`}
              value={amountPaidInput}
              onChange={(e) => setAmountPaidInput(e.target.value)}
            />
          </div>
          {received !== null && (
            <div className={`partial-pay-preview${received >= cartTotal ? " full" : ""}`}>
              {changeDue > 0
                ? `✓ Fully paid · Change ${peso(changeDue)}`
                : received >= cartTotal
                  ? "✓ Fully paid · No change"
                  : `Balance due: ${peso(cartTotal - received)}`}
            </div>
          )}
        </div>

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
