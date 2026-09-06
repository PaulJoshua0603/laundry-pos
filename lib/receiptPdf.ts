import { getBalance, Order, getDailyOrderNo } from "./types";

/* Builds a thermal-sized receipt + basket tag PDF using jsPDF.
   Ported from the original app.js buildReceiptPDF(), unchanged in
   spirit — same layout, same paper-width math — just typed and
   fed from the React order model instead of the DOM. */
export function buildReceiptPDF(order: Order, PW: number, shopName: string, allOrders: Order[] = []) {
  const dailyNo = getDailyOrderNo(order, allOrders.length ? allOrders : [order]);
  const displayNo = `#${dailyNo}`;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { jsPDF } = require("jspdf");
  const ML = 3;
  const MR = 3;
  const CW = PW - ML - MR;
  let y = 4;

  const itemCount = (order.items || []).length;
  const pageH = Math.max(138, 84 + itemCount * 8);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [PW, pageH] });

  function drawDashed(yy: number) {
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.35);
    doc.line(ML, yy, PW - MR, yy);
    doc.setLineDashPattern([], 0);
  }
  function drawSolid(yy: number) {
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.6);
    doc.line(ML, yy, PW - MR, yy);
  }
  // Draws text twice with a hair's offset ("fake bold") so strokes come
  // out thicker/darker on thermal output — jsPDF's "bold" Courier style
  // alone still prints thin/grey on cheap 58mm thermal printers.
  function boldText(txt: string, x: number, yy: number, opts?: any) {
    doc.text(txt, x, yy, opts);
    doc.text(txt, x + 0.08, yy, opts);
    doc.text(txt, x, yy + 0.08, opts);
  }
  function rowLR(left: string, right: string, bold = false) {
    doc.setFont("Courier", "bold");
    doc.setFontSize(7.5);
    boldText(left, ML, y);
    boldText(right, PW - MR, y, { align: "right" });
    y += 4.2;
  }
  function center(txt: string, size = 7, bold = false) {
    doc.setFont("Courier", "bold");
    doc.setFontSize(size);
    boldText(txt, PW / 2, y, { align: "center" });
    y += size * 0.48;
  }
  function gap(h = 2) {
    y += h;
  }

  doc.setFont("Courier", "bold");
  doc.setFontSize(10);
  const shopLabel = (order.shop || shopName || "Laundry Shop").toUpperCase();
  const shopLines = doc.splitTextToSize(shopLabel, CW);
  shopLines.forEach((l: string) => {
    boldText(l, PW / 2, y, { align: "center" });
    y += 5;
  });

  doc.setFont("Courier", "bold");
  doc.setFontSize(7);
  boldText("Official Receipt", PW / 2, y, { align: "center" });
  y += 4;

  drawSolid(y);
  y += 3;

  const pickupStr = order.pickup
    ? new Date(order.pickup).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
    : "—";
  const typeLabel = order.type === "delivery" ? "Delivery" : "Walk-in";
  const statusLabel = (order.status || "").charAt(0).toUpperCase() + (order.status || "").slice(1);

  rowLR("Customer", order.name || "", true);
  rowLR("Phone", order.phone || "—", true);
  rowLR("Order #", displayNo, true);
  rowLR("Type", typeLabel, true);
  rowLR("Status", statusLabel, true);
  rowLR("Date", pickupStr, true);

  drawSolid(y);
  y += 3;

  (order.items || []).forEach((it) => {
    const svc = it.service;
    const name = svc.name || "Item";
    const price = svc.price || 0;
    const qty = it.qty || 1;
    rowLR(`${name} x${qty}`, `P${(price * qty).toLocaleString()}`, false);
  });

  drawSolid(y);
  y += 4.5;

  doc.setFont("Courier", "bold");
  doc.setFontSize(10);
  boldText("TOTAL", ML, y);
  boldText(`P${(order.total || 0).toLocaleString()}`, PW - MR, y, { align: "right" });
  y += 6;

  const paymentValue = order.paid
    ? order.paidMethod || order.payment || "Cash"
    : order.amountPaid > 0
      ? `Partial - P${order.amountPaid.toLocaleString()} paid`
      : "UNPAID";
  rowLR("Payment", paymentValue, true);
  y += 2;
  if (!order.paid) {
    rowLR("Balance due", `P${getBalance(order).toLocaleString()}`, true);
    y += 2;
  }

  drawDashed(y);
  y += 4;

  center("Thank you for choosing", 7);
  gap(0.5);
  center(order.shop || shopName || "our shop", 7, true);
  gap(0.5);
  center("Keep this receipt for reference.", 7);
  gap(3);

  y += 1;
  drawDashed(y);
  y += 2;
  center("✂  - - - CUT HERE - - -  ✂", 8, true);
  gap(1);

  drawDashed(y);
  y += 3;
  center("-- BASKET TAG --", 7, true);
  gap(1);

  doc.setFont("Courier", "bold");
  doc.setFontSize(13);
  const nameLines = doc.splitTextToSize((order.name || "").toUpperCase(), CW);
  nameLines.forEach((l: string) => {
    boldText(l, PW / 2, y, { align: "center" });
    y += 6;
  });

  doc.setFont("Courier", "bold");
  doc.setFontSize(8);
  boldText(order.phone || "", PW / 2, y, { align: "center" });
  y += 4;

  drawDashed(y);
  y += 3;
  const totalQty = (order.items || []).reduce((n, c) => n + (c.qty || 1), 0);
  const placedDateStr = new Date(order.time).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const placedTimeStr = new Date(order.time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
  doc.setFont("Courier", "bold");
  doc.setFontSize(7.5);
  boldText(`${displayNo}: ${typeLabel}`, ML, y);
  y += 4.2;
  boldText(`Items: ${totalQty} item${totalQty !== 1 ? "s" : ""}`, ML, y);
  y += 4.2;
  boldText(`Placed Order: ${placedDateStr} ${placedTimeStr}`, ML, y);
  y += 4.2;
  y += 1;
  drawDashed(y);
  y += 2;

  const filename = `receipt-${order.id || "order"}.pdf`;
  return { doc, filename };
}

