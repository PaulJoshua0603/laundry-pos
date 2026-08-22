import { Order, getDailyOrderNo } from "./types";

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
  const pageH = Math.max(130, 76 + itemCount * 8);

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
    ? new Date(order.pickup).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
  const typeLabel = order.type === "delivery" ? "Delivery" : "Walk-in";
  const statusLabel = (order.status || "").charAt(0).toUpperCase() + (order.status || "").slice(1);

  rowLR("Customer", order.name || "", true);
  rowLR("Phone", order.phone || "—", true);
  rowLR("Order #", displayNo, true);
  rowLR("Type", typeLabel, true);
  rowLR("Status", statusLabel, true);
  rowLR("Placed Order", pickupStr, true);

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

  rowLR("Payment", order.paidMethod || order.payment || "Cash", true);
  y += 2;

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
  rowLR(displayNo, typeLabel, false);
  rowLR(`${totalQty} item${totalQty !== 1 ? "s" : ""}`, pickupStr, false);
  y += 1;
  drawDashed(y);
  y += 2;

  const filename = `receipt-${order.id || "order"}.pdf`;
  return { doc, filename };
}
