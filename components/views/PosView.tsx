"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { SERVICES } from "@/lib/types";
import { peso } from "@/lib/format";

const CATS = [
  { id: "all", label: "All" },
  { id: "wash", label: "🫧 Wash" },
  { id: "dry", label: "☀️ Dry" },
  { id: "addon", label: "➕ Add-ons" },
];

const QUICK_AMOUNTS = [10, 20, 30, 40, 50];

function AdditionalFeeCard() {
  const { addCustomFee } = useApp();
  const [amount, setAmount] = useState("");

  function addAmount(n: number) {
    addCustomFee(n);
  }

  function addTyped() {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    addCustomFee(n);
    setAmount("");
  }

  return (
    <div className="fee-card">
      <div className="fee-card-head">
        <span className="fee-card-icon">🧮</span>
        <div>
          <div className="fee-card-title">Additional Fee</div>
          <div className="fee-card-sub">Manual amount — stains, rush, extra kg, etc.</div>
        </div>
      </div>
      <div className="fee-quick-row">
        {QUICK_AMOUNTS.map((n) => (
          <button key={n} type="button" className="fee-quick-btn" onClick={() => addAmount(n)}>
            ₱{n}
          </button>
        ))}
      </div>
      <div className="fee-input-row">
        <span className="fee-input-peso">₱</span>
        <input
          className="fee-input"
          type="number"
          inputMode="decimal"
          min={0}
          placeholder="Custom amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTyped()}
        />
        <button type="button" className="fee-add-btn" onClick={addTyped} disabled={!amount || parseFloat(amount) <= 0}>
          + Add
        </button>
      </div>
    </div>
  );
}

export default function PosView() {
  const { cart, addToCart } = useApp();
  const [cat, setCat] = useState("all");

  const filtered = cat === "all" ? SERVICES : SERVICES.filter((s) => s.cat === cat);

  return (
    <div className="view active" id="view-pos">
      <div className="section-head">
        <div className="section-title-group">
          <div className="section-eyebrow">Point of Sales</div>
          <div className="section-title">New Order</div>
        </div>
      </div>

      <div className="pills" id="categoryPills">
        {CATS.map((c) => (
          <div key={c.id} className={`pill${cat === c.id ? " active" : ""}`} onClick={() => setCat(c.id)}>
            {c.label}
          </div>
        ))}
      </div>

      {(cat === "all" || cat === "wash") && <AdditionalFeeCard />}

      <div className="product-grid" id="productGrid">
        {filtered.map((s) => {
          const inCart = cart.find((c) => c.service.id === s.id);
          const qty = inCart ? inCart.qty : 0;
          return (
            <div key={s.id} className={`product-card${qty ? " in-cart" : ""}`} onClick={() => addToCart(s.id)} id={`pc-${s.id}`}>
              {qty > 0 && <div className="product-qty-badge">{qty}</div>}
              <div className="product-icon">{s.icon}</div>
              <div className="product-name">{s.name}</div>
              <div className="product-desc">{s.desc}</div>
              <div className="product-price">{peso(s.price)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
