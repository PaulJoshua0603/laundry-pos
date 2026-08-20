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
  { id: "w1", cat: "wash", icon: "🫧", name: "Regular Wash (1)", desc: " 38 mins wash 1 wash 2 rinse (3–5 kg) ", price: 160 },
  { id: "w2", cat: "wash", icon: "🫧", name: "Regular Wash (2)", desc: "38 mins wash 1 wash 2 rinse (6–7 kg)", price: 180 },
  { id: "w5", cat: "wash", icon: "🫧", name: "Regular Wash (2) Heavy", desc: "For heavy/bulky clothes (6–7 kg)", price: 190 },
  { id: "w3", cat: "wash", icon: "🛏️", name: "Premium Wash (1)", desc: "48 mins wash 1 wash 3 rinse (6–7 kg)", price: 200 },
  { id: "w6", cat: "wash", icon: "🌨️", name: "Premium Wash (2)", desc: "7 kg and up", price: 210 },
  { id: "w4", cat: "wash", icon: "🌨️", name: "Premium Wash (2)", desc: "Per load", price: 230 },
  { id: "d1", cat: "dry", icon: "☀️", name: "Regular Dry", desc: "Max 7 kgs / load", price: 60 },
  { id: "d2", cat: "dry", icon: "🌤️", name: "Dry Heavy", desc: "Max 8 kgs / load", price: 70 },
  { id: "d3", cat: "addon", icon: "⏱️", name: "Add Dry", desc: "+10 minutes dry only", price: 30 },
  { id: "a1", cat: "addon", icon: "🌸", name: "Downy Fabric Conditioner", desc: "Added to final rinse", price: 10 },
  { id: "a2", cat: "addon", icon: "✨", name: "Surf Fabric Softener", desc: "Added to final rinse", price: 10 },
  { id: "a3", cat: "addon", icon: "✨", name: "Del Fabric Softener", desc: "Added to final rinse", price: 10 },
  { id: "a4", cat: "addon", icon: "🧼", name: "Ariel Liquid Detergent", desc: "Extra detergent scoop", price: 15 },
  { id: "a5", cat: "addon", icon: "🌊", name: "Wings Liquid Detergent", desc: "Extra detergent scoop", price: 15 },
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
