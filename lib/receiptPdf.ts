import { Order } from "./types";

/* Builds a thermal-sized receipt + basket tag PDF using jsPDF.
   Ported from the original app.js buildReceiptPDF(), unchanged in
   spirit — same layout, same paper-width math — just typed and
   fed from the React order model instead of the DOM. */
export function buildReceiptPDF(order: Order, PW: number, shopName: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { jsPDF } = require("jspdf");
  const ML = 3;
  const MR = 3;
  const CW = PW - ML - MR;
  let y = 4;

  const itemCount = (order.items || []).length;
  const pageH = Math.max(120, 70 + itemCount * 8);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [PW, pageH] });

  function drawDashed(yy: number) {
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.2);
    doc.line(ML, yy, PW - MR, yy);
    doc.setLineDashPattern([], 0);
  }
  function drawSolid(yy: number) {
    doc.setLineDashPattern([], 0);
    doc.setLineWidth(0.4);
    doc.line(ML, yy, PW - MR, yy);
  }
  function rowLR(left: string, right: string, bold = false) {
    doc.setFont("Courier", bold ? "bold" : "normal");
    doc.setFontSize(7.5);
    doc.text(left, ML, y);
    doc.text(right, PW - MR, y, { align: "right" });
    y += 4.2;
  }
  function center(txt: string, size = 8, bold = false) {
    doc.setFont("Courier", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.text(txt, PW / 2, y, { align: "center" });
    y += size * 0.45;
  }
  function gap(h = 2) {
    y += h;
  }

  doc.setFont("Courier", "bold");
  doc.setFontSize(10);
  const shopLabel = (order.shop || shopName || "Laundry Shop").toUpperCase();
  const shopLines = doc.splitTextToSize(shopLabel, CW);
  shopLines.forEach((l: string) => {
    doc.text(l, PW / 2, y, { align: "center" });
    y += 5;
  });

  doc.setFont("Courier", "normal");
  doc.setFontSize(7);
  doc.text("Official Receipt", PW / 2, y, { align: "center" });
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
  rowLR("Order ID", order.id || "", true);
  rowLR("Type", typeLabel, true);
  rowLR("Status", statusLabel, true);
  rowLR("Pickup", pickupStr, true);

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
  doc.text("TOTAL", ML, y);
  doc.text(`P${(order.total || 0).toLocaleString()}`, PW - MR, y, { align: "right" });
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

  drawDashed(y);
  y += 3;
  center("-- BASKET TAG --", 7, true);
  gap(1);

  doc.setFont("Courier", "bold");
  doc.setFontSize(13);
  const nameLines = doc.splitTextToSize((order.name || "").toUpperCase(), CW);
  nameLines.forEach((l: string) => {
    doc.text(l, PW / 2, y, { align: "center" });
    y += 6;
  });

  doc.setFont("Courier", "bold");
  doc.setFontSize(8);
  doc.text(order.phone || "", PW / 2, y, { align: "center" });
  y += 4;

  drawDashed(y);
  y += 3;
  const totalQty = (order.items || []).reduce((n, c) => n + (c.qty || 1), 0);
  rowLR(order.id || "", typeLabel, false);
  rowLR(`${totalQty} item${totalQty !== 1 ? "s" : ""}`, pickupStr, false);
  y += 1;
  drawDashed(y);
  y += 2;

  const filename = `receipt-${order.id || "order"}.pdf`;
  return { doc, filename };
}
