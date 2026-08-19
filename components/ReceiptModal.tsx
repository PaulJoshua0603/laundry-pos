"use client";

import { useState } from "react";
import { useApp } from "@/context/AppContext";
import { ORDER_TYPES, STATUS_MAP } from "@/lib/types";
import { peso } from "@/lib/format";
import { buildReceiptPDF } from "@/lib/receiptPdf";
import { isPrinterConnected, isWebBluetoothSupported, printReceiptToPr21 } from "@/lib/printer";

export default function ReceiptModal() {
  const { receiptOrder, closeReceipt, printerMm, printerH, setPrinterWidth, paySettings, session } = useApp();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  if (!receiptOrder) return null;
  const order = receiptOrder;

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
      const { doc, filename } = buildReceiptPDF(order, printerMm, shopName);
      doc.save(filename);
    } catch (err: any) {
      alert("PDF error: " + err.message);
    } finally {
      setPdfBusy(false);
    }
  }

  async function printToPr21() {
    setPrintBusy(true);
    try {
      if (isWebBluetoothSupported()) {
        // Real ESC/POS print straight to the PR21 over Bluetooth.
        await printReceiptToPr21({
          shop: shopName,
          orderId: order.id,
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
        });
        return;
      }

      // No Web Bluetooth (typically iOS Safari) — build the PDF and
      // hand it to the native share sheet so the PR21 companion app
      // can print it, same as the original app's iOS flow.
      const { doc, filename } = buildReceiptPDF(order, printerMm, shopName);
      const blob = doc.output("blob");
      const file = new File([blob], filename, { type: "application/pdf" });
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: "Receipt", text: `Receipt ${order.id}` });
      } else if (nav.share) {
        window.print();
      } else {
        doc.save(filename);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") alert("Print error: " + err.message);
    } finally {
      setPrintBusy(false);
    }
  }

  return (
    <div className="modal-overlay show" id="receiptModal" onClick={(e) => e.target === e.currentTarget && closeReceipt()}>
      <div className="modal" id="receiptModalInner" style={{ ["--receipt-w" as any]: `${printerMm}mm` }}>
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
          Using the <b>PR21 58mm</b> printer? Keep <b>58mm (PR21)</b> selected, then tap <b>🖨️ Print to PR21</b> below —
          it prints directly over Bluetooth on Android/Chrome, or opens the iOS share sheet to your PR21 app on iPhone.
        </div>

        <div className="receipt" id="receiptBody">
          <div className="receipt-header">
            <div className="receipt-logo">🫧</div>
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
            <span>Order ID</span>
            <span>{order.id}</span>
          </div>
          <div className="receipt-row customer">
            <span>Order Type</span>
            <span>
              {typeInfo.icon} {typeInfo.label}
            </span>
          </div>
          <div className="receipt-row customer">
            <span>Status</span>
            <span>
              {statusInfo ? `${statusInfo.icon} ${statusInfo.label}` : order.status}
            </span>
          </div>
          {order.pickup && (
            <div className="receipt-row customer">
              <span>Pickup</span>
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
                {c.service.icon} {c.service.name} × {c.qty}
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
            Thank you for choosing {shopName}! 🫧
            <br />
            <span style={{ fontSize: 10 }}>Keep this receipt for reference.</span>
          </div>
        </div>

        <div className="basket-tag" id="basketTag">
          <div className="tag-label">BASKET TAG</div>
          <div className="tag-name">{order.name}</div>
          {order.phone && <div className="tag-phone">{order.phone}</div>}
          <div className="tag-divider" />
          <div className="tag-row">
            <span>{order.id}</span>
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
              <span>Pickup</span>
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
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={printToPr21} disabled={printBusy}>
            {printBusy ? "⏳ Printing…" : "🖨️ Print to PR21"}
          </button>
        </div>
      </div>
    </div>
  );
}
