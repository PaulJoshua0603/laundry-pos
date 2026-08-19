import { Session, User } from "./types";

/* ══════════════════════════════════════════════════════════
   Client-side account system backed by localStorage.

   IMPORTANT — READ THIS BEFORE GOING LIVE WITH REAL CUSTOMERS:
   This runs entirely in the browser. Accounts, password hashes and
   business data live in localStorage on each device — a device
   can't log in from a different phone/tablet, and clearing browser
   data deletes accounts + orders. Good enough for a single-shop /
   single-till deployment; swap this module for calls to Supabase,
   Firebase Auth, or your own API + bcrypt/argon2 before handling
   real customer payments at scale across multiple devices.
   ══════════════════════════════════════════════════════════ */

const AUTH_USERS_KEY = "sudsup_users";
const AUTH_SESSION_KEY = "sudsup_session";

export function getUsers(): User[] {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || "[]") || [];
  } catch {
    return [];
  }
}
export function saveUsers(users: User[]) {
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}
export function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}
export function setSession(session: Session) {
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}
export function clearSession() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

/* ─── PASSWORD HASHING (PBKDF2 via Web Crypto) ─── */
function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}
export async function hashPassword(password: string, saltHex?: string) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function makeUserId() {
  return "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function toSession(user: User): Session {
  return { userId: user.id, name: user.name, email: user.email, business: user.business };
}
