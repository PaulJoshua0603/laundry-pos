import { getUsers } from "./auth";
import { loadOrders, loadPaySettings, loadSmsTemplates, loadNotifications } from "./storage";
import { cloudLoadOrderIds, cloudSaveAllOrders, cloudSavePaySettings, cloudSaveSmsTemplates, cloudSaveNotifications } from "./cloudStorage";
import { Order } from "./types";

export interface LegacyAccountMatch {
  localUserId: string;
  name: string;
  email: string;
  business: string;
  orderCount: number;
}

/** Scans localStorage for legacy (pre-cloud) accounts matching an email. */
export function findLegacyAccountsByEmail(email: string): LegacyAccountMatch[] {
  try {
    const users = getUsers();
    return users
      .filter((u) => u.email.toLowerCase() === email.toLowerCase())
      .map((u) => ({
        localUserId: u.id,
        name: u.name,
        email: u.email,
        business: u.business,
        orderCount: loadOrders(u.id).length,
      }));
  } catch {
    return [];
  }
}

/** Lists every legacy local account found on this device, regardless of email. */
export function findAllLegacyAccounts(): LegacyAccountMatch[] {
  try {
    const users = getUsers();
    return users.map((u) => ({
      localUserId: u.id,
      name: u.name,
      email: u.email,
      business: u.business,
      orderCount: loadOrders(u.id).length,
    }));
  } catch {
    return [];
  }
}

/** Uploads one legacy local account's orders/settings into the given cloud user. */
export async function migrateLegacyAccountToCloud(localUserId: string, cloudUserId: string): Promise<{ ordersImported: number }> {
  const orders = loadOrders(localUserId);
  const paySettings = loadPaySettings(localUserId);
  const smsTemplates = loadSmsTemplates(localUserId);
  const notifications = loadNotifications(localUserId);

  await cloudSaveAllOrders(cloudUserId, orders);
  await cloudSavePaySettings(cloudUserId, paySettings);
  await cloudSaveSmsTemplates(cloudUserId, smsTemplates);
  await cloudSaveNotifications(cloudUserId, notifications);

  return { ordersImported: orders.length };
}

/* ══════════════════════════════════════════════════════════════════
   RECOVERY: find orders that exist in this browser but NOT in the cloud.

   Orders can end up local-only for several reasons: they were taken on a
   pre-cloud (local) account, they were written while a previous version
   silently swallowed a failed upload, or the device was offline before the
   retry queue existed. This scans EVERY `sudsup_orders_*` key in the
   browser — every account this device has ever held — and reports which
   orders the cloud is missing.

   Read-only. Nothing is uploaded, changed or deleted until the caller
   explicitly calls uploadMissingOrders().
   ══════════════════════════════════════════════════════════════════ */

export interface MissingOrdersReport {
  /** Distinct orders found across all local storage keys. */
  localTotal: number;
  /** Orders currently in the cloud for this account. */
  cloudTotal: number;
  /** Local orders with no matching id in the cloud. */
  missing: Order[];
  /** Revenue already collected on the missing orders, so the gap is visible. */
  missingRevenue: number;
  /** Per storage key, for tracing where the data lives. */
  byKey: { key: string; total: number; missing: number }[];
}

const ORDERS_KEY_PREFIX = "sudsup_orders_";

/** Every `sudsup_orders_*` key currently in this browser. */
export function localOrderKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(ORDERS_KEY_PREFIX));
  } catch {
    return [];
  }
}

export async function findOrdersMissingFromCloud(cloudUserId: string): Promise<MissingOrdersReport> {
  const cloudIds = await cloudLoadOrderIds(cloudUserId);

  const seen = new Map<string, Order>();
  const byKey: { key: string; total: number; missing: number }[] = [];

  localOrderKeys().forEach((key) => {
    // Reuse loadOrders so legacy rows get the same normalisation (status
    // renames, paid/amountPaid defaults) the app applies everywhere else.
    const userId = key.slice(ORDERS_KEY_PREFIX.length);
    let orders: Order[] = [];
    try {
      orders = loadOrders(userId);
    } catch {
      orders = [];
    }
    let missingHere = 0;
    orders.forEach((o) => {
      if (!o || !o.id) return;
      if (!cloudIds.has(o.id)) missingHere++;
      // Keep one copy per id. Prefer the record that looks most complete —
      // the one with the larger collected amount — so a stale duplicate
      // can't mask a settled payment.
      const existing = seen.get(o.id);
      if (!existing || (o.amountPaid || 0) > (existing.amountPaid || 0)) seen.set(o.id, o);
    });
    byKey.push({ key, total: orders.length, missing: missingHere });
  });

  const missing = Array.from(seen.values()).filter((o) => !cloudIds.has(o.id));
  return {
    localTotal: seen.size,
    cloudTotal: cloudIds.size,
    missing,
    missingRevenue: missing.reduce((s, o) => s + (o.amountPaid || 0), 0),
    byKey: byKey.sort((a, b) => b.total - a.total),
  };
}

/**
 * Uploads only the orders the cloud is missing.
 *
 * Purely additive: it upserts the given rows and never deletes, so orders
 * already in the cloud are left exactly as they are.
 */
export async function uploadMissingOrders(cloudUserId: string, missing: Order[]): Promise<number> {
  if (missing.length === 0) return 0;
  await cloudSaveAllOrders(cloudUserId, missing);
  return missing.length;
}
