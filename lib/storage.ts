import {
  DEFAULT_SMS_TEMPLATE_PAID,
  DEFAULT_SMS_TEMPLATE_UNPAID,
  Order,
  PaySettings,
  SmsTemplates,
} from "./types";

const ORDERS_PREFIX = "sudsup_orders_";
const PAYSETTINGS_PREFIX = "sudsup_paysettings_";
const SMSTEMPLATE_PREFIX = "sudsup_smstemplate_";
export const PRINTWIDTH_KEY = "sudsup_printer_mm";
export const THEME_KEY = "sudsup_theme";

export function ordersKey(userId?: string | null) {
  return ORDERS_PREFIX + (userId || "anon");
}
export function loadOrders(userId?: string | null): Order[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ordersKey(userId)) || "[]") || [];
    return raw.map((o: any) => ({
      ...o,
      type: o.type || "walkin",
      status: o.status === "done" ? "completed" : o.status === "pending" ? "washing" : o.status,
      paid: o.paid === undefined ? o.payment !== "later" : o.paid,
      paidMethod: o.paidMethod !== undefined ? o.paidMethod : o.paid === false ? null : o.payment,
      paidAt: o.paidAt || (o.paid === false ? null : o.time),
    }));
  } catch {
    return [];
  }
}
export function saveOrders(userId: string | null | undefined, orders: Order[]) {
  localStorage.setItem(ordersKey(userId), JSON.stringify(orders));
}

export function paySettingsKey(userId?: string | null) {
  return PAYSETTINGS_PREFIX + (userId || "anon");
}
export function loadPaySettings(userId?: string | null): PaySettings {
  const fallback: PaySettings = { gcash: { qr: null, number: "" }, maya: { qr: null, number: "" } };
  try {
    return JSON.parse(localStorage.getItem(paySettingsKey(userId)) || "null") || fallback;
  } catch {
    return fallback;
  }
}
export function savePaySettings(userId: string | null | undefined, settings: PaySettings) {
  localStorage.setItem(paySettingsKey(userId), JSON.stringify(settings));
}

export function smsTemplateKey(userId?: string | null) {
  return SMSTEMPLATE_PREFIX + (userId || "anon");
}
export function loadSmsTemplates(userId?: string | null): SmsTemplates {
  try {
    const raw = JSON.parse(localStorage.getItem(smsTemplateKey(userId)) || "{}");
    return { paid: raw.paid || DEFAULT_SMS_TEMPLATE_PAID, unpaid: raw.unpaid || DEFAULT_SMS_TEMPLATE_UNPAID };
  } catch {
    return { paid: DEFAULT_SMS_TEMPLATE_PAID, unpaid: DEFAULT_SMS_TEMPLATE_UNPAID };
  }
}
export function saveSmsTemplates(userId: string | null | undefined, templates: SmsTemplates) {
  localStorage.setItem(smsTemplateKey(userId), JSON.stringify(templates));
}
