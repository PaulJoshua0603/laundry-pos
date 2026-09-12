import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { NotificationEntry, Order, PaySettings, SmsTemplates } from "./types";

// The orders/notifications tables use a COMPOSITE primary key (user_id, id).
// PostgREST only infers the conflict target reliably when we name it, so be
// explicit — otherwise an upsert of an order that already exists can fail and
// the change silently never reaches the cloud.
const ORDER_CONFLICT = "user_id,id";

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
    amountPaid: row.amount_paid !== undefined && row.amount_paid !== null ? Number(row.amount_paid) : row.paid ? Number(row.total) : 0,
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
    amount_paid: o.amountPaid ?? (o.paid ? o.total : 0),
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
  const { error } = await supabase.from("orders").upsert(orderToRow(userId, order), { onConflict: ORDER_CONFLICT });
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
  // Chunk large imports so one oversized request can't fail the whole migration.
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from("orders").upsert(rows.slice(i, i + 200), { onConflict: ORDER_CONFLICT });
    if (error) throw error;
  }
}

/** Deletes many orders in one round trip (used by "Clear Day"). */
export async function cloudDeleteOrders(userId: string, orderIds: string[]) {
  if (!isSupabaseConfigured() || orderIds.length === 0) return;
  for (let i = 0; i < orderIds.length; i += 200) {
    const { error } = await supabase.from("orders").delete().eq("user_id", userId).in("id", orderIds.slice(i, i + 200));
    if (error) throw error;
  }
}

export async function cloudLoadPaySettings(userId: string): Promise<PaySettings | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.from("pay_settings").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { gcash: data.gcash, maya: data.maya };
}

export async function cloudSavePaySettings(userId: string, settings: PaySettings) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase
    .from("pay_settings")
    .upsert({ user_id: userId, gcash: settings.gcash, maya: settings.maya }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function cloudLoadSmsTemplates(userId: string): Promise<SmsTemplates | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.from("sms_templates").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { paid: data.paid, unpaid: data.unpaid };
}

export async function cloudSaveSmsTemplates(userId: string, templates: SmsTemplates) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase
    .from("sms_templates")
    .upsert({ user_id: userId, paid: templates.paid, unpaid: templates.unpaid }, { onConflict: "user_id" });
  if (error) throw error;
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
  const { error } = await supabase
    .from("notifications")
    .upsert(
      entries.slice(0, 200).map((n) => ({ id: n.id, user_id: userId, message: n.message, type: n.type, time: n.time, read: n.read })),
      { onConflict: ORDER_CONFLICT }
    );
  if (error) throw error;
}

export async function cloudClearNotifications(userId: string) {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.from("notifications").delete().eq("user_id", userId);
  if (error) throw error;
}

/* ═══════════════════════════════════════════════════════════════
   REALTIME
   Without this a device only ever shows the orders it loaded at
   boot: an order placed on the phone never appeared on the counter
   PC until a manual hard refresh — exactly the "orders don't sync"
   symptom. We subscribe to this user's own rows and let the caller
   refetch whenever anything changes.

   Requires realtime to be enabled for the orders table in Supabase
   (see supabase/schema.sql). If it isn't, the app still stays fresh
   via the focus/interval polling fallback in AppContext.
   ═══════════════════════════════════════════════════════════════ */
export function subscribeToOrders(userId: string, onChange: () => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    channel = supabase
      .channel(`orders-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` }, () => onChange())
      .subscribe();
  } catch {
    return () => {};
  }
  return () => {
    try {
      if (channel) supabase.removeChannel(channel);
    } catch {
      /* ignore teardown failures */
    }
  };
}
