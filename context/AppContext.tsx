"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AUTO_READY_MS,
  CartLine,
  DEFAULT_SMS_TEMPLATE_PAID,
  DEFAULT_SMS_TEMPLATE_UNPAID,
  NotificationEntry,
  Order,
  OrderStatus,
  PaySettings,
  PaymentMethod,
  STATUS_MAP,
  SERVICES,
  Session,
  SmsTemplates,
  User,
} from "@/lib/types";
import {
  clearSession as authClearSession,
  getSession,
  getUsers,
  hashPassword,
  isValidEmail,
  makeUserId,
  saveUsers,
  setSession as authSetSession,
  toSession,
} from "@/lib/auth";
import {
  loadOrders,
  loadPaySettings,
  loadSmsTemplates,
  loadNotifications,
  saveOrders,
  savePaySettings as persistPaySettings,
  saveSmsTemplates as persistSmsTemplates,
  saveNotifications,
  PRINTWIDTH_KEY,
  THEME_KEY,
} from "@/lib/storage";
import {
  cloudLogin,
  cloudLogout,
  cloudRegister,
  cloudSendPasswordReset,
  getCloudSession,
  isSupabaseConfigured,
} from "@/lib/cloudAuth";
import {
  cloudClearNotifications,
  cloudDeleteOrders,
  cloudLoadNotifications,
  cloudLoadOrders,
  cloudLoadPaySettings,
  cloudLoadSmsTemplates,
  cloudSaveAllOrders,
  cloudSaveNotifications,
  cloudSavePaySettings,
  cloudSaveSmsTemplates,
  subscribeToOrders,
} from "@/lib/cloudStorage";
import {
  flushQueue,
  onPendingChange,
  pendingCount,
  pendingOps,
  queueDeleteOrder,
  queueSaveOrder,
  readConfirmedCloudIds,
  stopRetries,
  writeConfirmedCloudIds,
} from "@/lib/syncQueue";
import { findLegacyAccountsByEmail, LegacyAccountMatch, migrateLegacyAccountToCloud } from "@/lib/migrateLocalData";
import { isBusinessToday } from "@/lib/format";

export type ViewId = "pos" | "orders" | "unpaid" | "daily" | "summary" | "sales" | "payments" | "rawdata";
export type ToastType = "" | "success" | "error";

interface ToastState {
  msg: string;
  type: ToastType;
  key: number;
}

interface AppContextValue {
  // screen / auth
  booted: boolean;
  loggedIn: boolean;
  session: Session | null;
  authTab: "login" | "register";
  setAuthTab: (t: "login" | "register") => void;
  authError: string;
  setAuthError: (s: string) => void;
  register: (data: { name: string; business: string; email: string; pass: string; pass2: string }) => Promise<boolean>;
  login: (data: { email: string; pass: string }) => Promise<boolean>;
  forgotPassword: (data: { email: string; pass: string; pass2: string }) => Promise<{ ok: boolean; msg?: string }>;
  logout: () => void;

  // cloud backup
  cloudConfigured: boolean;
  cloudActive: boolean;
  /** Orders still waiting to reach the cloud (queued offline / after a failure). */
  pendingSync: number;
  /** True while orders are being refetched from the cloud. */
  refreshing: boolean;
  /** Pulls the latest orders from the cloud and flushes any queued writes. */
  refreshFromCloud: () => Promise<void>;
  legacyMatches: LegacyAccountMatch[];
  importLegacyAccount: (localUserId: string) => Promise<void>;
  importPastedOrders: (raw: string) => Promise<{ ok: boolean; msg: string }>;

  // theme
  theme: "dark" | "light";
  toggleTheme: () => void;

  // toast
  toast: ToastState | null;
  showToast: (msg: string, type?: ToastType) => void;

  // notification history
  notifications: NotificationEntry[];
  unreadCount: number;
  markNotificationsRead: () => void;
  clearNotifications: () => void;

  // nav
  activeView: ViewId;
  switchView: (v: ViewId) => void;

  // catalog / cart
  cart: CartLine[];
  addToCart: (id: string) => void;
  addCustomFee: (amount: number, label?: string) => void;
  changeQty: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  clearCart: (silent?: boolean) => void;
  cartTotal: number;
  payment: PaymentMethod;
  selectPayment: (p: PaymentMethod) => void;

  // orders
  orders: Order[];
  checkout: (customer: {
    name: string;
    phone: string;
    addr: string;
    type: "walkin" | "delivery";
    pickup: string;
    amountPaid?: number;
  }) => Order | null;
  cancelOrder: (id: string) => void;
  deleteOrder: (id: string) => void;
  /** Deletes every order from the current business day, locally AND in the cloud. */
  clearDayOrders: () => void;
  markOrderPaid: (id: string, method: "cash" | "gcash" | "maya") => void;
  addPartialPayment: (id: string, amount: number, method: "cash" | "gcash" | "maya") => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;
  updateOrderDetails: (
    id: string,
    patch: {
      name: string;
      phone: string;
      addr: string;
      type: "walkin" | "delivery";
      pickup: string;
      items?: CartLine[];
      paid?: boolean;
      paidMethod?: "cash" | "gcash" | "maya" | null;
      amountPaid?: number;
    }
  ) => void;

  // receipt modal
  receiptOrder: Order | null;
  showReceipt: (order: Order) => void;
  closeReceipt: () => void;

