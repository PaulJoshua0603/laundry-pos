import { BUSINESS_DAY_START_HOUR, getBusinessDayKey } from "./types";

// Re-exported so existing callers keep importing these from lib/format.
export { BUSINESS_DAY_START_HOUR, getBusinessDayKey };

export function peso(n: number): string {
  return `₱${Math.round(n).toLocaleString()}`;
}

export function initialsOf(name: string): string {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  );
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

// Business-day helpers. The boundary itself lives in lib/types, next to the
// shop hours it derives from, and is re-exported at the top of this file.

/**
 * The instant the business day beginning on this calendar date starts.
 *
 * Sales Tracking used raw midnight-to-midnight ranges while Orders, Daily
 * Orders, Summary and the Sidebar all used the business day, so a load taken
 * at 2AM landed in different buckets depending on which screen you looked at.
 * Every period boundary now goes through here.
 */
export function businessDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), BUSINESS_DAY_START_HOUR, 0, 0, 0);
}


export function isBusinessToday(iso: string): boolean {
  return getBusinessDayKey(iso) === getBusinessDayKey(new Date().toISOString());
}

export function businessDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const todayKey = getBusinessDayKey(new Date().toISOString());
  const yestDate = new Date();
  yestDate.setDate(yestDate.getDate() - 1);
  const yestKey = getBusinessDayKey(yestDate.toISOString());
  const fullDate = date.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
  if (key === todayKey) return `Today (${fullDate})`;
  if (key === yestKey) return `Yesterday (${fullDate})`;
  return date.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
