"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { getBalance, ORDER_TYPES, STATUS_MAP, getDailyOrderNo } from "@/lib/types";
import { peso } from "@/lib/format";

// The "POS58 Printer" Windows driver ships with a fixed list of custom
// paper lengths (48mm × 210/297/600/1200mm — visible in the system print
// dialog). We snap our computed receipt height up to the smallest one
// that fits the content, so the dialog auto-selects the right length
// instead of defaulting to 210mm and clipping longer orders.
const POS58_PAGE_LENGTHS_MM = [210, 297, 600, 1200];

export default function ReceiptModal() {
  const { receiptOrder, closeReceipt, printerMm, setPrinterWidth, paySettings, session, orders } = useApp();
  const contentRef = useRef<HTMLDivElement>(null);
  const [autoHeightMm, setAutoHeightMm] = useState<number | null>(null);

  // Printable width is limited by the PRINT HEAD, not the paper. A 58mm-class
  // printer (PR21 / POS58 / ZJ-58) has a 384-dot head at 203dpi = 48mm, so
  // 48mm is the ceiling no matter whether 57mm or 58mm paper is loaded.
  // The old table claimed 54mm for the 57mm setting, which is wider than the
  // head can reach — the right-hand column was being clipped off the paper.
  const printableMm = printerMm === 80 ? 72 : 48;
  const isFixedTag = printerMm === 57;

  // Measure the actual rendered receipt (header + items + basket tag) and
  // convert it to millimeters so @page size matches the content exactly —
  // previously this was hardcoded to "auto", which isn't a valid CSS page
  // size, so the browser fell back to a default/last-used paper and either
  // clipped long orders or left long blank tails on short ones.
  //
  // NOTE: this hook must run on every render (it's above the early
  // `!receiptOrder` return below) so the hook count stays stable between
  // renders — bailing out early inside the effect body instead.
  useLayoutEffect(() => {
    if (!receiptOrder || isFixedTag || !contentRef.current) {
      setAutoHeightMm(null);
      return;
    }
    const measure = () => {
      const el = contentRef.current;
      if (!el) return;
      const pxToMm = 25.4 / 96;
      const bufferMm = 6; // room for the cut line + a little breathing space
      const rawMm = Math.ceil(el.scrollHeight * pxToMm) + bufferMm;
      if (printerMm === 58) {
        const bucket = POS58_PAGE_LENGTHS_MM.find((mm) => mm >= rawMm) ?? rawMm;
        setAutoHeightMm(bucket);
      } else {
        setAutoHeightMm(Math.max(80, rawMm));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [isFixedTag, printerMm, receiptOrder, orders]);

  if (!receiptOrder) return null;
  const order = receiptOrder;
  const dailyNo = getDailyOrderNo(order, orders);

  const shopName = order.shop || session?.business || "WashHub Laundry";
  const payLabel = { cash: "Cash", gcash: "GCash", maya: "Maya", later: "Pay Later" }[order.payment] || order.payment;
  const paidLabel = order.paidMethod ? { cash: "Cash", gcash: "GCash", maya: "Maya" }[order.paidMethod] : "";
  const typeInfo = ORDER_TYPES[order.type] || ORDER_TYPES.walkin;
  const statusInfo = STATUS_MAP[order.status];
  const payRefLine =
    order.payment !== "cash" && order.payment !== "later" && paySettings[order.payment as "gcash" | "maya"]?.number
      ? paySettings[order.payment as "gcash" | "maya"].number
      : null;


  return (
    <div className="modal-overlay show" id="receiptModal" onClick={(e) => e.target === e.currentTarget && closeReceipt()}>
      <div
        className="modal"
        id="receiptModalInner"
        style={{
          ["--receipt-w" as any]: `${printableMm}mm`,
          ["--receipt-h" as any]: isFixedTag ? "50mm" : autoHeightMm ? `${autoHeightMm}mm` : "297mm",
        }}
      >
        {/* Equal-width segments instead of pills that wrapped onto a second
            row at odd widths. Each carries its own sub-label so the choice
            doesn't need a paragraph underneath to explain it. */}
        <div className="paper-picker">
          <div className="paper-picker-label">Printer paper</div>
          <div className="paper-seg">
            <button
              className={`paper-opt${printerMm === 58 ? " active" : ""}`}
              onClick={() => setPrinterWidth(58, 210)}
            >
              <span className="paper-opt-name">57 / 58mm</span>
              <span className="paper-opt-sub">roll · 48mm print</span>
            </button>
            <button className={`paper-opt${printerMm === 80 ? " active" : ""}`} onClick={() => setPrinterWidth(80)}>
              <span className="paper-opt-name">80mm</span>
              <span className="paper-opt-sub">roll · 72mm print</span>
            </button>
            <button
              className={`paper-opt${printerMm === 57 ? " active" : ""}`}
              onClick={() => setPrinterWidth(57, 50)}
            >
              <span className="paper-opt-name">Pre-cut</span>
              <span className="paper-opt-sub">57×50mm label</span>
            </button>
          </div>
        </div>
        {/* The page height the app asks for must match the "Paper size" chosen
            in the Windows print dialog. They agree at 210mm for a normal
            receipt, but a long order can push past it — and then Windows
            splits the receipt across two pages instead of printing one longer
            one. Say so rather than letting it happen silently. */}
        {!isFixedTag && printerMm === 58 && autoHeightMm !== null && autoHeightMm > 210 && (
          <div className="printer-size-warn">
            ⚠️ This order is long. In the print dialog set <b>Paper size</b> to{" "}
            <b>Printer 58 (48mm×{autoHeightMm}mm)</b>, otherwise it will be split across two pages.
          </div>
        )}

        {/* The long explainer that lived here is now carried by the segment
            sub-labels. Only the genuinely risky case still warrants words. */}
        {isFixedTag && (
          <div className="printer-size-warn">
            ⚠️ Only for die-cut 50mm label sheets. A roll labelled <b>57×50</b> is 57mm wide × 50mm diameter —
            continuous paper — and should use <b>57 / 58mm</b>.
          </div>
        )}

        {isFixedTag ? (
          <div className="fixed-tag" id="fixedTagBody">
            {/* 57x50mm pre-cut stock: same stripped-back treatment as the roll
                receipt — the name leads, the shop header and status rows are
                gone. There is only 50mm of length here, so every removed line
                buys size for the name. */}
            <div className="fixed-tag-name">{order.name}</div>
            <div className="fixed-tag-row">
              <span>{new Date(order.time).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
              <span>{new Date(order.time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <hr className="fixed-tag-rule dash" />
            {order.items.map((c, i) => (
              <div className="fixed-tag-row" key={i}>
                <span>
                  {c.service.name} ×{c.qty}
                </span>
                <span>{peso(c.service.price * c.qty)}</span>
              </div>
            ))}
            <hr className="fixed-tag-rule thick" />
            <div className="fixed-tag-row fixed-tag-total">
              <span>TOTAL</span>
              <span>{peso(order.total)}</span>
            </div>
            <div className="fixed-tag-row" style={{ marginTop: 2 }}>
              <span>
                {order.paid
                  ? `✓ PAID · ${(paidLabel || payLabel || "").toString().toUpperCase()}`
                  : order.amountPaid > 0
                    ? `◐ PARTIAL · ${peso(order.amountPaid)} PAID`
                    : "⏳ UNPAID"}
              </span>
            </div>
            {!order.paid && (
              <div className="fixed-tag-row">
                <span>Balance</span>
                <span>{peso(getBalance(order))}</span>
              </div>
            )}
            <div className="fixed-tag-footer">Thank you for choosing us!</div>
          </div>
        ) : (
          <div ref={contentRef}>
            <div className="receipt" id="receiptBody">
              {/* Deliberately minimal: the shop header, "Official Receipt"
                  banner, status/time/pickup rows and the thank-you footer were
                  all removed at the owner's request. On a 48mm roll every line
                  is paper, and the only things staff and customers actually
                  read are the name, what was charged, and the total. */}
              <div className="receipt-customer-block">
                <div className="receipt-customer-name">{order.name}</div>
              </div>

              <hr className="receipt-divider" />
              <div className="receipt-row customer">
                <span>Date</span>
                <span>
                  {new Date(order.time).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <hr className="receipt-divider" />

              {/* Each line shows qty × unit price under the name, so a customer
                  can check the arithmetic the way they can on a cafe receipt. */}
              {order.items.map((c, i) => (
                <div className="receipt-item" key={i}>
                  <div className="receipt-item-top">
                    <span className="receipt-item-name">
                      <span className="receipt-icon">{c.service.icon} </span>
                      {c.service.name}
                    </span>
                    <span className="receipt-item-amt">{peso(c.service.price * c.qty)}</span>
                  </div>
                  <div className="receipt-item-sub">
                    {c.qty} × {peso(c.service.price)}
                  </div>
                </div>
              ))}
              <hr className="receipt-divider" />
              <div className="receipt-row total">
                <span>TOTAL</span>
                <span>{peso(order.total)}</span>
              </div>
              <div className="receipt-row" style={{ marginTop: 4 }}>
                <span>Payment</span>
                <span>
                  {order.paid
                    ? paidLabel || payLabel
                    : order.amountPaid > 0
                      ? `Partial · ${peso(order.amountPaid)} paid`
                      : "UNPAID — pay on pickup"}
                </span>
              </div>
              {payRefLine && (
                <div className="receipt-row" style={{ marginTop: 2 }}>
                  <span>{payLabel} to</span>
                  <span>{payRefLine}</span>
                </div>
              )}
              {!order.paid && (
                <div className="receipt-row" style={{ marginTop: 2, fontWeight: 700 }}>
                  <span>Balance due</span>
                  <span>{peso(getBalance(order))}</span>
                </div>
              )}
            </div>

            <div className="cut-line">✂ - - - - - - - CUT HERE - - - - - - - ✂</div>

            {/* Basket tag: the customer's name and nothing else. It gets cut off
                and dropped into the laundry basket, where the only job is being
                readable across the room — every other line stole size from it. */}
            <div className="basket-tag" id="basketTag">
              <div className="tag-name">{order.name}</div>
            </div>
          </div>
        )}

        {/* One print action. The direct USB/Bluetooth ESC/POS path and the
            PDF export were removed at the owner's request: the shop prints
            through the installed Windows POS58 driver, and with that driver
            attached the browser is blocked from the USB port anyway, so the
            direct button could only ever fail on this setup. */}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={() => window.print()}>
            🖨️ Print Receipt
          </button>
          <button className="btn btn-ghost modal-close-btn" onClick={closeReceipt}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
