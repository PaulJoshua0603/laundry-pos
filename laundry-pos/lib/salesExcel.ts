import type { Order } from "@/lib/types";

const NAVY = "1F2A44";
const GOLD = "C9A227";
const LIGHT = "F4F5F7";
const BORDER = "D0D3D9";

/** Builds and downloads an A4-print-ready Excel sales report for the given orders. */
export async function exportSalesExcel(orders: Order[], opts: { title: string; subtitle: string; shopName: string; filename: string }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = opts.shopName;
  wb.created = new Date();

  const sheet = wb.addWorksheet("Sales Report", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  const cols = [
    { header: "Date", key: "date", width: 12 },
    { header: "Order ID", key: "id", width: 12 },
    { header: "Customer", key: "name", width: 20 },
    { header: "Type", key: "type", width: 10 },
    { header: "Items", key: "items", width: 40 },
    { header: "Payment", key: "payment", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "Paid", key: "paid", width: 8 },
    { header: "Total (₱)", key: "total", width: 12 },
  ];
  sheet.columns = cols;

  // ── Title block ──
  sheet.mergeCells(1, 1, 1, cols.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = opts.shopName;
  titleCell.font = { name: "Arial", size: 16, bold: true, color: { argb: "FF" + NAVY } };
  titleCell.alignment = { horizontal: "center" };
  sheet.getRow(1).height = 26;

  sheet.mergeCells(2, 1, 2, cols.length);
  const subCell = sheet.getCell(2, 1);
  subCell.value = `${opts.title} — ${opts.subtitle}`;
  subCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF" + GOLD } };
  subCell.alignment = { horizontal: "center" };

  sheet.mergeCells(3, 1, 3, cols.length);
  const genCell = sheet.getCell(3, 1);
  genCell.value = `Generated ${new Date().toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}`;
  genCell.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF666666" } };
  genCell.alignment = { horizontal: "center" };

  sheet.addRow([]);

  // ── Header row ──
  const headerRow = sheet.addRow(cols.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });
  headerRow.height = 20;

  // ── Data rows ──
  const paid = orders.filter((o) => o.paid);
  let grandTotal = 0;
  orders.forEach((o, i) => {
    grandTotal += o.paid ? o.total : 0;
    const itemsStr = o.items.map((c) => `${c.service.name} x${c.qty}`).join(", ");
    const row = sheet.addRow({
      date: new Date(o.time).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
      id: o.id,
      name: o.name,
      type: o.type === "walkin" ? "Walk-in" : "Delivery",
      items: itemsStr,
      payment: (o.paidMethod || o.payment || "").toUpperCase(),
      status: o.status.charAt(0).toUpperCase() + o.status.slice(1),
      paid: o.paid ? "Yes" : "No",
      total: o.total,
    });
    row.eachCell((cell, colNum) => {
      cell.font = { name: "Arial", size: 9.5 };
      cell.border = { top: { style: "thin", color: { argb: "FF" + BORDER } }, bottom: { style: "thin", color: { argb: "FF" + BORDER } }, left: { style: "thin", color: { argb: "FF" + BORDER } }, right: { style: "thin", color: { argb: "FF" + BORDER } } };
      if (i % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + LIGHT } };
      if (colNum === cols.length) {
        cell.numFmt = '"₱"#,##0';
        cell.alignment = { horizontal: "right" };
      }
      if (cols[colNum - 1].key === "paid") {
        cell.alignment = { horizontal: "center" };
        cell.font = { name: "Arial", size: 9.5, bold: true, color: { argb: o.paid ? "FF1A7F37" : "FFB42318" } };
      }
    });
  });

  sheet.addRow([]);

  // ── Totals ──
  const totalRow = sheet.addRow({});
  sheet.mergeCells(totalRow.number, 1, totalRow.number, cols.length - 2);
  const totalLabelCell = sheet.getCell(totalRow.number, 1);
  totalLabelCell.value = `Total Orders: ${orders.length}  |  Paid: ${paid.length}  |  Unpaid: ${orders.length - paid.length}`;
  totalLabelCell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF" + NAVY } };

  sheet.mergeCells(totalRow.number, cols.length - 1, totalRow.number, cols.length - 1);
  const grandLabelCell = sheet.getCell(totalRow.number, cols.length - 1);
  grandLabelCell.value = "TOTAL:";
  grandLabelCell.font = { name: "Arial", size: 11, bold: true };
  grandLabelCell.alignment = { horizontal: "right" };

  const grandValCell = sheet.getCell(totalRow.number, cols.length);
  grandValCell.value = grandTotal;
  grandValCell.numFmt = '"₱"#,##0';
  grandValCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF" + GOLD } };
  grandValCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + NAVY } };
  grandValCell.alignment = { horizontal: "right" };
  grandLabelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + NAVY } };
  grandLabelCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  grandValCell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };

  sheet.views = [{ state: "frozen", ySplit: 5 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
