import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { NotificationEntry, Order, PaySettings, SmsTemplates } from "./types";

function rowToOrder(row: any): Order {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    addr: row.addr || "",
    type: row.type,
    pickup: row.pickup,
    items: row.items || [],
    total: Number(row.total),
    payment: row.payment,
    time: row.time,
    status: row.status,
    paid: row.paid,
    paidMethod: row.paid_method,
    paidAt: row.paid_at,
    autoReady: row.auto_ready,
    shop: row.shop,
  };
}

function orderToRow(userId: string, o: Order) {
  return {
    id: o.id,
    user_id: userId,
    name: o.name,
    phone: o.phone || null,
    addr: o.addr || null,
    type: o.type,
    pickup: o.pickup,
    items: o.items,
    total: o.total,
    payment: o.payment,
    time: o.time,
    status: o.status,
    paid: o.paid,
    paid_method: o.paidMethod,
    paid_at: o.paidAt,
    auto_ready: o.autoReady || false,
    shop: o.shop || null,
  };
}

export async function cloudLoadOrders(userId: string): Promise<Order[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase.from("orders").select("*").eq("user_id", userId).order("time", { ascending: false });
  if (error) throw error;
  return (data || []).map(rowToOrder);
}

export async function cloudSaveOrder(userId: string, order: Order) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from("orders").upsert(orderToRow(userId, order));
  if (error) throw error;
}

export async function cloudDeleteOrder(userId: string, orderId: string) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from("orders").delete().eq("user_id", userId).eq("id", orderId);
  if (error) throw error;
}

export async function cloudSaveAllOrders(userId: string, orders: Order[]) {
  if (!isSupabaseConfigured() || orders.length === 0) return;
  // Never drop an order. If two local records share the same id (a legacy
  // bug), keep the first as-is and give the rest a new unique id so every
  // distinct order is preserved instead of being overwritten.
  const seen = new Set<string>();
  const deduped: Order[] = [];
  orders.forEach((o) => {
    if (!seen.has(o.id)) {
      seen.add(o.id);
      deduped.push(o);
    } else {
      let newId = o.id + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
      while (seen.has(newId)) newId = o.id + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
      seen.add(newId);
      deduped.push({ ...o, id: newId });
    }
  });
  const rows = deduped.map((o) => orderToRow(userId, o));
  const { error } = await supabase.from("orders").upsert(rows);
  if (error) throw error;
}

export async function cloudLoadPaySettings(userId: string): Promise<PaySettings | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.from("pay_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { gcash: data.gcash, maya: data.maya };
}

export async function cloudSavePaySettings(userId: string, settings: PaySettings) {
  if (!isSupabaseConfigured()) return;
  await supabase.from("pay_settings").upsert({ user_id: userId, gcash: settings.gcash, maya: settings.maya });
}

export async function cloudLoadSmsTemplates(userId: string): Promise<SmsTemplates | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.from("sms_templates").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { paid: data.paid, unpaid: data.unpaid };
}

export async function cloudSaveSmsTemplates(userId: string, templates: SmsTemplates) {
  if (!isSupabaseConfigured()) return;
  await supabase.from("sms_templates").upsert({ user_id: userId, paid: templates.paid, unpaid: templates.unpaid });
}

export async function cloudLoadNotifications(userId: string): Promise<NotificationEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("time", { ascending: false })
    .limit(200);
  return (data || []).map((r: any) => ({ id: r.id, message: r.message, type: r.type, time: r.time, read: r.read }));
}

export async function cloudSaveNotifications(userId: string, entries: NotificationEntry[]) {
  if (!isSupabaseConfigured() || entries.length === 0) return;
  await supabase
    .from("notifications")
    .upsert(entries.slice(0, 200).map((n) => ({ id: n.id, user_id: userId, message: n.message, type: n.type, time: n.time, read: n.read })));
}
