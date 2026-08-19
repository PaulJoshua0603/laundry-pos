"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AUTO_READY_MS,
  CartLine,
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

export type ViewId = "pos" | "orders" | "summary" | "sales" | "payments";
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
  }) => Order | null;
  cancelOrder: (id: string) => void;
  deleteOrder: (id: string) => void;
  markOrderPaid: (id: string, method: "cash" | "gcash" | "maya") => void;
  updateOrderStatus: (id: string, status: OrderStatus) => void;

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
  salesPeriod: "week" | "month" | "year";
  setSalesPeriod: (p: "week" | "month" | "year") => void;
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
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplates>(loadSmsTemplates());
  const [salesPeriod, setSalesPeriod] = useState<"week" | "month" | "year">("week");
  const [salesOffset, setSalesOffset] = useState(0);

  const toastTimer = useRef<any>(null);

  const showToast = useCallback((msg: string, type: ToastType = "") => {
    setToast({ msg, type, key: Date.now() });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);

    setNotifications((prev) => {
      const entry: NotificationEntry = {
        id: "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        message: msg,
        type,
        time: new Date().toISOString(),
        read: false,
      };
      const next = [entry, ...prev].slice(0, 200);
      const s = getSession();
      if (s) saveNotifications(s.userId, next);
      return next;
    });
  }, []);

  /* ─── BOOT: restore theme + session ─── */
  useEffect(() => {
    try {
      const savedTheme = (localStorage.getItem(THEME_KEY) as "dark" | "light") || null;
      const theme = savedTheme || (window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark");
      setTheme(theme);
      document.documentElement.setAttribute("data-theme", theme);

      const savedMm = parseInt(localStorage.getItem(PRINTWIDTH_KEY) || "", 10) || 58;
      const savedH = parseInt(localStorage.getItem(PRINTWIDTH_KEY + "_h") || "", 10) || 210;
      setPrinterMm(savedMm);
      setPrinterH(savedH);

      const s = getSession();
      if (s && getUsers().some((u) => u.id === s.userId)) {
        setSessionState(s);
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
  }, []);

  /* ─── Auto-advance washing/drying -> ready after 1hr ─── */
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      setOrders((prev) => {
        const now = Date.now();
        let changed = false;
        const next = prev.map((o) => {
          if ((o.status === "washing" || o.status === "drying") && now - new Date(o.time).getTime() >= AUTO_READY_MS) {
            changed = true;
            return { ...o, status: "ready" as OrderStatus, autoReady: true };
          }
          return o;
        });
        if (changed) {
          saveOrders(session.userId, next);
          showToast("✅ An order was auto-marked Ready for Pickup (1 hr elapsed)", "success");
          return next;
        }
        return prev;
      });
    };
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [session, showToast]);

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
      const users = getUsers();
      const user = users.find((u) => u.email === email);
      if (!user) {
        setAuthError("No account found with that email.");
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
      setOrders(loadOrders(sess.userId));
      setNotifications(loadNotifications(sess.userId));
      setPaySettings(loadPaySettings(sess.userId));
      setSmsTemplates(loadSmsTemplates(sess.userId));
      showToast(`Welcome back, ${user.name.split(" ")[0]}!`, "success");
      return true;
    },
    [showToast]
  );

  const forgotPassword = useCallback(async (data: { email: string; pass: string; pass2: string }) => {
    const email = data.email.trim().toLowerCase();
    if (!isValidEmail(email)) return { ok: false, msg: "Enter a valid email address." };
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
    authClearSession();
    setSessionState(null);
    setOrders([]);
    setCart([]);
    setNotifications([]);
    setActiveView("pos");
    showToast("Signed out");
  }, [showToast]);

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
        id: `fee-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
    (customer: { name: string; phone: string; addr: string; type: "walkin" | "delivery"; pickup: string }) => {
      if (cart.length === 0 || !session) return null;
      const total = cartTotal;
      const id = "ORD-" + String(orders.length + 1).padStart(4, "0");
      const time = new Date().toISOString();
      const isPaid = payment !== "later";
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
        paidMethod: isPaid ? (payment as any) : null,
        paidAt: isPaid ? time : null,
        shop: session.business,
      };
      const next = [order, ...orders];
      setOrders(next);
      saveOrders(session.userId, next);
      showToast(`✅ ${id} placed for ${customer.name} · ₱${total.toLocaleString()}${!isPaid ? " (unpaid)" : ""}`, "success");
      clearCart(true);
      return order;
    },
    [cart, cartTotal, orders, payment, session, showToast, clearCart]
  );

  const mutateOrder = useCallback(
    (id: string, fn: (o: Order) => Order) => {
      setOrders((prev) => {
        const next = prev.map((o) => (o.id === id ? fn(o) : o));
        if (session) saveOrders(session.userId, next);
        return next;
      });
    },
    [session]
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
      setOrders((prev) => {
        const next = prev.filter((o) => o.id !== id);
        if (session) saveOrders(session.userId, next);
        return next;
      });
      showToast("Order deleted", "error");
    },
    [session, showToast]
  );

  const markOrderPaid = useCallback(
    (id: string, method: "cash" | "gcash" | "maya") => {
      mutateOrder(id, (o) => (o.paid ? o : { ...o, paid: true, paidMethod: method, paidAt: new Date().toISOString() }));
      const labels: any = { cash: "Cash", gcash: "GCash", maya: "Maya" };
      showToast(`${id} marked as paid · ${labels[method]}`);
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
  const saveGcashMaya = useCallback(
    (method: "gcash" | "maya", number: string, qr?: string | null) => {
      setPaySettings((prev) => {
        const next = { ...prev, [method]: { qr: qr !== undefined ? qr : prev[method].qr, number } };
        persistPaySettings(session?.userId, next);
        return next;
      });
      showToast(`${method === "gcash" ? "GCash" : "Maya"} details saved`, "success");
    },
    [session, showToast]
  );

  const clearPayMethod = useCallback(
    (method: "gcash" | "maya") => {
      setPaySettings((prev) => {
        const next = { ...prev, [method]: { qr: null, number: "" } };
        persistPaySettings(session?.userId, next);
        return next;
      });
      showToast("Removed");
    },
    [session, showToast]
  );

  /* ─── SMS TEMPLATES ─── */
  const saveSmsTemplate = useCallback(
    (which: "paid" | "unpaid", value: string) => {
      setSmsTemplates((prev) => {
        const next = { ...prev, [which]: value.trim() || prev[which] };
        persistSmsTemplates(session?.userId, next);
        return next;
      });
      showToast(`${which === "paid" ? "Paid" : "Unpaid"} SMS template saved`, "success");
    },
    [session, showToast]
  );

  const resetSmsTemplate = useCallback(
    (which: "paid" | "unpaid") => {
      const { DEFAULT_SMS_TEMPLATE_PAID, DEFAULT_SMS_TEMPLATE_UNPAID } = require("@/lib/types");
      setSmsTemplates((prev) => {
        const next = { ...prev, [which]: which === "paid" ? DEFAULT_SMS_TEMPLATE_PAID : DEFAULT_SMS_TEMPLATE_UNPAID };
        persistSmsTemplates(session?.userId, next);
        return next;
      });
      showToast(`${which === "paid" ? "Paid" : "Unpaid"} SMS template reset to default`);
    },
    [session, showToast]
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

  const markNotificationsRead = useCallback(() => {
    setNotifications((prev) => {
      if (prev.every((n) => n.read)) return prev;
      const next = prev.map((n) => ({ ...n, read: true }));
      const s = getSession();
      if (s) saveNotifications(s.userId, next);
      return next;
    });
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    const s = getSession();
    if (s) saveNotifications(s.userId, []);
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
    markOrderPaid,
    updateOrderStatus,
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
