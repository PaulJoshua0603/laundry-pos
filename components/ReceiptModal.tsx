"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ORDER_TYPES, STATUS_MAP, getDailyOrderNo } from "@/lib/types";
import { peso } from "@/lib/format";
import { buildReceiptPDF } from "@/lib/receiptPdf";
import { isPrinterConnected, isUsbConnected, isWebBluetoothSupported, isWebUsbSupported, printReceiptToPr21 } from "@/lib/printer";

export default function ReceiptModal() {
  const { receiptOrder, closeReceipt, printerMm, printerH, setPrinterWidth, paySettings, session, showToast, orders } = useApp();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

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

  async function saveReceiptPDF() {
    setPdfBusy(true);
    try {
      const { doc, filename } = buildReceiptPDF(order, printerMm, shopName, orders);
      doc.save(filename);
    } catch (err: any) {
      showToast("❌ PDF error: " + err.message, "error");
    } finally {
      setPdfBusy(false);
    }
  }

  async function printToPr21() {
    setPrintBusy(true);
    try {
      if (isUsbConnected() || isWebUsbSupported() || isPrinterConnected()) {
        await printReceiptToPr21({
          shop: shopName,
          orderId: `#${dailyNo}`,
          customer: order.name,
          phone: order.phone,
          type: typeInfo.label,
          status: statusInfo ? statusInfo.label : order.status,
          pickup: order.pickup
            ? new Date(order.pickup).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : undefined,
          time: new Date(order.time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }),
          lines: order.items.map((c) => ({
            label: `${c.service.name} x${c.qty}`,
            price: peso(c.service.price * c.qty),
          })),
          total: peso(order.total),
          paymentLabel: order.paid ? paidLabel || payLabel : "UNPAID — pay on pickup",
          balanceDue: !order.paid ? peso(order.total) : undefined,
        }, undefined, printerMm);
        showToast("🖨️ Sent to printer", "success");
        return;
      }

      // No USB/Bluetooth support at all (typically iOS Safari) — build
      // the PDF and hand it to the native share sheet so the PR21
      // companion app can print it instead.
      const { doc, filename } = buildReceiptPDF(order, printerMm, shopName, orders);
      const blob = doc.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "Receipt", text: `Receipt #${dailyNo}` });
      } else if (nav.share) {
        window.print();
      } else {
        doc.save(filename);
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.name === "NotFoundError") return; // user cancelled the picker
      const raw = String(err?.message || "");
      let friendly = raw || "Couldn't print. Try Save PDF instead.";
      if (/globally disabled/i.test(raw)) {
        friendly = "Bluetooth is turned off on this device — enable Bluetooth in Windows, or plug the PR21 in via USB and connect it under Payment Methods → Thermal Printer.";
      } else if (/not supported/i.test(raw)) {
        friendly = "This browser can't print directly. Use Save PDF, or open this page in Chrome/Edge and connect the PR21 via USB under Payment Methods.";
      }
      showToast("❌ " + friendly, "error");
    } finally {
      setPrintBusy(false);
    }
  }

  // Printers report their nominal roll width (58mm/80mm), but their real
  // printable area is narrower (margins) — that mismatch was clipping the
  // right column. Size the receipt to the printable area, not the roll.
  const printableMm = printerMm === 58 ? 48 : printerMm === 80 ? 72 : printerMm;

  return (
    <div className="modal-overlay show" id="receiptModal" onClick={(e) => e.target === e.currentTarget && closeReceipt()}>
      <div className="modal" id="receiptModalInner" style={{ ["--receipt-w" as any]: `${printableMm}mm` }}>
        <div className="printer-size-row">
          <span className="printer-size-label">Printer paper</span>
          <div className="pills">
            <div className={`pill${printerMm === 58 ? " active" : ""}`} onClick={() => setPrinterWidth(58, 210)}>
              58mm (PR21)
            </div>
            <div className={`pill${printerMm === 80 ? " active" : ""}`} onClick={() => setPrinterWidth(80)}>
              80mm
            </div>
            <div className={`pill${printerMm === 48 ? " active" : ""}`} onClick={() => setPrinterWidth(48, 210)}>
              48mm (ZPrinter)
            </div>
          </div>
        </div>
        <div className="printer-size-hint">
          Using the <b>PR21 / POS58 58mm</b> printer? Keep <b>58mm (PR21)</b> selected. If you installed a Windows
          driver for it (shows up as &quot;POS58 Printer&quot;), Windows now owns that USB port — use{" "}
          <b>🖨️ Print (Windows)</b> below and pick it from the print dialog. USB/Bluetooth direct-print only works if{" "}
          <b>no</b> Windows printer driver is installed for it.
        </div>

        <div className="receipt" id="receiptBody">
          <div className="receipt-header">
            <div className="receipt-logo receipt-icon">🫧</div>
            <div className="receipt-biz">{shopName}</div>
            <div className="receipt-sub">Official Receipt</div>
          </div>
          <hr className="receipt-divider" />
          <div className="receipt-row customer">
            <span>Customer</span>
            <span>{order.name}</span>
          </div>
          {order.phone && (
            <div className="receipt-row customer">
              <span>Phone</span>
              <span>{order.phone}</span>
            </div>
          )}
          <div className="receipt-row customer">
            <span>Order #</span>
            <span>{dailyNo}</span>
          </div>
          <div className="receipt-row customer">
            <span>Order ID</span>
            <span style={{ fontSize: 10, opacity: 0.7 }}>{order.id}</span>
          </div>
          <div className="receipt-row customer">
            <span>Order Type</span>
            <span>
              <span className="receipt-icon">{typeInfo.icon} </span>{typeInfo.label}
            </span>
          </div>
          <div className="receipt-row customer">
            <span>Status</span>
            <span>
              {statusInfo ? (
                <>
                  <span className="receipt-icon">{statusInfo.icon} </span>{statusInfo.label}
                </>
              ) : (
                order.status
              )}
            </span>
          </div>
          {order.pickup && (
            <div className="receipt-row customer">
              <span>Placed Order</span>
              <span>{new Date(order.pickup).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}
          <div className="receipt-row customer">
            <span>Time</span>
            <span>{new Date(order.time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <hr className="receipt-divider" />
          {order.items.map((c, i) => (
            <div className="receipt-row" key={i}>
              <span>
                <span className="receipt-icon">{c.service.icon} </span>{c.service.name} × {c.qty}
              </span>
              <span>{peso(c.service.price * c.qty)}</span>
            </div>
          ))}
          <hr className="receipt-divider" />
          <div className="receipt-row total">
            <span>TOTAL</span>
            <span>{peso(order.total)}</span>
          </div>
          <div className="receipt-row" style={{ marginTop: 4 }}>
            <span>Payment</span>
            <span>{order.paid ? paidLabel || payLabel : "UNPAID — pay on pickup"}</span>
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
              <span>{peso(order.total)}</span>
            </div>
          )}
          <div className="receipt-footer">
            Thank you for choosing {shopName}! <span className="receipt-icon">🫧</span>
            <br />
            <span style={{ fontSize: 10 }}>Keep this receipt for reference.</span>
          </div>
        </div>

        <div className="cut-line">✂ - - - - - - - CUT HERE - - - - - - - ✂</div>

        <div className="basket-tag" id="basketTag">
          <div className="tag-label">BASKET TAG</div>
          <div className="tag-name">{order.name}</div>
          {order.phone && <div className="tag-phone">{order.phone}</div>}
          <div className="tag-divider" />
          <div className="tag-row">
            <span>#{dailyNo}</span>
            <span>
              {typeInfo.icon} {typeInfo.label}
            </span>
          </div>
          <div className="tag-row">
            <span>
              {order.items.reduce((n, c) => n + c.qty, 0)} item{order.items.reduce((n, c) => n + c.qty, 0) !== 1 ? "s" : ""}
            </span>
            <span>{new Date(order.time).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
          </div>
          {order.pickup && (
            <div className="tag-row">
              <span>Placed Order</span>
              <span>{new Date(order.pickup).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={closeReceipt}>
            Close
          </button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={saveReceiptPDF} disabled={pdfBusy}>
            {pdfBusy ? "⏳ Generating…" : "📄 Save PDF"}
          </button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => window.print()} title="Prints via the Windows printer driver (POS58/PR21 shows here once installed)">
            🖨️ Print (Windows)
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={printToPr21} disabled={printBusy}>
            {printBusy ? "⏳ Printing…" : "🖨️ Print to PR21 (USB/BT)"}
          </button>
        </div>
      </div>
    </div>
  );
}
