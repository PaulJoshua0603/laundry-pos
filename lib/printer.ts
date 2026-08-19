/* ══════════════════════════════════════════════════════════
   PR21 58mm thermal printer driver (ESC/POS over Web Bluetooth)
   ══════════════════════════════════════════════════════════
   Most 58mm "PR21" style thermal printers expose a BLE GATT service
   for raw ESC/POS bytes. The UUIDs below cover the two families
   these clone printers almost always ship with. If neither is
   found, we fall back to scanning every writable characteristic on
   the device, which covers the rest.

   IMPORTANT: Web Bluetooth only works over HTTPS (or localhost) and
   only in Chromium-based browsers (Chrome/Edge on Android, desktop
   Chrome/Edge). It is NOT available in Safari on iOS/iPadOS — Apple
   has not implemented the Web Bluetooth spec. On iPhone, use
   "Share to PR21 app" or "Save PDF" instead (see printing.ts).
   ══════════════════════════════════════════════════════════ */

export const PR21_SERVICE_CANDIDATES = [
  // "Zjiang / Goojprt"-style BLE thermal printers — the most common
  // chipset behind generic 58mm printers sold as "PR21".
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", write: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
  // Common HM-10/serial-bridge style module.
  { service: "0000ffe0-0000-1000-8000-00805f9b34fb", write: "0000ffe1-0000-1000-8000-00805f9b34fb" },
  // Generic "printer service" UUID seen on some clones.
  { service: "000018f0-0000-1000-8000-00805f9b34fb", write: "00002af1-0000-1000-8000-00805f9b34fb" },
];

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as any).bluetooth;
}

let cachedDevice: BluetoothDevice | null = null;
let cachedChar: BluetoothRemoteGATTCharacteristic | null = null;

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer
): Promise<BluetoothRemoteGATTCharacteristic> {
  // 1) Try known service/characteristic pairs first (fast path).
  for (const candidate of PR21_SERVICE_CANDIDATES) {
    try {
      const service = await server.getPrimaryService(candidate.service);
      const char = await service.getCharacteristic(candidate.write);
      return char;
    } catch {
      /* try next candidate */
    }
  }
  // 2) Fall back to scanning every service for a writable characteristic.
  const services = await server.getPrimaryServices();
  for (const service of services) {
    const chars = await service.getCharacteristics();
    const writable = chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
    if (writable) return writable;
  }
  throw new Error("No writable characteristic found on this printer.");
}

/** Opens the browser's Bluetooth device picker and connects to the printer. */
export async function connectPrinter(): Promise<{ name: string }> {
  if (!isWebBluetoothSupported()) {
    throw new Error("Web Bluetooth isn't supported in this browser.");
  }
  const device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PR21_SERVICE_CANDIDATES.map((c) => c.service),
  });
  const server = await device.gatt!.connect();
  const char = await findWritableCharacteristic(server);
  cachedDevice = device;
  cachedChar = char;
  return { name: device.name || "Thermal printer" };
}

export function isPrinterConnected(): boolean {
  return !!(cachedDevice && cachedDevice.gatt && cachedDevice.gatt.connected);
}

export function disconnectPrinter() {
  try {
    cachedDevice?.gatt?.disconnect();
  } catch {
    /* ignore */
  }
  cachedDevice = null;
  cachedChar = null;
}

/** Writes raw bytes to the printer in small chunks (BLE MTU-safe). */
async function writeBytes(bytes: Uint8Array) {
  if (!cachedChar) throw new Error("Printer not connected.");
  const CHUNK = 180; // safely under typical 20-byte-negotiated-up BLE MTU limits
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.slice(i, i + CHUNK);
    if (cachedChar.properties.writeWithoutResponse) {
      await cachedChar.writeValueWithoutResponse(slice);
    } else {
      await cachedChar.writeValue(slice);
    }
    // tiny delay so cheap printer firmware doesn't drop bytes
    await new Promise((r) => setTimeout(r, 12));
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
    const bytes = Array.from(new TextEncoder().encode(cleaned));
    this.parts.push(bytes);
    return this;
  }

  line(str = "") {
    this.text(str + "\n");
    return this;
  }

  divider(char = "-", width = 32) {
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
  status: string;
  pickup?: string;
  time: string;
  lines: ReceiptOrderLine[];
  total: string;
  paymentLabel: string;
  balanceDue?: string;
}

const WIDTH = 32; // chars per line on 58mm paper at default font

function padRow(left: string, right: string, width = WIDTH): string {
  const space = Math.max(1, width - left.length - right.length);
  if (space <= 1 && left.length + right.length > width) {
    // wrap long left text onto its own line
    return left + "\n" + " ".repeat(Math.max(0, width - right.length)) + right;
  }
  return left + " ".repeat(space) + right;
}

/** Builds the raw ESC/POS byte stream for a WashHub receipt + basket tag. */
export function buildReceiptEscPos(order: ReceiptData): Uint8Array {
  const b = new EscPosBuilder();
  b.init();

  b.align("center").bold(true).doubleSize(true).line(order.shop.toUpperCase());
  b.doubleSize(false).bold(false).line("Official Receipt");
  b.divider("=");

  b.align("left");
  b.line(padRow("Customer", order.customer));
  if (order.phone) b.line(padRow("Phone", order.phone));
  b.line(padRow("Order ID", order.orderId));
  b.line(padRow("Type", order.type));
  b.line(padRow("Status", order.status));
  if (order.pickup) b.line(padRow("Pickup", order.pickup));
  b.line(padRow("Time", order.time));
  b.divider("-");

  order.lines.forEach((l) => b.line(padRow(l.label, l.price)));
  b.divider("-");

  b.bold(true).doubleSize(true).line(padRow("TOTAL", order.total, 16));
  b.doubleSize(false);
  b.line(padRow("Payment", order.paymentLabel));
  if (order.balanceDue) b.line(padRow("Balance due", order.balanceDue));
  b.bold(false);

  b.divider("-");
  b.align("center").line("Thank you for choosing");
  b.bold(true).line(order.shop);
  b.bold(false).line("Keep this receipt for reference.");

  // ── Basket tag ──
  b.feed(1).divider("=");
  b.bold(true).line("-- BASKET TAG --");
  b.doubleSize(true).line(order.customer.toUpperCase());
  b.doubleSize(false);
  if (order.phone) b.line(order.phone);
  b.bold(false).divider("-");
  b.align("left").line(padRow(order.orderId, order.type));

  b.cut();
  return b.build();
}

/** Sends a built receipt to the currently connected PR21 printer. */
export async function printReceiptToPr21(order: ReceiptData): Promise<void> {
  if (!isPrinterConnected()) {
    await connectPrinter();
  }
  const bytes = buildReceiptEscPos(order);
  await writeBytes(bytes);
}
