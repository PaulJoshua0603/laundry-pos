import { Order, getBalance } from "./types";

/* ══════════════════════════════════════════════════════════════════
   RECEIPT -> 1-BIT RASTER

   Needed because the shop's Windows 10 laptop cannot install the POS58
   driver (permission denied), so `window.print()` has no printer to send
   to. Web Bluetooth is the only route left on that machine.

   The obvious alternative — ESC/POS *text* mode — would throw away the
   receipt's whole layout (the large customer name, the rules, the
   spacing). So the receipt is drawn onto a canvas at the printer's own
   resolution and sent as a bitmap instead, which reproduces it exactly.

   A 58mm head prints 384 dots across (48mm at 203dpi), so the canvas is
   384px wide and every size below is in printer dots, not CSS pixels.
   ══════════════════════════════════════════════════════════════════ */

export const RASTER_WIDTH = 384;

// Tight side margin — the head only covers 48mm of the 57mm paper, so every
// dot of the printable width is worth using.
const PAD = 4;
const CONTENT = RASTER_WIDTH - PAD * 2;

const FONT = '"Courier New", Courier, monospace';

function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString()}`;
}

/** Largest size at which `text` fits `maxWidth`, measured rather than assumed. */
function fitFontPx(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, max: number, min = 14): number {
  for (let size = max; size > min; size -= 1) {
    ctx.font = `bold ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  return min;
}

/**
 * Draws the receipt and returns the canvas.
 *
 * Mirrors what the printed page shows: customer name, date, item lines
 * with the unit price only when quantity is above one, total, payment,
 * balance when unpaid, a cut line, then the basket-tag name and feed.
 */