  // printer paper width
  printerMm: number;
  printerH: number;
  setPrinterWidth: (mm: number, h?: number) => void;

  // pay settings
  paySettings: PaySettings;
  saveGcashMaya: (method: "gcash" | "maya", number: string, qr?: string | null) => void;
  clearPayMethod: (method: "gcash" | "maya") => void;

  // sms templates
  smsTemplates: SmsTemplates;
  saveSmsTemplate: (which: "paid" | "unpaid", value: string) => void;
  resetSmsTemplate: (which: "paid" | "unpaid") => void;
  sendPickupSms: (id: string) => void;

  // sales tracking
  salesPeriod: "today" | "week" | "month" | "year";
  setSalesPeriod: (p: "today" | "week" | "month" | "year") => void;
  salesOffset: number;
  setSalesOffset: (n: number | ((prev: number) => number)) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState(false);
  const [session, setSessionState] = useState<Session | null>(null);
  const [cloudActive, setCloudActive] = useState(false);
  const [legacyMatches, setLegacyMatches] = useState<LegacyAccountMatch[]>([]);
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [activeView, setActiveView] = useState<ViewId>("pos");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [orders, setOrders] = useState<Order[]>([]);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [printerMm, setPrinterMm] = useState(58);
  const [printerH, setPrinterH] = useState(210);
  const [paySettings, setPaySettings] = useState<PaySettings>({ gcash: { qr: null, number: "" }, maya: { qr: null, number: "" } });
  // Lazy initialiser: reading localStorage during every render is wasted work
  // and runs on the server too, where it can only ever return the defaults.
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplates>(() => loadSmsTemplates());
  const [salesPeriod, setSalesPeriod] = useState<"today" | "week" | "month" | "year">("today");
  const [salesOffset, setSalesOffset] = useState(0);
  const [pendingSync, setPendingSync] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const toastTimer = useRef<any>(null);
  const feeCounter = useRef(0);
  const autoReadyNotice = useRef(0);
  // Persistence needs the *current* session, but must not re-create every
  // callback whenever the session object changes identity. A ref keeps the
  // callbacks stable while still reading fresh values.
  const sessionRef = useRef<Session | null>(null);
  const cloudRef = useRef(false);
  const ordersRef = useRef<Order[]>([]);
  const paySettingsRef = useRef<PaySettings>(paySettings);
  const smsTemplatesRef = useRef<SmsTemplates>(smsTemplates);
  const showToastRef = useRef<((msg: string, type?: ToastType) => void) | null>(null);
  sessionRef.current = session;
  cloudRef.current = cloudActive;
  ordersRef.current = orders;
  paySettingsRef.current = paySettings;
  smsTemplatesRef.current = smsTemplates;