/* ══════════════════════════════════════════════════════════
   COMPACT FIXED-SIZE RECEIPT — 57×50mm pre-cut tag stock
   ══════════════════════════════════════════════════════════
   For PR21/POS58 printers loaded with pre-cut 57x50mm label
   stock instead of a continuous roll. Height is FIXED (not
   grown per item like buildReceiptPDF), so line spacing shrinks
   gracefully to fit everything on one tag — combined receipt +
   basket-tag identity in a single premium, compact layout.
   ══════════════════════════════════════════════════════════ */
export function buildFixedTagPDF(order: Order, shopName: string, allOrders: Order[] = []) {
  const dailyNo = getDailyOrderNo(order, allOrders.length ? allOrders : [order]);
  const displayNo = `#${dailyNo}`;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { jsPDF } = require("jspdf");

  const PW = 57;
  const PH = 50;
  const ML = 2.6;
  const MR = 2.6;
  const CW = PW - ML - MR;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [PW, PH] });

  function boldText(txt: string, x: number, yy: number, opts?: any) {
    doc.text(txt, x, yy, opts);
    doc.text(txt, x + 0.07, yy, opts);
    doc.text(txt, x, yy + 0.07, opts);
  }
  function thickRule(yy: number, w = 0.55) {
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(w);
    doc.line(ML, yy, PW - MR, yy);
  }
  function dashRule(yy: number) {
    doc.setLineDashPattern([0.7, 0.6], 0);
    doc.setLineWidth(0.3);
    doc.line(ML, yy, PW - MR, yy);
    doc.setLineDashPattern([], 0);
  }

  const items = order.items || [];
  const itemCount = items.length || 1;
  // Fixed budget: shrink item-row height (not page height) so any
  // realistic order count still lands inside the 50mm tag.
  const itemRowH = itemCount <= 4 ? 3.0 : itemCount <= 7 ? 2.55 : 2.15;
  const rowH = itemCount <= 5 ? 3.05 : 2.7;
  const fontRow = itemCount <= 5 ? 6.6 : 6.1;

  let y = 3.6;

  // ── Header ──
  doc.setFont("Courier", "bold");
  doc.setFontSize(9.5);
  const shopLabel = (order.shop || shopName || "Laundry Shop").toUpperCase();
  const shopLines = doc.splitTextToSize(shopLabel, CW).slice(0, 2);
  shopLines.forEach((l: string) => {
    boldText(l, PW / 2, y, { align: "center" });
    y += 3.4;
  });
  doc.setFontSize(6);
  doc.setFont("Courier", "normal");
  boldText("★ OFFICIAL RECEIPT ★", PW / 2, y, { align: "center" });
  y += 2.2;
  thickRule(y);
  y += 2.6;

  // ── Order meta (2-col compact grid) ──
  const typeLabel = order.type === "delivery" ? "Delivery" : "Walk-in";
  const statusLabel = (order.status || "").charAt(0).toUpperCase() + (order.status || "").slice(1);
  const dateStr = new Date(order.time).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const timeStr = new Date(order.time).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });

  function metaRow(left: string, right: string) {
    doc.setFont("Courier", "bold");
    doc.setFontSize(fontRow);
    boldText(left, ML, y);
    boldText(right, PW - MR, y, { align: "right" });
    y += rowH;
  }

  metaRow(displayNo, `${dateStr} ${timeStr}`);
  doc.setFont("Courier", "bold");
  doc.setFontSize(fontRow + 1.2);
  const nameLine = doc.splitTextToSize((order.name || "Customer").toUpperCase(), CW)[0];
  boldText(nameLine, ML, y);
  y += rowH + 0.3;
  metaRow(typeLabel, statusLabel);

  y += 0.6;
  dashRule(y);
  y += 2.2;

  // ── Items ──
  doc.setFont("Courier", "normal");
  items.forEach((it) => {
    const svc = it.service;
    const name = svc.name || "Item";
    const price = svc.price || 0;
    const qty = it.qty || 1;
    doc.setFontSize(fontRow - 0.2);
    const label = doc.splitTextToSize(`${name} x${qty}`, CW - 14)[0];
    doc.text(label, ML, y);
    boldText(`P${(price * qty).toLocaleString()}`, PW - MR, y, { align: "right" });
    y += itemRowH;
  });

  y += 0.4;
  thickRule(y);
  y += 3;

  // ── Total ──
  doc.setFont("Courier", "bold");
  doc.setFontSize(11);
  boldText("TOTAL", ML, y);
  boldText(`P${(order.total || 0).toLocaleString()}`, PW - MR, y, { align: "right" });
  y += 4;

  // ── Payment status ──
  doc.setFontSize(6.6);
  const paid = order.paid;
  const payLabel = paid ? order.paidMethod || order.payment || "Cash" : "UNPAID";
  const statusLine = paid
    ? `✓ PAID · ${String(payLabel).toUpperCase()}`
    : order.amountPaid > 0
      ? `◐ PARTIAL · P${order.amountPaid.toLocaleString()} PAID`
      : "⏳ UNPAID — pay on pickup";
  boldText(statusLine, ML, y);
  y += 2.8;
  if (!paid) {
    boldText(`Balance: P${getBalance(order).toLocaleString()}`, ML, y);
    y += 2.8;
  }

  // ── Footer ──
  const remaining = PH - y - 2;
  if (remaining > 3) {
    dashRule(y);
    y += 2.4;
    doc.setFont("Courier", "normal");
    doc.setFontSize(5.6);
    boldText("Thank you for choosing us!", PW / 2, y, { align: "center" });
  }

  const filename = `tag-${order.id || "order"}.pdf`;
  return { doc, filename };
}
