"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { CartLine, isExtraLine, isFeeLine, isLoadLine, Order, SERVICES, Service } from "@/lib/types";
import { peso } from "@/lib/format";

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  d.setSeconds(0, 0);
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

const ADDON_SERVICES = SERVICES.filter((s) => s.cat === "addon");

export default function EditOrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const { updateOrderDetails } = useApp();
  const [name, setName] = useState(order.name);
  const [phone, setPhone] = useState(order.phone || "");
  const [addr, setAddr] = useState(order.addr || "");
  const [type, setType] = useState<"walkin" | "delivery">(order.type);
  const [pickup, setPickup] = useState(toDatetimeLocal(order.pickup));
  const [nameErr, setNameErr] = useState(false);
  const [loads, setLoads] = useState<CartLine[]>(order.items.filter(isLoadLine));
  const [extras, setExtras] = useState<CartLine[]>(order.items.filter(isExtraLine));
  const [addonPick, setAddonPick] = useState("");
  const [feeLabel, setFeeLabel] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const mouseDownOnOverlay = useRef(false);

  useEffect(() => {
    setName(order.name);
    setPhone(order.phone || "");
    setAddr(order.addr || "");
    setType(order.type);
    setPickup(toDatetimeLocal(order.pickup));
    setLoads(order.items.filter(isLoadLine));
    setExtras(order.items.filter(isExtraLine));
  }, [order]);

  function changeLoadQty(id: string, delta: number) {
    setLoads((prev) => prev.map((l) => (l.service.id === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l)).filter((l) => l.qty > 0));
  }

  function changeExtraQty(id: string, delta: number) {
    setExtras((prev) => prev.map((l) => (l.service.id === id ? { ...l, qty: Math.max(0, l.qty + delta) } : l)).filter((l) => l.qty > 0));
  }

  function removeExtra(id: string) {
    setExtras((prev) => prev.filter((l) => l.service.id !== id));
  }

  function updateExtraPrice(id: string, price: number) {
    setExtras((prev) => prev.map((l) => (l.service.id === id ? { ...l, service: { ...l.service, price: Math.max(0, price) } } : l)));
  }

  function updateExtraLabel(id: string, label: string) {
    setExtras((prev) => prev.map((l) => (l.service.id === id ? { ...l, service: { ...l.service, name: label } } : l)));
  }

  function addAddon() {
    if (!addonPick) return;
    const svc = ADDON_SERVICES.find((s) => s.id === addonPick);
    if (!svc) return;
    setExtras((prev) => {
      const existing = prev.find((l) => l.service.id === svc.id);
      if (existing) return prev.map((l) => (l.service.id === svc.id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { service: svc, qty: 1 }];
    });
    setAddonPick("");
  }

  function addFee() {
    const n = parseFloat(feeAmount);
    if (!n || n <= 0) return;
    const svc: Service = {
      id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cat: "addon",
      icon: "➕",
      name: feeLabel.trim() || "Additional Fee",
      desc: "Manual entry",
      price: n,
    };
    setExtras((prev) => [...prev, { service: svc, qty: 1 }]);
    setFeeLabel("");
    setFeeAmount("");
  }

  const loadsTotal = loads.reduce((s, c) => s + c.qty, 0);
  const extrasTotal = extras.reduce((s, c) => s + c.service.price * c.qty, 0);
  const grandTotal = loads.reduce((s, c) => s + c.service.price * c.qty, 0) + extrasTotal;
  const availableAddons = ADDON_SERVICES.filter((s) => !extras.some((e) => e.service.id === s.id));

  function handleSave() {
    if (!name.trim()) {
      setNameErr(true);
      setTimeout(() => setNameErr(false), 2000);
      return;
    }
    updateOrderDetails(order.id, {
      name: name.trim(),
      phone: phone.trim(),
      addr: addr.trim(),
      type,
      pickup,
      items: [...loads, ...extras],
    });
    onClose();
  }

  return (
    <div
      className="modal-overlay show"
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnOverlay.current) onClose();
        mouseDownOnOverlay.current = false;
      }}
    >
      <div className="modal modal-edit-order">
        <div className="forgot-header">
          <div className="forgot-icon">✏️</div>
          <div className="forgot-title">Edit Order</div>
          <div className="forgot-sub">{order.id}</div>
        </div>

        <div className="field-group">
          <label className="field-label">Customer name</label>
          <input
            className="field-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={nameErr ? { borderColor: "var(--red)" } : undefined}
          />
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Phone (optional)</label>
            <input className="field-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">Order type</label>
            <select className="field-input" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="walkin">🚶 Walk-in</option>
              <option value="delivery">🛵 Delivery</option>
            </select>
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Address (optional)</label>
          <input className="field-input" type="text" value={addr} onChange={(e) => setAddr(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Pickup date &amp; time</label>
          <input className="field-input" type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} />
        </div>

        <div className="field-group">
          <label className="field-label">
            Loads (Wash &amp; Dry) — {loadsTotal} load{loadsTotal !== 1 ? "s" : ""}
          </label>
          <div className="edit-loads-list">
            {loads.length === 0 ? (
              <div className="edit-loads-empty">No wash/dry loads on this order.</div>
            ) : (
              loads.map((l) => (
                <div className="edit-loads-row" key={l.service.id}>
                  <span className="edit-loads-icon">{l.service.icon}</span>
                  <div className="edit-loads-info">
                    <div className="edit-loads-name">{l.service.name}</div>
                    <div className="edit-loads-price">{peso(l.service.price)} each</div>
                  </div>
                  <div className="edit-loads-controls">
                    <button type="button" className="qty-btn" onClick={() => changeLoadQty(l.service.id, -1)}>
                      −
                    </button>
                    <span className="qty-display">{l.qty}</span>
                    <button type="button" className="qty-btn" onClick={() => changeLoadQty(l.service.id, 1)}>
                      +
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Add-ons &amp; Fees — {peso(extrasTotal)}</label>
          <div className="edit-loads-list">
            {extras.length === 0 ? (
              <div className="edit-loads-empty">No add-ons or extra fees on this order.</div>
            ) : (
              extras.map((l) => {
                const editableFee = isFeeLine(l);
                return (
                  <div className="edit-extra-row" key={l.service.id}>
                    <span className="edit-loads-icon">{l.service.icon}</span>
                    <div className="edit-loads-info">
                      {editableFee ? (
                        <input
                          className="edit-extra-name-input"
                          type="text"
                          value={l.service.name}
                          onChange={(e) => updateExtraLabel(l.service.id, e.target.value)}
                        />
                      ) : (
                        <div className="edit-loads-name">{l.service.name}</div>
                      )}
                      <div className="edit-extra-price-row">
                        {editableFee ? (
                          <div className="edit-extra-price-input-wrap">
                            <span>₱</span>
                            <input
                              className="edit-extra-price-input"
                              type="number"
                              min={0}
                              value={l.service.price}
                              onChange={(e) => updateExtraPrice(l.service.id, parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        ) : (
                          <div className="edit-loads-price">{peso(l.service.price)} each</div>
                        )}
                      </div>
                    </div>
                    <div className="edit-loads-controls">
                      <button type="button" className="qty-btn" onClick={() => changeExtraQty(l.service.id, -1)}>
                        −
                      </button>
                      <span className="qty-display">{l.qty}</span>
                      <button type="button" className="qty-btn" onClick={() => changeExtraQty(l.service.id, 1)}>
                        +
                      </button>
                      <button type="button" className="extra-remove-btn" onClick={() => removeExtra(l.service.id)} title="Remove">
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="edit-extra-add-row">
            <select className="field-input edit-extra-add-select" value={addonPick} onChange={(e) => setAddonPick(e.target.value)}>
              <option value="">+ Add existing add-on…</option>
              {availableAddons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.icon} {s.name} — {peso(s.price)}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addAddon} disabled={!addonPick}>
              Add
            </button>
          </div>

          <div className="edit-extra-fee-row">
            <input
              className="field-input edit-extra-fee-label"
              type="text"
              placeholder="Fee label (optional)"
              value={feeLabel}
              onChange={(e) => setFeeLabel(e.target.value)}
            />
            <div className="fee-input-row" style={{ flex: "0 0 auto" }}>
              <span className="fee-input-peso">₱</span>
              <input
                className="fee-input edit-extra-fee-amount"
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="Amount"
                value={feeAmount}
                onChange={(e) => setFeeAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addFee()}
              />
            </div>
            <button type="button" className="fee-add-btn" onClick={addFee} disabled={!feeAmount || parseFloat(feeAmount) <= 0}>
              + Add fee
            </button>
          </div>
        </div>

        <div className="edit-order-total">
          <span>New order total</span>
          <span className="edit-order-total-val">{peso(grandTotal)}</span>
        </div>

        <div className="modal-actions" style={{ marginTop: 6 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