  const showToast = useCallback((msg: string, type: ToastType = "") => {
    setToast({ msg, type, key: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);

    const entry: NotificationEntry = {
      id: "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      message: msg,
      type,
      time: new Date().toISOString(),
      read: false,
    };
    // Pure updater — persistence happens in the effect below. Doing I/O inside
    // a state updater double-fires under React StrictMode and wrote to the
    // wrong place in cloud mode (getSession() is null for cloud sessions, so
    // notifications were never saved at all).
    setNotifications((prev) => [entry, ...prev].slice(0, 200));
  }, []);
  showToastRef.current = showToast;

  /* ─── BOOT: restore theme + session ─── */
  useEffect(() => {
    (async () => {
      try {
        const savedTheme = (localStorage.getItem(THEME_KEY) as "dark" | "light") || null;
        const theme = savedTheme || (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
        setTheme(theme);
        document.documentElement.setAttribute("data-theme", theme);

        const savedMm = parseInt(localStorage.getItem(PRINTWIDTH_KEY) || "", 10) || 58;
        const savedH = parseInt(localStorage.getItem(PRINTWIDTH_KEY + "_h") || "", 10) || 210;
        setPrinterMm(savedMm);
        setPrinterH(savedH);

        // Prefer a cloud session (Supabase) when configured — this is the
        // go-forward, multi-device-safe path. Falls back to the legacy
        // localStorage-only account system so existing local users keep
        // working exactly as before.
        if (isSupabaseConfigured()) {
          const cloudSession = await getCloudSession();
          if (cloudSession) {
            setSessionState(cloudSession);
            setCloudActive(true);
            // Push anything left in the outbox from a previous session (orders
            // taken while offline, or writes that failed last time) BEFORE
            // reading, or the fetch below would overwrite them and the orders
            // would appear to have vanished.
            await flushQueue(cloudSession.userId);
            const [cOrders, cNotifs, cPay, cSms] = await Promise.all([
              cloudLoadOrders(cloudSession.userId),
              cloudLoadNotifications(cloudSession.userId),
              cloudLoadPaySettings(cloudSession.userId),
              cloudLoadSmsTemplates(cloudSession.userId),
            ]);
            setOrders(cOrders);
            setNotifications(cNotifs);
            if (cPay) setPaySettings(cPay);
            if (cSms) setSmsTemplates(cSms);
            setBooted(true);
            return;
          }
        }

        const s = getSession();
        if (s && getUsers().some((u) => u.id === s.userId)) {
          setSessionState(s);
          setCloudActive(false);
          setOrders(loadOrders(s.userId));
          setNotifications(loadNotifications(s.userId));
          setPaySettings(loadPaySettings(s.userId));
          setSmsTemplates(loadSmsTemplates(s.userId));
        } else {
          authClearSession();
        }
      } catch {
        /* ignore */
      }
      setBooted(true);
    })();
  }, []);

  /* ─── PERSISTENCE ───
     Orders and notifications are mirrored to localStorage from an effect
     rather than from inside state updaters. Updaters must stay pure: React
     StrictMode invokes them twice, which previously meant duplicate writes
     and duplicate cloud requests for a single user action. */
  useEffect(() => {
    if (!booted || !session) return;
    saveOrders(session.userId, orders);
  }, [booted, session, orders]);

  useEffect(() => {
    if (!booted || !session) return;
    saveNotifications(session.userId, notifications);
    if (!cloudActive || notifications.length === 0) return;
    // Debounced: every toast appends a notification, and each cloud write
    // upserts the whole (up to 200 row) history. Without this, a busy minute
    // at the till fires a large request per toast.
    const userId = session.userId;
    const id = setTimeout(() => {
      cloudSaveNotifications(userId, notifications).catch(() => {
        /* history is non-critical — the next change retries it */
      });
    }, 3000);
    return () => clearTimeout(id);
  }, [booted, session, cloudActive, notifications]);

  /* ─── OUTBOX ───
     Surface how many order writes are still waiting to reach the cloud, and
     drain the queue whenever the connection comes back. */
  useEffect(() => {
    if (!session || !cloudActive) {
      setPendingSync(0);
      return;
    }
    setPendingSync(pendingCount(session.userId));
    const off = onPendingChange(setPendingSync);
    void flushQueue(session.userId);

    const onOnline = () => void flushQueue(session.userId);
    window.addEventListener("online", onOnline);
    const id = setInterval(onOnline, 60 * 1000);
    return () => {
      off();
      window.removeEventListener("online", onOnline);
      clearInterval(id);
      stopRetries();
    };
  }, [session, cloudActive]);

  /* ─── LIVE REFRESH ───
     Pull the authoritative order list back down from the cloud. Called on a
     realtime change, when the tab regains focus, and on a slow poll. Without
     this the only way to see an order placed on another device was a manual
     hard refresh (Ctrl+Shift+R). */
  const refreshFromCloud = useCallback(async () => {
    const s = sessionRef.current;
    if (!s || !cloudRef.current) return;
    setRefreshing(true);
    try {
      // Push anything queued first, so a refetch can't overwrite local work
      // that hasn't been uploaded yet.
      await flushQueue(s.userId);
      const fresh = await cloudLoadOrders(s.userId);

      const freshIds = new Set(fresh.map((o) => o.id));
      const stillQueued = pendingOps(s.userId);
      const queuedDeletes = new Set(stillQueued.filter((op) => op.kind === "delete").map((op) => op.orderId));
      const queuedSaves = stillQueued.filter((op): op is Extract<typeof op, { kind: "save" }> => op.kind === "save");
      const queuedSaveIds = new Set(queuedSaves.map((op) => op.orderId));

      // SELF-HEALING RECONCILIATION
      //
      // For every order we hold locally that the cloud doesn't have, decide
      // which of two very different things happened — see the ledger in
      // syncQueue.ts. Getting this wrong either loses real orders or
      // resurrects deleted ones.
      const confirmed = readConfirmedCloudIds(s.userId);
      const strays: Order[] = [];
      ordersRef.current.forEach((o) => {
        if (freshIds.has(o.id) || queuedSaveIds.has(o.id) || queuedDeletes.has(o.id)) return;
        if (confirmed.has(o.id)) return; // was in the cloud before → deleted elsewhere → honour it
        // Never seen in the cloud: this local copy is the only one. Keep it on
        // screen and push it back up rather than letting the refetch erase it.
        strays.push(o);
        queueSaveOrder(s.userId, o);
      });

      const merged = [
        ...queuedSaves.map((op) => op.order),
        ...strays,
        ...fresh.filter((o) => !queuedSaveIds.has(o.id) && !queuedDeletes.has(o.id)),
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

      // Record what the cloud definitely holds, for the next reconciliation.
      writeConfirmedCloudIds(s.userId, freshIds);

      if (strays.length > 0) {
        showToastRef.current?.(
          `⚠️ Found ${strays.length} order${strays.length !== 1 ? "s" : ""} not backed up yet — re-uploading now.`,
          "error"
        );
      }

      // Only touch state when something actually differs. A blind setOrders on
      // every poll re-rendered the whole app (and every object identity) twice
      // a minute for no reason.
      if (JSON.stringify(merged) !== JSON.stringify(ordersRef.current)) {
        ordersRef.current = merged;
        setOrders(merged);
      }
    } catch {
      /* offline or transient — the next trigger tries again */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!booted || !session || !cloudActive) return;

    const unsubscribe = subscribeToOrders(session.userId, () => {
      void refreshFromCloud();
    });

    // Belt-and-braces fallback for when realtime isn't enabled on the table
    // or the socket drops: refetch on focus/visibility and on a slow poll.
    const onFocus = () => {
      if (document.visibilityState === "visible") void refreshFromCloud();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("online", onFocus);
    const id = setInterval(() => void refreshFromCloud(), 90 * 1000);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("online", onFocus);
      clearInterval(id);
    };
  }, [booted, session, cloudActive, refreshFromCloud]);

  /* ─── Auto-advance washing/drying -> ready after 1hr ─── */
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const now = Date.now();
      setOrders((prev) => {
        const promoted: Order[] = [];
        const next = prev.map((o) => {
          if ((o.status === "washing" || o.status === "drying") && now - new Date(o.time).getTime() >= AUTO_READY_MS) {
            const updated = { ...o, status: "ready" as OrderStatus, autoReady: true };
            promoted.push(updated);
            return updated;
          }
          return o;
        });
        if (promoted.length === 0) return prev;
        // Only the orders promoted on THIS tick get uploaded. The old code
        // re-uploaded every order ever auto-readied, every single tick.
        if (cloudRef.current) promoted.forEach((o) => queueSaveOrder(session.userId, o));
        autoReadyNotice.current = promoted.length;
        return next;
      });
    };
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [session]);

  // Toasting from inside the updater above would fire twice under StrictMode,
  // so the tick just records what happened and we announce it here.
  useEffect(() => {
    if (autoReadyNotice.current > 0) {
      const n = autoReadyNotice.current;
      autoReadyNotice.current = 0;
      showToast(
        n === 1
          ? "✅ An order was auto-marked Ready for Pickup (1 hr elapsed)"
          : `✅ ${n} orders were auto-marked Ready for Pickup (1 hr elapsed)`,
        "success"
      );
    }
  }, [orders, showToast]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  /* ─── AUTH ─── */
  const register = useCallback(
    async (data: { name: string; business: string; email: string; pass: string; pass2: string }) => {
      setAuthError("");
      const name = data.name.trim();
      const business = data.business.trim();
      const email = data.email.trim().toLowerCase();
      if (name.length < 2 || !isValidEmail(email) || data.pass.length < 8 || data.pass !== data.pass2) {
        return false;
      }

      if (isSupabaseConfigured()) {
        const res = await cloudRegister({ name, business, email, pass: data.pass });
        if (!res.ok || !res.session) {
          setAuthError(res.msg || "Couldn't create your account.");
          return false;
        }
        const sess = res.session;
        setSessionState(sess);
        setCloudActive(true);

        // Auto-import any matching local (pre-cloud) data for this email,
        // so nothing already saved on this device gets left behind.
        const matches = findLegacyAccountsByEmail(email).filter((m) => m.orderCount > 0);
        let importedOrders = 0;
        for (const m of matches) {
          try {
            const { ordersImported } = await migrateLegacyAccountToCloud(m.localUserId, sess.userId);
            importedOrders += ordersImported;
          } catch {
            /* ignore individual migration failures */
          }
        }

        const [cOrders, cNotifs, cPay, cSms] = await Promise.all([
          cloudLoadOrders(sess.userId),
          cloudLoadNotifications(sess.userId),
          cloudLoadPaySettings(sess.userId),
          cloudLoadSmsTemplates(sess.userId),
        ]);
        setOrders(cOrders);
        setNotifications(cNotifs);
        if (cPay) setPaySettings(cPay);
        if (cSms) setSmsTemplates(cSms);
        setLegacyMatches([]);
        showToast(
          importedOrders > 0
            ? `Welcome, ${name.split(" ")[0]}! Cloud account created and ${importedOrders} saved order${importedOrders !== 1 ? "s" : ""} backed up. ☁️`
            : `Welcome, ${name.split(" ")[0]}! Cloud account created — your data now backs up automatically. ☁️`,
          "success"
        );
        return true;
      }

      const users = getUsers();
      if (users.some((u) => u.email === email)) {
        setAuthError("An account with that email already exists. Try logging in instead.");
        return false;
      }
      const { hash, salt } = await hashPassword(data.pass);
      const user: User = {
        id: makeUserId(),
        name,
        business: business || "My Laundry Shop",
        email,
        hash,
        salt,
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      saveUsers(users);
      const sess = toSession(user);
      authSetSession(sess);
      setSessionState(sess);
      setCloudActive(false);
      setOrders(loadOrders(sess.userId));
      setNotifications(loadNotifications(sess.userId));
      setPaySettings(loadPaySettings(sess.userId));
      setSmsTemplates(loadSmsTemplates(sess.userId));
      showToast(`Welcome, ${name.split(" ")[0]}! Account created.`, "success");
      return true;
    },
    [showToast]
  );

  const login = useCallback(
    async (data: { email: string; pass: string }) => {
      setAuthError("");
      const email = data.email.trim().toLowerCase();
      if (!email || !data.pass) {
        setAuthError("Enter your email and password.");
        return false;
      }

      if (isSupabaseConfigured()) {
        const res = await cloudLogin({ email, pass: data.pass });
        if (res.ok && res.session) {
          const sess = res.session;
          setSessionState(sess);
          setCloudActive(true);
          await flushQueue(sess.userId);
          const [cOrders, cNotifs, cPay, cSms] = await Promise.all([
            cloudLoadOrders(sess.userId),
            cloudLoadNotifications(sess.userId),
            cloudLoadPaySettings(sess.userId),
            cloudLoadSmsTemplates(sess.userId),
          ]);
          setOrders(cOrders);
          setNotifications(cNotifs);
          if (cPay) setPaySettings(cPay);
          if (cSms) setSmsTemplates(cSms);

          // Surface any local-only data for this email so it can be
          // imported with one click from Payment Methods, in case it
          // wasn't picked up automatically at registration time.
          const matches = findLegacyAccountsByEmail(email).filter((m) => m.orderCount > 0);
          setLegacyMatches(cOrders.length === 0 ? matches : []);

          showToast(`Welcome back, ${sess.name.split(" ")[0]}! ☁️`, "success");
          return true;
        }
        // Fall through to legacy local login below (covers accounts
        // created before cloud backup existed, or when the cloud
        // account doesn't exist yet for this email).
      }

      const users = getUsers();
      const user = users.find((u) => u.email === email);
      if (!user) {
        setAuthError(isSupabaseConfigured() ? "No account found with that email." : "No account found with that email.");
        return false;
      }
      const { hash } = await hashPassword(data.pass, user.salt || undefined);
      if (hash !== user.hash) {
        setAuthError("Incorrect password.");
        return false;
      }
      const sess = toSession(user);
      authSetSession(sess);
      setSessionState(sess);
      setCloudActive(false);
      setOrders(loadOrders(sess.userId));
      setNotifications(loadNotifications(sess.userId));
      setPaySettings(loadPaySettings(sess.userId));
      setSmsTemplates(loadSmsTemplates(sess.userId));
      showToast(
        isSupabaseConfigured()
          ? `Welcome back, ${user.name.split(" ")[0]}! (Signed in locally — add Cloud Backup in Payment Methods.)`
          : `Welcome back, ${user.name.split(" ")[0]}!`
      );
      return true;
    },
    [showToast]
  );

  const forgotPassword = useCallback(async (data: { email: string; pass: string; pass2: string }) => {
    const email = data.email.trim().toLowerCase();
    if (!isValidEmail(email)) return { ok: false, msg: "Enter a valid email address." };

    if (isSupabaseConfigured()) {
      const res = await cloudSendPasswordReset(email);
      if (res.ok) return { ok: true, msg: "Check your email for a password reset link." };
      // fall through to local reset if this email isn't a cloud account
    }

    if (data.pass.length < 8) return { ok: false, msg: "At least 8 characters." };
    if (data.pass !== data.pass2) return { ok: false, msg: "Passwords don't match." };
    const users = getUsers();
    const idx = users.findIndex((u) => u.email === email);
    if (idx === -1) return { ok: false, msg: "No account found with that email." };
    const { hash, salt } = await hashPassword(data.pass);
    users[idx].hash = hash;
    users[idx].salt = salt;
    saveUsers(users);
    return { ok: true };
  }, []);

  const logout = useCallback(() => {
    const s = sessionRef.current;
    // Flush anything still queued before dropping the session, so a sign-out
    // at closing time can't strand the day's last orders on this device.
    if (cloudActive && s) void flushQueue(s.userId);
    if (cloudActive) cloudLogout().catch(() => {});
    stopRetries();
    authClearSession();
    setSessionState(null);
    setCloudActive(false);
    setLegacyMatches([]);
    setOrders([]);
    setCart([]);
    setNotifications([]);
    setActiveView("pos");
    // Reset per-account settings too — these used to persist across a sign-out,
    // so the next person to log in saw the previous shop's QR codes and
    // SMS templates.
    setPaySettings({ gcash: { qr: null, number: "" }, maya: { qr: null, number: "" } });
    setSmsTemplates({ paid: DEFAULT_SMS_TEMPLATE_PAID, unpaid: DEFAULT_SMS_TEMPLATE_UNPAID });
    setPendingSync(0);
    showToast("Signed out");
  }, [cloudActive, showToast]);

  const importLegacyAccount = useCallback(
    async (localUserId: string) => {
      if (!session || !cloudActive) return;
      try {
        const { ordersImported } = await migrateLegacyAccountToCloud(localUserId, session.userId);
        const [cOrders, cPay, cSms] = await Promise.all([
          cloudLoadOrders(session.userId),
          cloudLoadPaySettings(session.userId),
          cloudLoadSmsTemplates(session.userId),
        ]);
        setOrders(cOrders);
        if (cPay) setPaySettings(cPay);
        if (cSms) setSmsTemplates(cSms);
        setLegacyMatches((prev) => prev.filter((m) => m.localUserId !== localUserId));
        showToast(`☁️ Imported ${ordersImported} order${ordersImported !== 1 ? "s" : ""} into the cloud`, "success");
      } catch (err: any) {
        showToast("❌ Import failed: " + (err?.message || "unknown error"), "error");
      }
    },
    [session, cloudActive, showToast]
  );

  // Import orders copy-pasted (as JSON) from another device/site's
  // localStorage — used when the original data lives on a different
  // domain (e.g. an old Netlify deploy) that this browser can't read.
  const importPastedOrders = useCallback(
    async (raw: string): Promise<{ ok: boolean; msg: string }> => {
      if (!session || !cloudActive) return { ok: false, msg: "Log in with your cloud account first." };
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false, msg: "That doesn't look like valid JSON. Paste the exact array you copied." };
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return { ok: false, msg: "Expected a non-empty array of orders." };
      }
      try {
        await cloudSaveAllOrders(session.userId, parsed as Order[]);
        const cOrders = await cloudLoadOrders(session.userId);
        setOrders(cOrders);
        showToast(`☁️ Imported ${parsed.length} pasted order${parsed.length !== 1 ? "s" : ""} into the cloud`, "success");
        return { ok: true, msg: `Imported ${parsed.length} orders.` };
      } catch (err: any) {
        return { ok: false, msg: err?.message || "Import failed." };
      }
    },
    [session, cloudActive, showToast]
  );

  /* ─── CART ─── */
  const addToCart = useCallback(
    (id: string) => {
      const service = SERVICES.find((s) => s.id === id);
      if (!service) return;
      setCart((prev) => {
        const existing = prev.find((c) => c.service.id === id);
        if (existing) return prev.map((c) => (c.service.id === id ? { ...c, qty: c.qty + 1 } : c));
        return [...prev, { service, qty: 1 }];
      });
      showToast(`${service.icon} ${service.name} added`, "success");
    },
    [showToast]
  );

  const addCustomFee = useCallback(
    (amount: number, label?: string) => {
      if (!amount || amount <= 0) return;
      const service = {
        id: `fee-${Date.now()}-${(feeCounter.current++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        cat: "addon" as const,
        icon: "➕",
        name: label?.trim() || "Additional Fee",
        desc: "Manual entry",
        price: amount,
      };
      setCart((prev) => [...prev, { service, qty: 1 }]);
      showToast(`➕ Additional Fee ₱${amount.toLocaleString()} added`, "success");
    },
    [showToast]
  );

  const changeQty = useCallback((id: string, delta: number) => {
    setCart((prev) => {
      const next = prev
        .map((c) => (c.service.id === id ? { ...c, qty: c.qty + delta } : c))
        .filter((c) => c.qty > 0);
      return next;
    });
  }, []);

  const removeFromCart = useCallback((id: string) => {
    setCart((prev) => prev.filter((c) => c.service.id !== id));
  }, []);

  const clearCart = useCallback(
    (silent?: boolean) => {
      setCart((prev) => {
        if (prev.length === 0 && silent) return prev;
        return [];
      });
      setPayment("cash");
      if (!silent) showToast("Order cleared");
    },
    [showToast]
  );

  const cartTotal = cart.reduce((sum, c) => sum + c.service.price * c.qty, 0);

  const selectPayment = useCallback((p: PaymentMethod) => setPayment(p), []);

  /* ─── CHECKOUT ─── */
  const checkout = useCallback(
    (customer: { name: string; phone: string; addr: string; type: "walkin" | "delivery"; pickup: string; amountPaid?: number }) => {
      if (cart.length === 0 || !session) return null;
      const total = cartTotal;
      const id = "ORD-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
      const time = new Date().toISOString();
      const isLater = payment === "later";
      // A partial/down-payment amount was typed in — clamp to [0, total].
      const typedAmount =
        customer.amountPaid !== undefined && customer.amountPaid !== null && !Number.isNaN(customer.amountPaid)
          ? Math.max(0, Math.min(total, customer.amountPaid))
          : undefined;
      const amountPaid = isLater ? typedAmount ?? 0 : typedAmount ?? total;
      const isPaid = amountPaid >= total && total > 0;
      const order: Order = {
        id,
        name: customer.name,
        phone: customer.phone,
        addr: customer.addr,
        type: customer.type,
        pickup: customer.pickup ? new Date(customer.pickup).toISOString() : null,
        items: cart.map((c) => ({ ...c })),
        total,
        payment,
        time,
        status: "washing",
        paid: isPaid,
        amountPaid,
        paidMethod: amountPaid > 0 ? (payment === "later" ? "cash" : (payment as any)) : null,
        paidAt: amountPaid > 0 ? time : null,
        shop: session.business,
      };
      // Build from the live ref, not from the `orders` captured in this
      // closure: the old code dropped any change made since the last render —
      // an order auto-advanced to Ready, or one that arrived from another
      // till, was silently reverted by the very next checkout.
      ordersRef.current = [order, ...ordersRef.current.filter((o) => o.id !== order.id)];
      setOrders(ordersRef.current);
      if (cloudActive) queueSaveOrder(session.userId, order);
      const balanceNote = !isPaid && amountPaid > 0 ? ` · ₱${amountPaid.toLocaleString()} paid, ₱${(total - amountPaid).toLocaleString()} balance` : !isPaid ? " (unpaid)" : "";
      showToast(`✅ ${id} placed for ${customer.name} · ₱${total.toLocaleString()}${balanceNote}`, "success");
      clearCart(true);
      return order;
    },
    [cart, cartTotal, payment, session, cloudActive, showToast, clearCart]
  );

  /**
   * Applies a change to one order.
   *
   * Works off `ordersRef` rather than a `setOrders` updater so we know
   * synchronously which row changed and can queue exactly that row for the
   * cloud. The ref is kept current both by render and by `applyOrders`, so a
   * burst of edits in a single tick still builds on each other instead of
   * each one overwriting the last.
   */
  const applyOrders = useCallback((next: Order[]) => {
    ordersRef.current = next;
    setOrders(next);
  }, []);

  const mutateOrder = useCallback(
    (id: string, fn: (o: Order) => Order) => {
      const prev = ordersRef.current;
      const target = prev.find((o) => o.id === id);
      if (!target) return;
      const updated = fn(target);
      if (updated === target) return;
      applyOrders(prev.map((o) => (o.id === id ? updated : o)));
      const s = sessionRef.current;
      if (s && cloudRef.current) queueSaveOrder(s.userId, updated);
    },
    [applyOrders]
  );

  const cancelOrder = useCallback(
    (id: string) => {
      mutateOrder(id, (o) => ({ ...o, status: "cancelled" }));
      showToast("Order cancelled", "error");
    },
    [mutateOrder, showToast]
  );

  const deleteOrder = useCallback(
    (id: string) => {
      applyOrders(ordersRef.current.filter((o) => o.id !== id));
      const s = sessionRef.current;
      if (s && cloudRef.current) queueDeleteOrder(s.userId, id);
      showToast("Order deleted", "error");
    },
    [applyOrders, showToast]
  );

  /**
   * "Clear Day" — removes every order from the current business day.
   *
   * This used to write the trimmed list straight to localStorage and then
   * `window.location.reload()`. In cloud mode that did nothing at all: the
   * rows were never deleted server-side, so boot fetched them straight back
   * and it looked like the button was broken. It also relied on a full page
   * reload to update the UI, which is what made a hard refresh feel necessary.
   */
  const clearDayOrders = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    const doomed = ordersRef.current.filter((o) => isBusinessToday(o.time));
    if (doomed.length === 0) {
      showToast("No orders from today to clear");
      return;
    }
    applyOrders(ordersRef.current.filter((o) => !isBusinessToday(o.time)));
    if (cloudRef.current) {
      cloudDeleteOrders(
        s.userId,
        doomed.map((o) => o.id)
      ).catch(() => {
        // Fall back to the per-order retry queue so the deletes still land.
        doomed.forEach((o) => queueDeleteOrder(s.userId, o.id));
      });
    }
    showToast(`Cleared ${doomed.length} order${doomed.length !== 1 ? "s" : ""} from today`, "success");
  }, [applyOrders, showToast]);

  const markOrderPaid = useCallback(
    (id: string, method: "cash" | "gcash" | "maya") => {
      mutateOrder(id, (o) =>
        o.paid ? o : { ...o, paid: true, amountPaid: o.total, paidMethod: method, paidAt: new Date().toISOString() }
      );
      const labels: any = { cash: "Cash", gcash: "GCash", maya: "Maya" };
      showToast(`${id} marked as paid · ${labels[method]}`);
    },
    [mutateOrder, showToast]
  );

  const addPartialPayment = useCallback(
    (id: string, amount: number, method: "cash" | "gcash" | "maya") => {
      if (!amount || amount <= 0) return;
      mutateOrder(id, (o) => {
        const nextAmountPaid = Math.min(o.total, (o.amountPaid || 0) + amount);
        const nowPaid = nextAmountPaid >= o.total;
        return {
          ...o,
          amountPaid: nextAmountPaid,
          paid: nowPaid,
          paidMethod: method,
          paidAt: o.paidAt || new Date().toISOString(),
        };
      });
      // Read back the row we just wrote, rather than the pre-mutation copy
      // from the render closure, so the balance in the toast is the real one.
      const order = ordersRef.current.find((o) => o.id === id);
      const remaining = order ? Math.max(0, order.total - (order.amountPaid || 0)) : 0;
      showToast(
        remaining > 0
          ? `${id}: ₱${amount.toLocaleString()} payment recorded · ₱${remaining.toLocaleString()} balance left`
          : `${id}: fully paid ✅`,
        "success"
      );
    },
    [mutateOrder, showToast]
  );

  const updateOrderStatus = useCallback(
    (id: string, status: OrderStatus) => {
      if (!STATUS_MAP[status]) return;
      mutateOrder(id, (o) => ({ ...o, status }));
      showToast(`${id} marked as ${STATUS_MAP[status].label}`);
    },
    [mutateOrder, showToast]
  );

  const updateOrderDetails = useCallback(
    (
      id: string,
      patch: {
        name: string;
        phone: string;
        addr: string;
        type: "walkin" | "delivery";
        pickup: string;
        items?: CartLine[];
        paid?: boolean;
        paidMethod?: "cash" | "gcash" | "maya" | null;
        amountPaid?: number;
      }
    ) => {
      mutateOrder(id, (o) => {
        const items = patch.items ?? o.items;
        const total = items.reduce((s, c) => s + c.service.price * c.qty, 0);
        let amountPaid = patch.amountPaid !== undefined ? Math.max(0, Math.min(total, patch.amountPaid)) : Math.min(o.amountPaid || 0, total);
        let paid = patch.paid ?? amountPaid >= total;
        if (paid) amountPaid = total;
        return {
          ...o,
          name: patch.name,
          phone: patch.phone,
          addr: patch.addr,
          type: patch.type,
          pickup: patch.pickup ? new Date(patch.pickup).toISOString() : null,
          items,
          total,
          paid,
          amountPaid,
          paidMethod: amountPaid > 0 ? patch.paidMethod ?? o.paidMethod ?? "cash" : null,
          paidAt: amountPaid > 0 ? o.paidAt ?? new Date().toISOString() : null,
        };
      });
      showToast(`${id} updated`, "success");
    },
    [mutateOrder, showToast]
  );

  /* ─── RECEIPT ─── */
  const showReceipt = useCallback((order: Order) => setReceiptOrder(order), []);
  const closeReceipt = useCallback(() => setReceiptOrder(null), []);

  const setPrinterWidth = useCallback((mm: number, h?: number) => {
    setPrinterMm(mm);
    setPrinterH(h || 0);
    localStorage.setItem(PRINTWIDTH_KEY, String(mm));
    localStorage.setItem(PRINTWIDTH_KEY + "_h", String(h || ""));
  }, []);

  /* ─── PAY SETTINGS ─── */
  // Persisting from inside the updater ran twice under StrictMode and fired a
  // duplicate network request per save. Compute the next value first, persist
  // once, then set state.
  const persistPay = useCallback((next: PaySettings) => {
    const s = sessionRef.current;
    paySettingsRef.current = next;
    persistPaySettings(s?.userId, next);
    if (s && cloudRef.current) {
      cloudSavePaySettings(s.userId, next).catch(() => {
        showToastRef.current?.("⚠️ Payment details saved on this device but not yet synced to the cloud.", "error");
      });
    }
    setPaySettings(next);
  }, []);

  const saveGcashMaya = useCallback(
    (method: "gcash" | "maya", number: string, qr?: string | null) => {
      const prev = paySettingsRef.current;
      persistPay({ ...prev, [method]: { qr: qr !== undefined ? qr : prev[method].qr, number } });
      showToast(`${method === "gcash" ? "GCash" : "Maya"} details saved`, "success");
    },
    [persistPay, showToast]
  );

  const clearPayMethod = useCallback(
    (method: "gcash" | "maya") => {
      persistPay({ ...paySettingsRef.current, [method]: { qr: null, number: "" } });
      showToast("Removed");
    },
    [persistPay, showToast]
  );

  /* ─── SMS TEMPLATES ─── */
  const persistSms = useCallback((next: SmsTemplates) => {
    const s = sessionRef.current;
    smsTemplatesRef.current = next;
    persistSmsTemplates(s?.userId, next);
    if (s && cloudRef.current) {
      cloudSaveSmsTemplates(s.userId, next).catch(() => {
        showToastRef.current?.("⚠️ Template saved on this device but not yet synced to the cloud.", "error");
      });
    }
    setSmsTemplates(next);
  }, []);

  const saveSmsTemplate = useCallback(
    (which: "paid" | "unpaid", value: string) => {
      const prev = smsTemplatesRef.current;
      persistSms({ ...prev, [which]: value.trim() || prev[which] });
      showToast(`${which === "paid" ? "Paid" : "Unpaid"} SMS template saved`, "success");
    },
    [persistSms, showToast]
  );

  const resetSmsTemplate = useCallback(
    (which: "paid" | "unpaid") => {
      persistSms({
        ...smsTemplatesRef.current,
        [which]: which === "paid" ? DEFAULT_SMS_TEMPLATE_PAID : DEFAULT_SMS_TEMPLATE_UNPAID,
      });
      showToast(`${which === "paid" ? "Paid" : "Unpaid"} SMS template reset to default`);
    },
    [persistSms, showToast]
  );

  const sendPickupSms = useCallback(
    (id: string) => {
      const o = orders.find((x) => x.id === id);
      if (!o) return;
      if (!o.phone) {
        showToast("No phone number on file for this order", "error");
        return;
      }
      const template = o.paid ? smsTemplates.paid : smsTemplates.unpaid;
      const message = template
        .replace(/\{name\}/g, o.name || "there")
        .replace(/\{orderId\}/g, o.id)
        .replace(/\{shop\}/g, session?.business || "WashHub Laundry")
        .replace(/\{total\}/g, "₱" + o.total.toLocaleString());
      const digits = o.phone.replace(/[^\d+]/g, "");
      const isIOS = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
      const sep = isIOS ? "&" : "?";
      window.location.href = `sms:${digits}${sep}body=${encodeURIComponent(message)}`;
      showToast(`📲 Opening Messages for ${o.name} · ${o.paid ? "paid" : "unpaid"} template`);
    },
    [orders, smsTemplates, session, showToast]
  );

  /* ─── VIEW ─── */
  const switchView = useCallback((v: ViewId) => setActiveView(v), []);

  // `getSession()` only ever returns legacy local sessions — it is null for a
  // cloud login, so notification state was silently never persisted for cloud
  // users. Persistence now runs from the effect keyed on `session`, which is
  // correct for both account types.
  const markNotificationsRead = useCallback(() => {
    setNotifications((prev) => (prev.every((n) => n.read) ? prev : prev.map((n) => ({ ...n, read: true }))));
  }, []);

  const clearNotifications = useCallback(() => {
    const s = sessionRef.current;
    setNotifications([]);
    if (s) {
      saveNotifications(s.userId, []);
      if (cloudRef.current) cloudClearNotifications(s.userId).catch(() => {});
    }
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const value: AppContextValue = {
    booted,
    loggedIn: !!session,
    session,
    authTab,
    setAuthTab,
    authError,
    setAuthError,
    register,
    login,
    forgotPassword,
    logout,
    cloudConfigured: isSupabaseConfigured(),
    cloudActive,
    pendingSync,
    refreshing,
    refreshFromCloud,
    legacyMatches,
    importLegacyAccount,
    importPastedOrders,
    theme,
    toggleTheme,
    toast,
    showToast,
    notifications,
    unreadCount,
    markNotificationsRead,
    clearNotifications,
    activeView,
    switchView,
    cart,
    addToCart,
    addCustomFee,
    changeQty,
    removeFromCart,
    clearCart,
    cartTotal,
    payment,
    selectPayment,
    orders,
    checkout,
    cancelOrder,
    deleteOrder,
    clearDayOrders,
    markOrderPaid,
    addPartialPayment,
    updateOrderStatus,
    updateOrderDetails,
    receiptOrder,
    showReceipt,
    closeReceipt,
    printerMm,
    printerH,
    setPrinterWidth,
    paySettings,
    saveGcashMaya,
    clearPayMethod,
    smsTemplates,
    saveSmsTemplate,
    resetSmsTemplate,
    sendPickupSms,
    salesPeriod,
    setSalesPeriod,
    salesOffset,
    setSalesOffset,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
