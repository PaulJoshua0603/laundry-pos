export interface NotificationEntry {
  id: string;
  message: string;
  type: "" | "success" | "error";
  time: string; // ISO string
  read: boolean;
}

export interface Service {
  id: string;
  cat: "wash" | "dry" | "addon";
  icon: string;
  name: string;
  desc: string;
  price: number;
}

export interface CartLine {
  service: Service;
  qty: number;
}

export function isLoadLine(c: CartLine): boolean {
  return c.service.cat === "wash" || c.service.cat === "dry";
}
// A "load" = one basket of laundry. Wash + Dry services are performed on the
// SAME load (not two separate loads), so counting wash-qty + dry-qty double
// counts. A load is represented by its wash step; if an order only has a dry
// step (no wash), fall back to the dry qty so it still counts as a load.
export function getLoadCount(items: CartLine[]): number {
  const washQty = items.reduce((n, c) => (c.service.cat === "wash" ? n + c.qty : n), 0);
  const dryQty = items.reduce((n, c) => (c.service.cat === "dry" ? n + c.qty : n), 0);
  return washQty > 0 ? washQty : dryQty;
}
export function isExtraLine(c: CartLine): boolean {
  return c.service.cat === "addon";
}
export function isFeeLine(c: CartLine): boolean {
  return c.service.id.startsWith("fee-");
}

export type OrderStatus =
  | "washing"
  | "drying"
  | "ready"
  | "storage"
  | "awaiting"
  | "completed"
  | "cancelled";

export type PaymentMethod = "cash" | "gcash" | "maya" | "later";
export type OrderType = "walkin" | "delivery";

export interface Order {
  id: string;
  name: string;
  phone: string;
  addr: string;
  type: OrderType;
  pickup: string | null; // ISO string
  items: CartLine[];
  total: number;
  payment: PaymentMethod;
  time: string; // ISO string
  status: OrderStatus;
  paid: boolean;
  paidMethod: Exclude<PaymentMethod, "later"> | null;
  paidAt: string | null;
  autoReady?: boolean;
  shop?: string;
}

// Cosmetic, receipt-friendly order number — sequential per calendar day,
// purely for display. The real `order.id` remains the unique key used for
// syncing/storage; this is never persisted, just derived at render time.
export function getDailyOrderNo(order: Order, allOrders: Order[]): number {
  const day = order.time.slice(0, 10); // YYYY-MM-DD
  const sameDay = allOrders
    .filter((o) => o.time.slice(0, 10) === day)
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  const idx = sameDay.findIndex((o) => o.id === order.id);
  return idx === -1 ? sameDay.length + 1 : idx + 1;
}

export interface PaySettingsEntry {
  qr: string | null;
  number: string;
}
export interface PaySettings {
  gcash: PaySettingsEntry;
  maya: PaySettingsEntry;
}

export interface SmsTemplates {
  paid: string;
  unpaid: string;
}

export interface User {
  id: string;
  name: string;
  business: string;
  email: string;
  provider?: "google";
  hash: string | null;
  salt: string | null;
  createdAt: string;
}

export interface Session {
  userId: string;
  name: string;
  email: string;
  business: string;
}

export const SERVICES: Service[] = [
  { id: "w1", cat: "wash", icon: "🫧", name: "Regular Wash", desc: "Standard wash cycle", price: 80 },
  { id: "w7", cat: "wash", icon: "🫧", name: "Regular Wash", desc: "38 mins wash 1 wash 2 rinse (3–5 kg)", price: 160 },
  { id: "w2", cat: "wash", icon: "🫧", name: "Regular Wash (2)", desc: "38 mins wash 1 wash 2 rinse (6–7 kg)", price: 180 },
  { id: "w5", cat: "wash", icon: "🫧", name: "Regular Wash (2) Heavy", desc: "For heavy/bulky clothes (6–7 kg)", price: 190 },
  { id: "w3", cat: "wash", icon: "🛏️", name: "Premium Wash", desc: "Extra rinse, gentler cycle", price: 100 },
  { id: "w4", cat: "wash", icon: "🌨️", name: "Premium Wash (2)", desc: "Per load", price: 200 },
  { id: "w6", cat: "wash", icon: "🌨️", name: "Premium Wash (2)", desc: "7 kg and up", price: 210 },
  { id: "d1", cat: "dry", icon: "☀️", name: "Regular Dry", desc: "Max 7 kgs / load", price: 80 },
  { id: "d2", cat: "dry", icon: "🌤️", name: "Heavy Dry", desc: "Max 8 kgs / load", price: 100 },
  { id: "d3", cat: "addon", icon: "⏱️", name: "Add Dry", desc: "+10 minutes dry only", price: 30 },
  { id: "a1", cat: "addon", icon: "🌸", name: "Downy Fabric Conditioner", desc: "Added to final rinse", price: 10 },
  { id: "a2", cat: "addon", icon: "✨", name: "Surf Fabric Softener", desc: "Added to final rinse", price: 10 },
  { id: "a3", cat: "addon", icon: "✨", name: "Del Fabric Softener", desc: "Added to final rinse", price: 10 },
  { id: "a4", cat: "addon", icon: "🧼", name: "Ariel Liquid Detergent", desc: "Extra detergent scoop", price: 15 },
  { id: "a5", cat: "addon", icon: "🌊", name: "Wings Liquid Detergent", desc: "Extra detergent scoop", price: 10 },
  { id: "a6", cat: "addon", icon: "🧴", name: "Zonrox", desc: "Extra detergent scoop", price: 25 },
];

export const STATUS_OPTIONS: { id: OrderStatus; label: string; icon: string; cls: string }[] = [
  { id: "washing", label: "Washing", icon: "🫧", cls: "status-washing" },
  { id: "drying", label: "Drying", icon: "☀️", cls: "status-drying" },
  { id: "ready", label: "Ready for Pickup", icon: "✅", cls: "status-ready" },
  { id: "storage", label: "On Storage", icon: "📦", cls: "status-storage" },
  { id: "awaiting", label: "Awaiting Pickup", icon: "⏳", cls: "status-awaiting" },
  { id: "completed", label: "Picked Up", icon: "🏁", cls: "status-completed" },
  { id: "cancelled", label: "Cancelled", icon: "✕", cls: "status-cancelled" },
];
export const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.id, s])) as Record<
  OrderStatus,
  (typeof STATUS_OPTIONS)[number]
>;

export const ORDER_TYPES: Record<OrderType, { label: string; icon: string }> = {
  walkin: { label: "Walk-in", icon: "🚶" },
  delivery: { label: "Delivery", icon: "🛵" },
};

export const AUTO_READY_MS = 60 * 60 * 1000;
export const DEFAULT_SMS_TEMPLATE_PAID =
  "Hi {name}! Your laundry order {orderId} at {shop} is now ready for pickup. Total: {total} (paid). See you soon! 🫧";
export const DEFAULT_SMS_TEMPLATE_UNPAID =
  "Hi {name}! Your laundry order {orderId} at {shop} is ready for pickup. Balance due: {total} — please settle upon pickup. Thank you! 🫧";

export const BUSINESS_HOURS = { openHour: 6, closeHour: 20, label: "Mon–Sun · 6:00 AM–8:00 PM" };