export function renderReceiptCanvas(order: Order, doc: Document = document): HTMLCanvasElement {
  // First pass on a scratch context to measure, so the canvas is exactly
  // as tall as the content — no trailing blank that the printer would
  // feed through for nothing.
  const scratch = doc.createElement("canvas").getContext("2d")!;

  const name = (order.name || "").trim().toUpperCase();
  // The name leads the receipt, so it gets nearly the same size as the basket
  // tag rather than sitting a third smaller.
  const headerPx = fitFontPx(scratch, name, CONTENT, 64);
  const tagPx = fitFontPx(scratch, name, CONTENT, 78);

  const BODY = 26;
  const SUB = 22;
  const TOTAL = 36;
  const LINE = Math.round(BODY * 1.55);

  let h = 0;
  h += 14 + headerPx + 12; // header name
  h += 10; // rule
  h += LINE; // date
  h += 10; // rule
  order.items.forEach((c) => {
    h += LINE;
    if (c.qty > 1) h += Math.round(SUB * 1.4);
    h += 6;
  });
  h += 10; // rule
  h += Math.round(TOTAL * 1.4); // total
  h += LINE; // payment
  if (!order.paid) h += LINE; // balance
  h += 26; // cut line
  h += 30 + tagPx + 30; // tag block
  h += 90; // trailing feed

  const canvas = doc.createElement("canvas");
  canvas.width = RASTER_WIDTH;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineJoin = "round";
  ctx.textBaseline = "alphabetic";

  // Every glyph is drawn filled AND stroked. A 1-bit thermal head prints a
  // dot or nothing, so the anti-aliased edge of a normal glyph is simply
  // discarded at threshold time and strokes come out a dot or two thinner
  // than drawn — which is why the first Bluetooth prints looked spindly.
  // Stroking widens the glyph before that happens, the raster equivalent of
  // the text-stroke the print stylesheet uses.
  const ink = (text: string, x: number, yy: number, px: number) => {
    ctx.lineWidth = Math.max(1.1, px * 0.07);
    ctx.fillText(text, x, yy);
    ctx.strokeText(text, x, yy);
  };

  let y = 0;

  const centre = (text: string, px: number, weight = "bold") => {
    ctx.font = `${weight} ${px}px ${FONT}`;
    const w = ctx.measureText(text).width;
    ink(text, (RASTER_WIDTH - w) / 2, y + px, px);
    y += px;
  };

  const row = (left: string, right: string, px = BODY) => {
    // The amount is never shrunk or clipped — it is the part that must stay
    // readable. If a long service name would run into it, that label alone
    // steps down until the pair fits.
    ctx.font = `bold ${px}px ${FONT}`;
    const rightW = ctx.measureText(right).width;
    const room = CONTENT - rightW - 8;

    let leftPx = px;
    while (leftPx > 13) {
      ctx.font = `bold ${leftPx}px ${FONT}`;
      if (ctx.measureText(left).width <= room) break;
      leftPx -= 1;
    }

    ctx.font = `bold ${leftPx}px ${FONT}`;
    ink(left, PAD, y + px, leftPx);
    ctx.font = `bold ${px}px ${FONT}`;
    ink(right, RASTER_WIDTH - PAD - rightW, y + px, px);
    y += LINE;
  };

  const rule = (thickness = 2) => {
    y += 4;
    ctx.fillRect(PAD, y, CONTENT, thickness);
    y += thickness + 4;
  };

  const dashed = (label: string) => {
    ctx.font = `bold 18px ${FONT}`;
    const text = `- - - - - ${label} - - - - -`;
    const w = ctx.measureText(text).width;
    ink(text, (RASTER_WIDTH - w) / 2, y + 18, 18);
    y += 26;
  };

  y += 14;
  centre(name, headerPx);
  y += 12;
  rule(3);

  row("Date", new Date(order.time).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }));
  rule();

  order.items.forEach((c) => {
    row(c.service.name, peso(c.service.price * c.qty));
    if (c.qty > 1) {
      ctx.font = `bold ${SUB}px ${FONT}`;
      ink(`${c.qty} x ${peso(c.service.price)}`, PAD, y + SUB, SUB);
      y += Math.round(SUB * 1.4);
    }
    y += 6;
  });

  rule(3);
  row("TOTAL", peso(order.total), TOTAL);

  const paidLabel = order.paidMethod
    ? ({ cash: "Cash", gcash: "GCash", maya: "Maya" } as Record<string, string>)[order.paidMethod]
    : "";
  row("Payment", order.paid ? paidLabel || "Paid" : "UNPAID");
  if (!order.paid) row("Balance due", peso(getBalance(order)));

  y += 10;
  dashed("CUT HERE");

  // Basket tag — the name alone, as large as will fit on one line.
  y += 30;
  centre(name, tagPx);
  y += 30;

  return canvas;
}

/**
 * Packs a canvas into an ESC/POS `GS v 0` raster bit image.
 *
 * One bit per dot, MSB first, 1 = black. Anything darker than mid-grey
 * becomes black: the canvas is drawn in pure black on white, so this is a
 * hard threshold rather than a dither — which is what a 1-bit thermal
 * head wants.
 */
export function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const bytesPerRow = Math.ceil(width / 8);
  const img = ctx.getImageData(0, 0, width, height).data;

  const body = new Uint8Array(bytesPerRow * height);
  for (let yy = 0; yy < height; yy++) {
    for (let xx = 0; xx < width; xx++) {
      const i = (yy * width + xx) * 4;
      // Luminance; alpha is always 255 here because the canvas is pre-filled.
      const lum = (img[i] * 299 + img[i + 1] * 587 + img[i + 2] * 114) / 1000;
      // Threshold deliberately high (not the usual 128). Anything the browser
      // anti-aliased darker than this becomes a dot, so glyph edges survive
      // instead of being dropped — the difference between a readable receipt
      // and the spindly one this first produced. 170 keeps counters open at
      // 20px body text; much higher and small letters fill in.
      if (lum < 170) body[yy * bytesPerRow + (xx >> 3)] |= 0x80 >> (xx & 7);
    }
  }

  const header = new Uint8Array([
    0x1d, 0x76, 0x30, 0x00, // GS v 0 m=0
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff,
  ]);

  const out = new Uint8Array(header.length + body.length);
  out.set(header, 0);
  out.set(body, header.length);
  return out;
}
