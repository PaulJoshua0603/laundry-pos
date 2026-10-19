/* ══════════════════════════════════════════════════════════
   58mm thermal printer driver (ESC/POS over WebUSB)
   ══════════════════════════════════════════════════════════
   Used by the Test Print button in Tools → Printer. Everyday receipts
   go through the browser's own print path instead (see ReceiptModal),
   which is what --kiosk-printing makes instant.

   This file also carried a full Web Bluetooth GATT driver. The till is
   a fixed counter machine on a USB cable, the Bluetooth path has not
   been reachable from the UI since that transport was removed, and a
   driver nobody can invoke is a driver nobody maintains — so it is gone.
   ══════════════════════════════════════════════════════════ */

export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).usb;
}

let cachedUsbDevice: USBDevice | null = null;
let cachedUsbEndpoint: number | null = null;
let cachedUsbInterface: number | null = null;

/** Opens the browser's USB device picker and claims a printable endpoint. */
export async function connectUsbPrinter(): Promise<{ name: string }> {
  if (!isWebUsbSupported()) {
    throw new Error("USB printing isn't supported in this browser. Use Chrome or Edge.");
  }
  const usb = (navigator as any).usb;
  const device: USBDevice = await usb.requestDevice({ filters: [] });

  try {
    await device.open();
  } catch (err: any) {
    // Windows blocks WebUSB from opening a device once a Windows printer
    // driver (e.g. "POS58 Printer" / "CLA58") has claimed it. open()
    // throws "Access denied" in that case — surface a clear fix instead
    // of the raw DOMException.
    throw new Error(
      "Can't access this printer over USB — Windows has a driver (e.g. \"CLA58\" / " +
        "\"POS58 Printer\") already attached to it, so the browser is blocked from " +
        "talking to it directly. Either use \"Print (Windows)\" instead, or remove the " +
        "Windows driver for it (Settings > Bluetooth & devices > Printers, or Device " +
        "Manager > Universal Serial Bus devices) and reconnect a driverless copy with " +
        "Zadig (WinUSB) if you want direct USB/BT printing."
    );
  }

  try {
    if (!device.configuration) await device.selectConfiguration(1);

    // Prefer a vendor-specific (non-printer-class) interface first — those
    // are the ones WinUSB/WebUSB can actually claim. Printer-class (7)
    // interfaces are normally reserved by the OS's own printer driver.
    const interfaces = device.configuration!.interfaces;
    const isPrinterClass = (iface: USBInterface) =>
      iface.alternates.some((alt: any) => alt.interfaceClass === 7);
    const ordered = [...interfaces].sort(
      (a, b) => Number(isPrinterClass(a)) - Number(isPrinterClass(b))
    );

    let ifaceNum: number | null = null;
    let endpointNum: number | null = null;
    for (const iface of ordered) {
      for (const alt of iface.alternates) {
        const out = alt.endpoints.find((e) => e.direction === "out");
        if (out) {
          ifaceNum = iface.interfaceNumber;
          endpointNum = out.endpointNumber;
          break;
        }
      }
      if (ifaceNum !== null) break;
    }
    if (ifaceNum === null || endpointNum === null) {
      throw new Error("No printable USB endpoint found on this device.");
    }

    try {
      await device.claimInterface(ifaceNum);
    } catch (err: any) {
      throw new Error(
        "Windows is holding this USB interface for its own printer driver, so it can't " +
          "be claimed here. Use \"Print (Windows)\" instead, or uninstall the Windows " +
          "driver for this printer if you want direct USB printing."
      );
    }

    cachedUsbDevice = device;
    cachedUsbInterface = ifaceNum;
    cachedUsbEndpoint = endpointNum;
    return { name: device.productName || "USB printer" };
  } catch (err) {
    try {
      await device.close();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function isUsbConnected(): boolean {
  return !!cachedUsbDevice && cachedUsbDevice.opened;
}

export async function disconnectUsbPrinter() {
  try {
    if (cachedUsbDevice && cachedUsbInterface !== null) {
      await cachedUsbDevice.releaseInterface(cachedUsbInterface);
    }
    await cachedUsbDevice?.close();
  } catch {
    /* ignore */
  }
  cachedUsbDevice = null;
  cachedUsbInterface = null;
  cachedUsbEndpoint = null;
}

async function writeUsbBytes(bytes: Uint8Array) {
  if (!cachedUsbDevice || cachedUsbEndpoint === null) throw new Error("USB printer not connected.");
  const CHUNK = 4096;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await cachedUsbDevice.transferOut(cachedUsbEndpoint, bytes.slice(i, i + CHUNK));
  }
}

/* ─── ESC/POS BUILDER ─── */
const ESC = 0x1b;
const GS = 0x1d;

class EscPosBuilder {
  private parts: number[][] = [];

  private push(...bytes: number[]) {
    this.parts.push(bytes);
  }

  init() {
    this.push(ESC, 0x40); // ESC @  — initialize
    // Crank up heat: max heating dots / heating time / heating interval.
    // Most cheap 58mm ESC/POS clones (PR21/POS58/ZJ-58 chipset) ship with
    // a very light default heat profile, which is why prints look faint
    // instead of solid black. Raising heating time (n2) to its max fixes
    // that — some clones ignore values above ~255 so we cap there.
    this.push(ESC, 0x37, 15, 255, 2); // ESC 7 n1(max dots) n2(max heat time) n3(min interval)
    return this;
  }

  align(a: "left" | "center" | "right") {
    const n = a === "left" ? 0 : a === "center" ? 1 : 2;
    this.push(ESC, 0x61, n); // ESC a n
    return this;
  }

  bold(on: boolean) {
    this.push(ESC, 0x45, on ? 1 : 0); // ESC E n
    return this;
  }

  doubleSize(on: boolean) {
    this.push(GS, 0x21, on ? 0x11 : 0x00); // GS ! n
    return this;
  }

  text(str: string) {
    // Strip characters the default codepage can't render (emoji, ₱)
    // and swap ₱ for "P" so totals stay legible on the tape.
    const cleaned = str
      .replace(/₱/g, "P")
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
      .replace(/[^\x00-\x7E\n]/g, "");
    // Emphasized (bold) + double-strike mode on top of the higher heat
    // setting from init() so every line — not just headers — comes out
    // solid black instead of the faint/grey default that rubs off.
    this.push(ESC, 0x45, 1); // ESC E 1 — bold on
    this.push(ESC, 0x47, 1); // ESC G 1 — double-strike on (prints each line twice, thicker ink)
    const bytes = Array.from(new TextEncoder().encode(cleaned));
    this.parts.push(bytes);
    this.push(ESC, 0x47, 0); // ESC G 0 — double-strike off
    this.push(ESC, 0x45, 0); // ESC E 0 — bold off (restore caller's state)
    return this;
  }

  line(str = "") {
    this.text(str + "\n");
    return this;
  }

  divider(char = "-", width = 32) {  // default only used when caller omits width
    this.line(char.repeat(width));
    return this;
  }

  feed(lines = 1) {
    for (let i = 0; i < lines; i++) this.push(0x0a);
    return this;
  }

  cut() {
    this.feed(3);
    this.push(GS, 0x56, 0x42, 0x00); // GS V B 0 — partial cut (ignored gracefully if unsupported)
    return this;
  }

  build(): Uint8Array {
    const flat = this.parts.flat();
    return new Uint8Array(flat);
  }
}

export interface ReceiptOrderLine {
  label: string;
  price: string;
}

export interface ReceiptData {
  shop: string;
  orderId: string;
  customer: string;
  phone?: string;
  type: string;
  pickup?: string;
  time: string;
  /** Full date + time the order was placed (created), e.g. "Aug 23, 06:45 AM" —
   *  distinct from `pickup`, which is the customer's scheduled pickup date. */
  placedAt: string;
  /** Total item quantity across all line items (sum of qty, not line count). */
  itemCount: number;
  lines: ReceiptOrderLine[];
  total: string;
  paymentLabel: string;
  balanceDue?: string;
}

const WIDTH_58MM = 32; // chars per line on 58mm paper at default font
const WIDTH_80MM = 48; // chars per line on 80mm paper at default font

function widthForMm(mm?: number): number {
  return mm && mm > 60 ? WIDTH_80MM : WIDTH_58MM;
}

function padRow(left: string, right: string, width: number): string {
  const space = Math.max(1, width - left.length - right.length);
  if (space <= 1 && left.length + right.length > width) {
    // wrap long left text onto its own line
    return left + "\n" + " ".repeat(Math.max(0, width - right.length)) + right;
  }
  return left + " ".repeat(space) + right;
}

/** Compact single-tag ESC/POS layout for 57×50mm pre-cut label stock —
 *  no separate cut-line/basket-tag section since the physical label
 *  already ends at 50mm; combines receipt + basket identity in one. */
function buildCompactTagEscPos(order: ReceiptData): Uint8Array {
  const WIDTH = 30;
  const b = new EscPosBuilder();
  b.init();

  b.align("center").bold(true).doubleSize(true).line(order.shop.toUpperCase());
  b.doubleSize(false).line("* OFFICIAL RECEIPT *");
  b.divider("=", WIDTH);

  b.align("left").bold(true);
  b.line(padRow(order.orderId, order.placedAt, WIDTH));
  b.doubleSize(true).line(order.customer.toUpperCase()).doubleSize(false);
  b.line(order.type);
  b.bold(false);
  b.divider("-", WIDTH);

  order.lines.forEach((l) => b.line(padRow(l.label, l.price, WIDTH)));
  b.divider("=", WIDTH);

  b.bold(true).doubleSize(true).line(padRow("TOTAL", order.total, Math.round(WIDTH / 2))).doubleSize(false);
  b.line(order.paymentLabel.toUpperCase());
  if (order.balanceDue) b.line(padRow("Balance", order.balanceDue, WIDTH));
  b.bold(false);

  b.align("center").line("Thank you!");
  b.cut();
  return b.build();
}

/** Builds the raw ESC/POS byte stream for a WashHub receipt + basket tag. */
export function buildReceiptEscPos(order: ReceiptData, paperMm?: number): Uint8Array {
  if (paperMm === 57) return buildCompactTagEscPos(order);
  const WIDTH = widthForMm(paperMm);
  const b = new EscPosBuilder();
  b.init();

  b.align("center").bold(true).doubleSize(true).line(order.shop.toUpperCase());
  b.doubleSize(false).bold(false).line("Official Receipt");
  b.divider("=", WIDTH);

  b.align("left");
  b.line(padRow("Customer", order.customer, WIDTH));
  if (order.phone) b.line(padRow("Phone", order.phone, WIDTH));
  b.line(padRow("Order ID", order.orderId, WIDTH));
  b.line(padRow("Type", order.type, WIDTH));
  b.line(padRow("Placed", order.placedAt, WIDTH));
  if (order.pickup) b.line(padRow("Pickup", order.pickup, WIDTH));
  b.divider("-", WIDTH);

  order.lines.forEach((l) => b.line(padRow(l.label, l.price, WIDTH)));
  b.divider("-", WIDTH);

  b.bold(true).doubleSize(true).line(padRow("TOTAL", order.total, Math.round(WIDTH / 2)));
  b.doubleSize(false);
  b.line(padRow("Payment", order.paymentLabel, WIDTH));
  if (order.balanceDue) b.line(padRow("Balance due", order.balanceDue, WIDTH));
  b.bold(false);

  b.divider("-", WIDTH);
  b.align("center").line("Thank you for choosing");
  b.bold(true).line(order.shop);
  b.bold(false).line("Keep this receipt for reference.");

  // ── Cut line — clear scissors marker so it's obvious where to cut
  // the strip apart before pinning the tag to a basket. ──
  b.feed(1).align("center").bold(true).line("- - - - - CUT HERE - - - - -");
  b.bold(false);

  // ── Basket tag ──
  b.divider("=", WIDTH);
  b.bold(true).line("-- BASKET TAG --");
  b.doubleSize(true).line(order.customer.toUpperCase());
  b.doubleSize(false);
  if (order.phone) b.line(order.phone);
  b.bold(false).divider("-", WIDTH);
  b.align("left");
  b.line(`${order.orderId}: ${order.type}`);
  b.line(`Items: ${order.itemCount} item${order.itemCount !== 1 ? "s" : ""}`);
  b.line(`Placed Order: ${order.placedAt}`);

  b.cut();
  return b.build();
}

/** Sends a built receipt straight to the USB printer, connecting if needed. */
export async function printReceiptToPr21(order: ReceiptData, paperMm?: number): Promise<void> {
  const bytes = buildReceiptEscPos(order, paperMm);
  if (!isUsbConnected()) await connectUsbPrinter();
  await writeUsbBytes(bytes);
}
