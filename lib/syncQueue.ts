import { Order } from "./types";
import { cloudDeleteOrder, cloudSaveOrder } from "./cloudStorage";

/* ══════════════════════════════════════════════════════════════════
   OUTBOX / RETRY QUEUE

   Every cloud write used to be fired as `cloudSaveOrder(...).catch(() => {})`
   — so if the network blipped, Supabase rate-limited, or the tab was
   offline for a moment, that order simply never reached the cloud and
   nobody was told. On the next device it looked like the order had
   vanished. That is the core "orders are not syncing properly" bug.

   Now every write goes through this queue instead:
     · it is persisted to localStorage immediately, so it survives a
       refresh, a crash, or the till being closed for the night;
     · it is retried with backoff, and again whenever the browser comes
       back online or the tab regains focus;
     · the pending count is observable, so the UI can show sync state.
   ══════════════════════════════════════════════════════════════════ */

const QUEUE_KEY = "sudsup_sync_queue_";
const MAX_ATTEMPTS = 8;

export type PendingOp =
  | { kind: "save"; orderId: string; order: Order; attempts: number; queuedAt: number }
  | { kind: "delete"; orderId: string; attempts: number; queuedAt: number };

type Listener = (pending: number) => void;

function keyFor(userId: string) {
  return QUEUE_KEY + userId;
}

function read(userId: string): PendingOp[] {
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(userId)) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function write(userId: string, ops: PendingOp[]) {
  try {
    if (ops.length === 0) localStorage.removeItem(keyFor(userId));
    else localStorage.setItem(keyFor(userId), JSON.stringify(ops));
  } catch {
    /* storage full / private mode — the in-memory queue still runs */
  }
}

const listeners = new Set<Listener>();
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function notify(userId: string) {
  const n = read(userId).length;
  listeners.forEach((l) => {
    try {
      l(n);
    } catch {
      /* a bad listener must not break the queue */
    }
  });
}

export function onPendingChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function pendingCount(userId: string): number {
  return read(userId).length;
}

/** The operations still waiting to upload, so a refetch can reconcile against them. */
export function pendingOps(userId: string): PendingOp[] {
  return read(userId);
}

/** Queues an order upsert. The newest write for an id replaces any older one. */
export function queueSaveOrder(userId: string, order: Order) {
  const ops = read(userId).filter((o) => o.orderId !== order.id);
  ops.push({ kind: "save", orderId: order.id, order, attempts: 0, queuedAt: Date.now() });
  write(userId, ops);
  notify(userId);
  void flushQueue(userId);
}

/** Queues an order delete, dropping any pending save for the same order. */
export function queueDeleteOrder(userId: string, orderId: string) {
  const ops = read(userId).filter((o) => o.orderId !== orderId);
  ops.push({ kind: "delete", orderId, attempts: 0, queuedAt: Date.now() });
  write(userId, ops);
  notify(userId);
  void flushQueue(userId);
}

/**
 * Drains the queue. Safe to call at any time and from anywhere — concurrent
 * calls collapse into the one in-flight drain.
 * Resolves to the number of operations still pending afterwards.
 */
export async function flushQueue(userId: string): Promise<number> {
  if (flushing || !userId) return read(userId).length;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    scheduleRetry(userId, 15000);
    return read(userId).length;
  }

  flushing = true;
  try {
    // Work against a snapshot; anything queued while we run stays queued.
    let ops = read(userId);
    const done = new Set<PendingOp>();
    const failed: PendingOp[] = [];

    for (const op of ops) {
      try {
        if (op.kind === "save") await cloudSaveOrder(userId, op.order);
        else await cloudDeleteOrder(userId, op.orderId);
        done.add(op);
      } catch {
        const attempts = op.attempts + 1;
        // Give up only after many tries, so a genuinely bad row (e.g. one
        // rejected by a schema constraint) can't block the whole queue
        // forever and stall every later order behind it.
        if (attempts < MAX_ATTEMPTS) failed.push({ ...op, attempts });
        else done.add(op);
      }
    }

    // Re-read: newer writes may have been queued while we were awaiting.
    const latest = read(userId);
    const doneIds = new Set(
      Array.from(done).map((o) => `${o.kind}:${o.orderId}:${o.queuedAt}`)
    );
    const remaining = latest.filter((o) => !doneIds.has(`${o.kind}:${o.orderId}:${o.queuedAt}`));
    // Carry forward the incremented attempt counts.
    const attemptsBy = new Map(failed.map((o) => [`${o.kind}:${o.orderId}:${o.queuedAt}`, o.attempts]));
    const merged = remaining.map((o) => {
      const a = attemptsBy.get(`${o.kind}:${o.orderId}:${o.queuedAt}`);
      return a === undefined ? o : { ...o, attempts: a };
    });

    write(userId, merged);
    notify(userId);

    if (merged.length > 0) {
      const worst = merged.reduce((m, o) => Math.max(m, o.attempts), 0);
      scheduleRetry(userId, Math.min(60000, 2000 * Math.pow(2, worst)));
    }
    return merged.length;
  } finally {
    flushing = false;
  }
}

function scheduleRetry(userId: string, delay: number) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushQueue(userId);
  }, delay);
}

export function stopRetries() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** Clears the queue for a user — used on sign-out. */
export function clearQueue(userId: string) {
  write(userId, []);
  notify(userId);
}
