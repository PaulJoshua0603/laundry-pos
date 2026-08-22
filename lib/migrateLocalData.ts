import { getUsers } from "./auth";
import { loadOrders, loadPaySettings, loadSmsTemplates, loadNotifications } from "./storage";
import { cloudSaveAllOrders, cloudSavePaySettings, cloudSaveSmsTemplates, cloudSaveNotifications } from "./cloudStorage";

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
