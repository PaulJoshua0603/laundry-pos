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
    // Crank up heat: max heating dots / heating time / heating interval.
    // Most cheap 58mm ESC/POS clones (PR21/POS58/ZJ-58 chipset) ship with
    // a very light default heat profile, which is why prints look faint
    // instead of solid black. Raising heating time (n2) fixes that.
    this.push(ESC, 0x37, 9, 200, 2); // ESC 7 n1 n2 n3
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
    // Emphasized (bold) mode on top of the higher heat setting from
    // init() so every line — not just headers — comes out solid black
    // instead of the faint/grey default.
    this.push(ESC, 0x45, 1); // ESC E 1 — bold on
    const bytes = Array.from(new TextEncoder().encode(cleaned));
    this.parts.push(bytes);
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
  status: string;
  pickup?: string;
  time: string;
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

/** Builds the raw ESC/POS byte stream for a WashHub receipt + basket tag. */
export function buildReceiptEscPos(order: ReceiptData, paperMm?: number): Uint8Array {
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
  b.line(padRow("Status", order.status, WIDTH));
  if (order.pickup) b.line(padRow("Pickup", order.pickup, WIDTH));
  b.line(padRow("Time", order.time, WIDTH));
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

  // ── Basket tag ──
  b.feed(1).divider("=", WIDTH);
  b.bold(true).line("-- BASKET TAG --");
  b.doubleSize(true).line(order.customer.toUpperCase());
  b.doubleSize(false);
  if (order.phone) b.line(order.phone);
  b.bold(false).divider("-", WIDTH);
  b.align("left").line(padRow(order.orderId, order.type, WIDTH));

  b.cut();
  return b.build();
}

export type PrinterTransport = "usb" | "bluetooth";

/** Sends a built receipt to the printer. Prefers USB (direct-wired, most
 *  reliable for a fixed till), falls back to a connected Bluetooth
 *  printer, or connects fresh via the requested/available transport. */
export async function printReceiptToPr21(
  order: ReceiptData,
  transport?: PrinterTransport,
  paperMm?: number
): Promise<void> {
  const bytes = buildReceiptEscPos(order, paperMm);

  const useTransport: PrinterTransport =
    transport || (isUsbConnected() ? "usb" : isPrinterConnected() ? "bluetooth" : isWebUsbSupported() ? "usb" : "bluetooth");

  if (useTransport === "usb") {
    if (!isUsbConnected()) await connectUsbPrinter();
    await writeUsbBytes(bytes);
  } else {
    if (!isPrinterConnected()) await connectPrinter();
    await writeBytes(bytes);
  }
}
